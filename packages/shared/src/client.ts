import * as z from "zod";
import { PpbError, type ErrorCode } from "./errors.ts";
import type {
  ClickInput,
  CreateProfileInput,
  CreateProxyInput,
  EvaluateInput,
  GotoInput,
  NewPageInput,
  PageRefInput,
  PressInput,
  ScreenshotInput,
  StartProfileInput,
  TypeInput,
  UpdateProfileInput,
  UpdateProxyInput,
  WaitForInput,
} from "./schemas.ts";
import type {
  PageInfo,
  PpbApi,
  Profile,
  Proxy,
  ProxyCheck,
  RecordingResult,
  ScreenshotResult,
  SnapshotResult,
  SystemStatus,
  Workflow,
  WorkflowRunResult,
  WorkflowSummary,
} from "./types.ts";
import type { RunWorkflowInput, WorkflowDefinition } from "./workflow.ts";

export interface PpbClientOptions {
  /** Daemon origin, e.g. http://127.0.0.1:7777. Empty string means same origin (web UI). */
  baseUrl: string;
  token: string | null;
  fetch?: typeof fetch;
}

/** Typed client for the daemon REST API; used by the CLI, the stdio MCP bridge and the web UI. */
export class PpbClient implements PpbApi {
  readonly #baseUrl: string;
  readonly #token: string | null;
  readonly #fetch: typeof fetch;

  constructor(options: PpbClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#token = options.token;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  status(): Promise<SystemStatus> {
    return this.#call("GET", "/api/status");
  }

  listProfiles(): Promise<Profile[]> {
    return this.#call("GET", "/api/profiles");
  }
  getProfile(ref: string): Promise<Profile> {
    return this.#call("GET", profilePath(ref));
  }
  createProfile(input: CreateProfileInput): Promise<Profile> {
    return this.#call("POST", "/api/profiles", input);
  }
  updateProfile(ref: string, input: UpdateProfileInput): Promise<Profile> {
    return this.#call("PATCH", profilePath(ref), input);
  }
  deleteProfile(ref: string): Promise<void> {
    return this.#call("DELETE", profilePath(ref));
  }
  startProfile(ref: string, input: StartProfileInput = {}): Promise<Profile> {
    return this.#call("POST", `${profilePath(ref)}/start`, input);
  }
  stopProfile(ref: string): Promise<Profile> {
    return this.#call("POST", `${profilePath(ref)}/stop`, {});
  }

  listProxies(): Promise<Proxy[]> {
    return this.#call("GET", "/api/proxies");
  }
  createProxy(input: CreateProxyInput): Promise<Proxy> {
    return this.#call("POST", "/api/proxies", input);
  }
  updateProxy(ref: string, input: UpdateProxyInput): Promise<Proxy> {
    return this.#call("PATCH", proxyPath(ref), input);
  }
  deleteProxy(ref: string): Promise<void> {
    return this.#call("DELETE", proxyPath(ref));
  }
  importProxies(
    text: string,
  ): Promise<{ created: Proxy[]; errors: { line: number; error: string }[] }> {
    return this.#call("POST", "/api/proxies/import", { text });
  }
  checkProxy(ref: string): Promise<ProxyCheck> {
    return this.#call("POST", `${proxyPath(ref)}/check`, {});
  }

  listPages(ref: string): Promise<PageInfo[]> {
    return this.#call("GET", `${profilePath(ref)}/pages`);
  }
  newPage(ref: string, input: NewPageInput = {}): Promise<PageInfo> {
    return this.#call("POST", `${profilePath(ref)}/pages`, input);
  }
  closePage(ref: string, pageId: string): Promise<void> {
    return this.#call("DELETE", `${profilePath(ref)}/pages/${encodeURIComponent(pageId)}`);
  }
  goto(ref: string, input: GotoInput): Promise<PageInfo> {
    return this.#action(ref, "goto", input);
  }
  snapshot(ref: string, input: PageRefInput = {}): Promise<SnapshotResult> {
    return this.#action(ref, "snapshot", input);
  }
  click(ref: string, input: ClickInput): Promise<PageInfo> {
    return this.#action(ref, "click", input);
  }
  type(ref: string, input: TypeInput): Promise<PageInfo> {
    return this.#action(ref, "type", input);
  }
  press(ref: string, input: PressInput): Promise<PageInfo> {
    return this.#action(ref, "press", input);
  }
  screenshot(ref: string, input: ScreenshotInput = {}): Promise<ScreenshotResult> {
    return this.#action(ref, "screenshot", input);
  }
  evaluate(ref: string, input: EvaluateInput): Promise<{ pageId: string; result: unknown }> {
    return this.#action(ref, "evaluate", input);
  }
  waitFor(ref: string, input: WaitForInput): Promise<PageInfo> {
    return this.#action(ref, "wait-for", input);
  }

  listWorkflows(): Promise<WorkflowSummary[]> {
    return this.#call("GET", "/api/workflows");
  }
  getWorkflow(ref: string): Promise<Workflow> {
    return this.#call("GET", workflowPath(ref));
  }
  saveWorkflow(definition: WorkflowDefinition): Promise<Workflow> {
    return this.#call("POST", "/api/workflows", definition);
  }
  deleteWorkflow(ref: string): Promise<void> {
    return this.#call("DELETE", workflowPath(ref));
  }
  runWorkflow(ref: string, input: RunWorkflowInput): Promise<WorkflowRunResult> {
    return this.#call("POST", `${workflowPath(ref)}/run`, input);
  }
  startRecording(ref: string): Promise<void> {
    return this.#call("POST", `${profilePath(ref)}/recording`, {});
  }
  stopRecording(ref: string): Promise<RecordingResult> {
    return this.#call("DELETE", `${profilePath(ref)}/recording`);
  }

  #action<T>(ref: string, action: string, body: unknown): Promise<T> {
    return this.#call("POST", `${profilePath(ref)}/actions/${action}`, body);
  }

  async #call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = errorPayload.safeParse(payload);
      const error = parsed.success ? parsed.data.error : undefined;
      throw new PpbError(
        (error?.code as ErrorCode | undefined) ?? "INTERNAL",
        error?.message ?? `HTTP ${response.status} ${method} ${path}`,
      );
    }
    return payload as T;
  }
}

const errorPayload = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const profilePath = (ref: string) => `/api/profiles/${encodeURIComponent(ref)}`;
const proxyPath = (ref: string) => `/api/proxies/${encodeURIComponent(ref)}`;
const workflowPath = (ref: string) => `/api/workflows/${encodeURIComponent(ref)}`;
