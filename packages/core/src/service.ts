import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import {
  formatProxyUrl,
  parseProxyUrl,
  PpbError,
  resolveParams,
  type ClickInput,
  type CreateProfileInput,
  type CreateProxyInput,
  type EvaluateInput,
  type GotoInput,
  type Locator as WfLocator,
  type NewPageInput,
  type PageInfo,
  type PageRefInput,
  type PpbApi,
  type PressInput,
  type Profile,
  type Proxy,
  type ProxyCheck,
  type RecordingResult,
  type RunWorkflowInput,
  type RuntimeInfo,
  type ScreenshotInput,
  type ScreenshotResult,
  type SnapshotResult,
  type StartProfileInput,
  type SystemStatus,
  type TypeInput,
  type UpdateProfileInput,
  type UpdateProxyInput,
  type WaitForInput,
  type Workflow,
  type WorkflowDefinition,
  type WorkflowRunResult,
  type WorkflowSummary,
} from "@ppb/shared";
import * as engine from "./camoufox.ts";
import { openDb } from "./db.ts";
import { Forwarder } from "./forwarder.ts";
import { describeTarget } from "./locator.ts";
import { usageByProfileDir } from "./metrics.ts";
import { ensureDirs, profileDir, type Paths } from "./paths.ts";
import { Recorder } from "./recorder.ts";
import { runSteps } from "./runner.ts";
import { locate, normalizeUrl, Session } from "./session.ts";
import type { Page } from "playwright-core";
import { Store, type ProfileRow, type ProxyRow, type WorkflowRow } from "./store.ts";

export interface ServiceOptions {
  paths: Paths;
  version: string;
  /** Maximum number of profiles running at once. */
  maxRunning: number;
}

type Transition = { status: "starting" | "stopping" } | { status: "error"; error: string };

export class CoreService implements PpbApi {
  readonly #paths: Paths;
  readonly #version: string;
  readonly #maxRunning: number;
  readonly #db: DatabaseSync;
  readonly #store: Store;
  readonly #sessions = new Map<string, Session>();
  readonly #transitions = new Map<string, Transition>();
  readonly #pending = new Map<string, Promise<unknown>>();

  constructor(options: ServiceOptions) {
    this.#paths = options.paths;
    this.#version = options.version;
    this.#maxRunning = options.maxRunning;
    ensureDirs(options.paths);
    this.#db = openDb(options.paths.db);
    this.#store = new Store(this.#db);
  }

  async status(): Promise<SystemStatus> {
    return {
      version: this.#version,
      dataDir: this.#paths.root,
      running: this.#sessions.size,
      maxRunning: this.#maxRunning,
      camoufox: engine.engineStatus(),
      hostPlatform: process.platform,
    };
  }

  // ── profiles ────────────────────────────────────────────────────────────

  async listProfiles(): Promise<Profile[]> {
    const rows = this.#store.listProfiles();
    return this.#views(rows);
  }

  async getProfile(ref: string): Promise<Profile> {
    return (await this.#views([this.#profile(ref)]))[0]!;
  }

  async createProfile(input: CreateProfileInput): Promise<Profile> {
    this.#assertProfileNameFree(input.name);
    const proxyId = input.proxyId ? this.#proxy(input.proxyId).id : null;
    const now = new Date().toISOString();
    const { identity, fingerprint } = await engine.generateIdentity(input.os);
    const row: ProfileRow = {
      id: newId(),
      name: input.name,
      group: input.group || null,
      notes: input.notes || null,
      proxyId,
      identity,
      lastIp: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    };
    this.#store.insertProfile(row, fingerprint);
    return this.getProfile(row.id);
  }

  async updateProfile(ref: string, input: UpdateProfileInput): Promise<Profile> {
    const row = this.#profile(ref);
    if (input.name && input.name !== row.name) this.#assertProfileNameFree(input.name);
    this.#store.updateProfile(row.id, {
      name: input.name,
      group: input.group === undefined ? undefined : input.group || null,
      notes: input.notes === undefined ? undefined : input.notes || null,
      proxyId:
        input.proxyId === undefined
          ? undefined
          : input.proxyId
            ? this.#proxy(input.proxyId).id
            : null,
    });
    return this.getProfile(row.id);
  }

  async deleteProfile(ref: string): Promise<void> {
    const row = this.#profile(ref);
    if (this.#sessions.has(row.id) || this.#transitions.get(row.id)?.status === "starting") {
      throw new PpbError("CONFLICT", `Profile ${row.name} is running; stop it first`);
    }
    this.#store.deleteProfile(row.id);
    this.#transitions.delete(row.id);
    await rm(profileDir(this.#paths, row.id), { recursive: true, force: true });
  }

  startProfile(ref: string, input: StartProfileInput = {}): Promise<Profile> {
    const row = this.#profile(ref);
    return this.#serialize(row.id, async () => {
      if (!this.#sessions.has(row.id)) await this.#launch(row.id, input.headless ?? false);
      return this.getProfile(row.id);
    });
  }

  stopProfile(ref: string): Promise<Profile> {
    const row = this.#profile(ref);
    return this.#serialize(row.id, async () => {
      const session = this.#sessions.get(row.id);
      if (session) {
        this.#transitions.set(row.id, { status: "stopping" });
        this.#sessions.delete(row.id);
        await session.close();
      }
      this.#transitions.delete(row.id);
      return this.getProfile(row.id);
    });
  }

  /** Stops every running profile; used on daemon shutdown. */
  async shutdown(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.all(sessions.map((s) => s.close()));
    this.#db.close();
  }

  async #launch(profileId: string, headless: boolean): Promise<void> {
    if (this.#sessions.size >= this.#maxRunning) {
      throw new PpbError(
        "LIMIT_REACHED",
        `${this.#sessions.size}/${this.#maxRunning} profiles already running; stop one or raise --max-running`,
      );
    }
    this.#transitions.set(profileId, { status: "starting" });
    let forwarder: Forwarder | null = null;
    try {
      const row = this.#store.findProfile(profileId)!;
      let { identity } = row;
      let fingerprint = this.#store.profileFingerprint(profileId);
      if (!fingerprint) {
        // A profile from before the move to the official camoufox package: its old fingerprint cannot be
        // replayed, so it gets a new one, once. Cookies and storage are untouched.
        const fresh = await engine.generateIdentity(row.identity.os);
        this.#store.updateProfile(profileId, fresh);
        ({ identity, fingerprint } = fresh);
      }
      const proxy = row.proxyId ? this.#store.findProxy(row.proxyId) : null;
      if (proxy) forwarder = await Forwarder.start(proxy.url);

      let geo: engine.Geo;
      try {
        geo = await engine.resolveGeo(forwarder?.url ?? null, identity);
      } catch (error) {
        throw proxy
          ? new PpbError(
              "PROXY_DOWN",
              `Proxy ${proxy.name} is not reachable: ${errorMessage(error)}`,
              { cause: error },
            )
          : new PpbError("ENGINE_ERROR", `Could not resolve public IP: ${errorMessage(error)}`, {
              cause: error,
            });
      }

      await engine.installEngine();
      const context = await engine.launch({
        userDataDir: profileDir(this.#paths, profileId),
        identity,
        fingerprint,
        proxyUrl: forwarder?.url ?? null,
        geo,
        headless,
      });
      const session = new Session({ context, forwarder, headless, ip: geo.ip });
      this.#sessions.set(profileId, session);
      // The user closing the browser window ends the session.
      context.on("close", () => {
        if (this.#sessions.get(profileId) !== session) return;
        this.#sessions.delete(profileId);
        void session.forwarder?.close();
      });

      this.#store.updateProfile(profileId, {
        identity:
          identity.locale?.country === geo.country
            ? undefined
            : { ...identity, locale: { country: geo.country, value: geo.locale } },
        lastIp: geo.ip,
        lastOpenedAt: new Date().toISOString(),
      });
      this.#transitions.delete(profileId);
    } catch (error) {
      await forwarder?.close().catch(() => undefined);
      this.#transitions.set(profileId, { status: "error", error: errorMessage(error) });
      throw error instanceof PpbError
        ? error
        : new PpbError("ENGINE_ERROR", errorMessage(error), { cause: error });
    }
  }

  // ── proxies ─────────────────────────────────────────────────────────────

  async listProxies(): Promise<Proxy[]> {
    const counts = this.#store.profileCountByProxy();
    return this.#store.listProxies().map((row) => proxyView(row, counts.get(row.id) ?? 0));
  }

  async createProxy(input: CreateProxyInput): Promise<Proxy> {
    const parsed = parseProxyUrl(input.url);
    const name = input.name ?? `${parsed.host}-${parsed.port}`;
    if (this.#store.findProxy(name))
      throw new PpbError("CONFLICT", `Proxy name ${name} is already taken`);
    const row: ProxyRow = {
      id: newId(),
      name,
      url: formatProxyUrl(parsed),
      createdAt: new Date().toISOString(),
      lastCheck: null,
    };
    this.#store.insertProxy(row);
    return proxyView(row, 0);
  }

  async updateProxy(ref: string, input: UpdateProxyInput): Promise<Proxy> {
    const row = this.#proxy(ref);
    if (input.name && input.name !== row.name && this.#store.findProxy(input.name)) {
      throw new PpbError("CONFLICT", `Proxy name ${input.name} is already taken`);
    }
    const url = input.url === undefined ? undefined : formatProxyUrl(parseProxyUrl(input.url));
    this.#store.updateProxy(row.id, { name: input.name, url, lastCheck: url ? null : undefined });
    const updated = this.#store.findProxy(row.id)!;
    return proxyView(updated, this.#store.profileCountByProxy().get(row.id) ?? 0);
  }

  async deleteProxy(ref: string): Promise<void> {
    const row = this.#proxy(ref);
    const count = this.#store.profileCountByProxy().get(row.id) ?? 0;
    if (count > 0)
      throw new PpbError("CONFLICT", `Proxy ${row.name} is used by ${count} profile(s)`);
    this.#store.deleteProxy(row.id);
  }

  async importProxies(
    text: string,
  ): Promise<{ created: Proxy[]; errors: { line: number; error: string }[] }> {
    const created: Proxy[] = [];
    const errors: { line: number; error: string }[] = [];
    const lines = text.split(/\r?\n/);
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      try {
        created.push(await this.createProxy({ url: line }));
      } catch (error) {
        errors.push({ line: index + 1, error: errorMessage(error) });
      }
    }
    return { created, errors };
  }

  async checkProxy(ref: string): Promise<ProxyCheck> {
    const row = this.#proxy(ref);
    const forwarder = await Forwarder.start(row.url);
    const startedAt = performance.now();
    let check: ProxyCheck;
    try {
      const geo = await engine.resolveGeo(forwarder.url);
      check = {
        ok: true,
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        ip: geo.ip,
        country: geo.country,
        timezone: geo.timezone,
        locale: geo.locale,
      };
    } catch (error) {
      check = { ok: false, checkedAt: new Date().toISOString(), error: errorMessage(error) };
    } finally {
      await forwarder.close();
    }
    this.#store.updateProxy(row.id, { lastCheck: check });
    return check;
  }

  // ── pages ───────────────────────────────────────────────────────────────

  async listPages(ref: string): Promise<PageInfo[]> {
    return this.#session(ref).listPages();
  }

  async newPage(ref: string, input: NewPageInput = {}): Promise<PageInfo> {
    const session = this.#session(ref);
    const page = await session.newPage();
    if (input.url) await page.goto(normalizeUrl(input.url), { waitUntil: "domcontentloaded" });
    const info = await session.info(page);
    if (session.recorder && input.url) {
      session.recorder.add(info.pageId, { do: "goto", url: normalizeUrl(input.url) });
    }
    return info;
  }

  async closePage(ref: string, pageId: string): Promise<void> {
    await this.#session(ref).closePage(pageId);
  }

  async goto(ref: string, input: GotoInput): Promise<PageInfo> {
    return this.#onPage(ref, input.pageId, async (page) => {
      await page.goto(normalizeUrl(input.url), { waitUntil: "domcontentloaded" });
      const session = this.#session(ref);
      if (session.recorder) {
        const info = await session.info(page);
        session.recorder.add(info.pageId, { do: "goto", url: normalizeUrl(input.url) });
      }
    });
  }

  async snapshot(ref: string, input: PageRefInput = {}): Promise<SnapshotResult> {
    const session = this.#session(ref);
    const page = await session.page(input.pageId);
    const snapshot = await page.ariaSnapshot({ mode: "ai" });
    session.rememberSnapshot(page, snapshot);
    const info = await session.info(page);
    return { pageId: info.pageId, url: info.url, title: info.title, snapshot };
  }

  async click(ref: string, input: ClickInput): Promise<PageInfo> {
    return this.#onPage(ref, input.pageId, async (page) => {
      const session = this.#session(ref);
      const recTarget = session.recorder
        ? await this.#recordTarget(session, page, input.target, "click")
        : null;
      await locate(page, input.target).click();
      if (session.recorder && recTarget) {
        const info = await session.info(page);
        session.recorder.add(info.pageId, { do: "click", target: recTarget });
      }
    });
  }

  async type(ref: string, input: TypeInput): Promise<PageInfo> {
    return this.#onPage(ref, input.pageId, async (page) => {
      const session = this.#session(ref);
      const recTarget = session.recorder
        ? await this.#recordTarget(session, page, input.target, "type")
        : null;
      const field = locate(page, input.target);
      await field.fill(input.text);
      if (input.submit) await field.press("Enter");
      if (session.recorder && recTarget) {
        const info = await session.info(page);
        session.recorder.add(info.pageId, {
          do: "type",
          target: recTarget,
          text: input.text,
          ...(input.submit ? { submit: true } : {}),
        });
      }
    });
  }

  async press(ref: string, input: PressInput): Promise<PageInfo> {
    return this.#onPage(ref, input.pageId, async (page) => {
      await page.keyboard.press(input.key);
      const session = this.#session(ref);
      if (session.recorder) {
        const info = await session.info(page);
        session.recorder.add(info.pageId, { do: "press", key: input.key });
      }
    });
  }

  async screenshot(ref: string, input: ScreenshotInput = {}): Promise<ScreenshotResult> {
    const session = this.#session(ref);
    const page = await session.page(input.pageId);
    const buffer = await page.screenshot({ type: "png", fullPage: input.fullPage ?? false });
    return {
      pageId: (await session.info(page)).pageId,
      mimeType: "image/png",
      data: buffer.toString("base64"),
    };
  }

  async evaluate(ref: string, input: EvaluateInput): Promise<{ pageId: string; result: unknown }> {
    const session = this.#session(ref);
    const page = await session.page(input.pageId);
    const result: unknown = await page.evaluate(input.expression);
    if (session.recorder) session.recorder.note("evaluate is not recordable; step omitted");
    return { pageId: (await session.info(page)).pageId, result };
  }

  async waitFor(ref: string, input: WaitForInput): Promise<PageInfo> {
    return this.#onPage(ref, input.pageId, async (page) => {
      const session = this.#session(ref);
      const recTarget =
        session.recorder && input.selector
          ? await this.#recordTarget(session, page, input.selector, "wait_for")
          : null;
      const timeout = input.timeoutMs;
      if (input.text)
        await page.getByText(input.text).first().waitFor({ state: "visible", timeout });
      else if (input.selector)
        await locate(page, input.selector).first().waitFor({ state: "visible", timeout });
      else await page.waitForTimeout(timeout ?? 1000);
      if (session.recorder) {
        const info = await session.info(page);
        if (input.text) {
          session.recorder.add(info.pageId, {
            do: "wait_for",
            text: input.text,
            ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
          });
        } else if (recTarget) {
          session.recorder.add(info.pageId, {
            do: "wait_for",
            target: recTarget,
            ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
          });
        } else if (!input.selector) {
          session.recorder.add(info.pageId, {
            do: "wait_for",
            timeoutMs: timeout ?? 1000,
          });
        }
      }
    });
  }

  // ── workflows ───────────────────────────────────────────────────────────

  async listWorkflows(): Promise<WorkflowSummary[]> {
    return this.#store.listWorkflows().map((row) => this.#workflowSummary(row));
  }

  async getWorkflow(ref: string): Promise<Workflow> {
    return this.#workflowView(this.#workflow(ref));
  }

  async saveWorkflow(definition: WorkflowDefinition): Promise<Workflow> {
    const json = JSON.stringify(definition);
    const now = new Date().toISOString();
    const existing = this.#store.findWorkflow(definition.name);
    if (!existing) {
      this.#store.insertWorkflow({ id: newId(), name: definition.name, createdAt: now }, json);
    } else if (existing.definitionJson !== json) {
      this.#store.addWorkflowVersion(existing.id, existing.version + 1, json, now);
    }
    return this.getWorkflow(definition.name);
  }

  async deleteWorkflow(ref: string): Promise<void> {
    const row = this.#workflow(ref);
    this.#store.deleteWorkflow(row.id);
  }

  async runWorkflow(ref: string, input: RunWorkflowInput): Promise<WorkflowRunResult> {
    const row = this.#workflow(ref);
    const params = resolveParams(row.definition.params, input.params ?? {});
    const profile = this.#profile(input.profile);
    const start = performance.now();

    if (!this.#sessions.has(profile.id)) {
      await this.startProfile(profile.id, { headless: input.headless ?? true });
    }
    const session = this.#session(profile.id);
    const opened = !input.pageId;
    const page = opened ? await session.newPage() : await session.page(input.pageId);

    const outcome = await runSteps(page, row.definition, params);

    let snapshot: string | undefined;
    if (outcome.status !== "succeeded") {
      snapshot = await page.ariaSnapshot({ mode: "ai" }).catch(() => undefined);
      if (snapshot !== undefined) session.rememberSnapshot(page, snapshot);
    }

    const info = await session.info(page);
    if (opened && !input.keepPage && outcome.status !== "needs_agent") {
      await page.close().catch(() => undefined);
    }

    return {
      workflow: row.name,
      version: row.version,
      profile: profile.name,
      pageId: info.pageId,
      status: outcome.status,
      ...(outcome.failedStep ? { failedStep: outcome.failedStep } : {}),
      outputs: outcome.outputs,
      screenshots: outcome.screenshots,
      log: outcome.log,
      ...(snapshot !== undefined ? { snapshot } : {}),
      durationMs: Math.round(performance.now() - start),
    };
  }

  async startRecording(ref: string): Promise<void> {
    const session = this.#session(ref);
    if (session.recorder) {
      const row = this.#profile(ref);
      throw new PpbError("CONFLICT", `Profile ${row.name} is already recording`);
    }
    session.recorder = new Recorder();
  }

  async stopRecording(ref: string): Promise<RecordingResult> {
    const session = this.#session(ref);
    if (!session.recorder) {
      const row = this.#profile(ref);
      throw new PpbError("CONFLICT", `Profile ${row.name} is not recording`);
    }
    const result = session.recorder.finish();
    session.recorder = null;
    return result;
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  async #recordTarget(
    session: Session,
    page: Page,
    target: string,
    action: string,
  ): Promise<WfLocator | null> {
    const result = await describeTarget(page, session.lastSnapshot(page), target);
    if ("warning" in result) {
      session.recorder?.skip(action, target, result.warning);
      return null;
    }
    return result;
  }

  #workflow(ref: string): WorkflowRow {
    const row = this.#store.findWorkflow(ref);
    if (!row) throw new PpbError("NOT_FOUND", `No workflow ${ref}`);
    return row;
  }

  #workflowSummary(row: WorkflowRow): WorkflowSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.definition.description ?? null,
      version: row.version,
      params: row.definition.params,
      stepCount: row.definition.steps.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  #workflowView(row: WorkflowRow): Workflow {
    return { ...this.#workflowSummary(row), definition: row.definition };
  }

  async #onPage(
    ref: string,
    pageId: string | undefined,
    action: (page: Page) => Promise<unknown>,
  ): Promise<PageInfo> {
    const session = this.#session(ref);
    const page = await session.page(pageId);
    try {
      await action(page);
    } catch (error) {
      if (error instanceof PpbError) throw error;
      throw new PpbError("ENGINE_ERROR", errorMessage(error), { cause: error });
    }
    return session.info(page);
  }

  #session(ref: string): Session {
    const row = this.#profile(ref);
    const session = this.#sessions.get(row.id);
    if (!session) throw new PpbError("NOT_RUNNING", `Profile ${row.name} is not running`);
    return session;
  }

  #profile(ref: string): ProfileRow {
    const row = this.#store.findProfile(ref);
    if (!row) throw new PpbError("NOT_FOUND", `No profile ${ref}`);
    return row;
  }

  #proxy(ref: string): ProxyRow {
    const row = this.#store.findProxy(ref);
    if (!row) throw new PpbError("NOT_FOUND", `No proxy ${ref}`);
    return row;
  }

  #assertProfileNameFree(name: string): void {
    if (this.#store.findProfile(name))
      throw new PpbError("CONFLICT", `Profile name ${name} is already taken`);
  }

  /** Start/stop for one profile run one at a time so concurrent callers see a consistent state. */
  #serialize<T>(profileId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#pending.get(profileId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.#pending.set(profileId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.#pending.get(profileId) === next) this.#pending.delete(profileId);
      });
    return next;
  }

  async #views(rows: ProfileRow[]): Promise<Profile[]> {
    const proxies = new Map(this.#store.listProxies().map((p) => [p.id, p]));
    const firefoxMajor = engine.engineStatus().version?.split(".", 1)[0];
    const running = rows.filter((r) => this.#sessions.has(r.id));
    const usage = await usageByProfileDir(running.map((r) => profileDir(this.#paths, r.id)));
    return rows.map((row) => {
      const proxy = row.proxyId ? proxies.get(row.proxyId) : undefined;
      return {
        id: row.id,
        name: row.name,
        group: row.group,
        notes: row.notes,
        proxy: proxy ? { id: proxy.id, name: proxy.name } : null,
        identity: engine.summarize(row.identity, firefoxMajor),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastOpenedAt: row.lastOpenedAt,
        runtime: this.#runtime(row, usage.get(profileDir(this.#paths, row.id))),
      };
    });
  }

  #runtime(row: ProfileRow, usage: { pid: number; memoryMb: number } | undefined): RuntimeInfo {
    const session = this.#sessions.get(row.id);
    const transition = this.#transitions.get(row.id);
    return {
      status: transition?.status ?? (session ? "running" : "stopped"),
      headless: session?.headless ?? false,
      startedAt: session?.startedAt ?? null,
      pid: usage?.pid ?? null,
      memoryMb: usage?.memoryMb ?? null,
      pageCount: session?.pageCount ?? 0,
      lastError: transition?.status === "error" ? transition.error : null,
      ip: session?.ip ?? row.lastIp,
    };
  }
}

function proxyView(row: ProxyRow, profileCount: number): Proxy {
  const parsed = parseProxyUrl(row.url);
  return {
    id: row.id,
    name: row.name,
    url: formatProxyUrl(parsed, { maskPassword: true }),
    scheme: parsed.scheme,
    host: parsed.host,
    port: parsed.port,
    hasAuth: parsed.username !== null,
    createdAt: row.createdAt,
    lastCheck: row.lastCheck,
    profileCount,
  };
}

const newId = () => randomBytes(5).toString("hex");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
