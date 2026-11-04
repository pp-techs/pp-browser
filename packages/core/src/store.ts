import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { ProfileOs, ProxyCheck, WorkflowDefinition } from "@ppb/shared";
import type { Identity } from "./camoufox.ts";

export interface ProxyRow {
  id: string;
  name: string;
  /** Full upstream URL including credentials. */
  url: string;
  createdAt: string;
  lastCheck: ProxyCheck | null;
}

export interface ProfileRow {
  id: string;
  name: string;
  group: string | null;
  notes: string | null;
  proxyId: string | null;
  identity: Identity;
  lastIp: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface WorkflowRow {
  id: string;
  name: string;
  version: number;
  definition: WorkflowDefinition;
  definitionJson: string;
  createdAt: string;
  updatedAt: string;
}

interface RawWorkflow {
  id: string;
  name: string;
  current_version: number;
  definition: string;
  created_at: string;
  updated_at: string;
}

const toWorkflow = (r: RawWorkflow): WorkflowRow => ({
  id: r.id,
  name: r.name,
  version: r.current_version,
  definition: JSON.parse(r.definition) as WorkflowDefinition,
  definitionJson: r.definition,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

interface RawProxy {
  id: string;
  name: string;
  url: string;
  created_at: string;
  last_check: string | null;
}

interface RawProfile {
  id: string;
  name: string;
  grp: string | null;
  notes: string | null;
  proxy_id: string | null;
  identity: string;
  last_ip: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

const toProxy = (r: RawProxy): ProxyRow => ({
  id: r.id,
  name: r.name,
  url: r.url,
  createdAt: r.created_at,
  lastCheck: r.last_check ? (JSON.parse(r.last_check) as ProxyCheck) : null,
});

/** Identities written before the move to the official camoufox package (BrowserForge fingerprint inline). */
interface LegacyIdentity {
  version: 1;
  os: ProfileOs;
  fingerprint: { navigator: { userAgent: string }; screen: { width: number; height: number } };
  webgl: { vendor: string; renderer: string };
  locale: { country: string; value: string } | null;
}

/** Version 1 rows have no `summary`; read what the UI shows from their old fields until they are replaced. */
function toIdentity(json: string): Identity {
  const raw = JSON.parse(json) as Identity | LegacyIdentity;
  if (raw.version === 2) return raw;
  return {
    version: 2,
    os: raw.os,
    summary: {
      userAgent: raw.fingerprint.navigator.userAgent,
      screen: { width: raw.fingerprint.screen.width, height: raw.fingerprint.screen.height },
      webgl: raw.webgl,
    },
    locale: raw.locale,
  };
}

const toProfile = (r: RawProfile): ProfileRow => ({
  id: r.id,
  name: r.name,
  group: r.grp,
  notes: r.notes,
  proxyId: r.proxy_id,
  identity: toIdentity(r.identity),
  lastIp: r.last_ip,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastOpenedAt: r.last_opened_at,
});

export class Store {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  listProxies(): ProxyRow[] {
    return (
      this.#db
        .prepare("SELECT * FROM proxies ORDER BY created_at, name")
        .all() as unknown as RawProxy[]
    ).map(toProxy);
  }

  findProxy(ref: string): ProxyRow | null {
    const row = this.#db.prepare("SELECT * FROM proxies WHERE id = ? OR name = ?").get(ref, ref) as
      | RawProxy
      | undefined;
    return row ? toProxy(row) : null;
  }

  insertProxy(row: ProxyRow): void {
    this.#db
      .prepare("INSERT INTO proxies (id, name, url, created_at, last_check) VALUES (?, ?, ?, ?, ?)")
      .run(
        row.id,
        row.name,
        row.url,
        row.createdAt,
        row.lastCheck ? JSON.stringify(row.lastCheck) : null,
      );
  }

  updateProxy(
    id: string,
    patch: { name?: string; url?: string; lastCheck?: ProxyCheck | null },
  ): void {
    this.#update("proxies", id, {
      name: patch.name,
      url: patch.url,
      last_check:
        patch.lastCheck === undefined
          ? undefined
          : patch.lastCheck && JSON.stringify(patch.lastCheck),
    });
  }

  deleteProxy(id: string): void {
    this.#db.prepare("DELETE FROM proxies WHERE id = ?").run(id);
  }

  profileCountByProxy(): Map<string, number> {
    const rows = this.#db
      .prepare(
        "SELECT proxy_id, COUNT(*) AS n FROM profiles WHERE proxy_id IS NOT NULL GROUP BY proxy_id",
      )
      .all() as { proxy_id: string; n: number }[];
    return new Map(rows.map((r) => [r.proxy_id, r.n]));
  }

  listProfiles(): ProfileRow[] {
    return (
      this.#db
        .prepare("SELECT * FROM profiles ORDER BY created_at, name")
        .all() as unknown as RawProfile[]
    ).map(toProfile);
  }

  findProfile(ref: string): ProfileRow | null {
    const row = this.#db
      .prepare("SELECT * FROM profiles WHERE id = ? OR name = ?")
      .get(ref, ref) as RawProfile | undefined;
    return row ? toProfile(row) : null;
  }

  insertProfile(row: ProfileRow, fingerprint: Buffer): void {
    this.#db
      .prepare(
        `INSERT INTO profiles (id, name, grp, notes, proxy_id, identity, fingerprint, last_ip, created_at, updated_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.name,
        row.group,
        row.notes,
        row.proxyId,
        JSON.stringify(row.identity),
        fingerprint,
        row.lastIp,
        row.createdAt,
        row.updatedAt,
        row.lastOpenedAt,
      );
  }

  /** The gzip fingerprint blob; read only when a profile launches. */
  profileFingerprint(id: string): Buffer | null {
    const row = this.#db.prepare("SELECT fingerprint FROM profiles WHERE id = ?").get(id) as
      | { fingerprint: Uint8Array | null }
      | undefined;
    return row?.fingerprint ? Buffer.from(row.fingerprint) : null;
  }

  updateProfile(
    id: string,
    patch: {
      name?: string;
      group?: string | null;
      notes?: string | null;
      proxyId?: string | null;
      identity?: Identity;
      fingerprint?: Buffer;
      lastIp?: string | null;
      lastOpenedAt?: string;
    },
  ): void {
    const edited = [patch.name, patch.group, patch.notes, patch.proxyId].some(
      (v) => v !== undefined,
    );
    this.#update("profiles", id, {
      name: patch.name,
      grp: patch.group,
      notes: patch.notes,
      proxy_id: patch.proxyId,
      identity: patch.identity && JSON.stringify(patch.identity),
      fingerprint: patch.fingerprint,
      last_ip: patch.lastIp,
      last_opened_at: patch.lastOpenedAt,
      updated_at: edited ? new Date().toISOString() : undefined,
    });
  }

  deleteProfile(id: string): void {
    this.#db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  }

  // ── workflows ───────────────────────────────────────────────────────────

  listWorkflows(): WorkflowRow[] {
    return (
      this.#db
        .prepare(
          `SELECT w.*, v.definition FROM workflows w
           JOIN workflow_versions v ON v.workflow_id = w.id AND v.version = w.current_version
           ORDER BY w.name`,
        )
        .all() as unknown as RawWorkflow[]
    ).map(toWorkflow);
  }

  findWorkflow(ref: string): WorkflowRow | null {
    const row = this.#db
      .prepare(
        `SELECT w.*, v.definition FROM workflows w
         JOIN workflow_versions v ON v.workflow_id = w.id AND v.version = w.current_version
         WHERE w.id = ? OR w.name = ?`,
      )
      .get(ref, ref) as RawWorkflow | undefined;
    return row ? toWorkflow(row) : null;
  }

  insertWorkflow(
    row: { id: string; name: string; createdAt: string },
    definitionJson: string,
  ): void {
    this.#db.exec("BEGIN");
    try {
      this.#db
        .prepare(
          "INSERT INTO workflows (id, name, current_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
        )
        .run(row.id, row.name, row.createdAt, row.createdAt);
      this.#db
        .prepare(
          "INSERT INTO workflow_versions (workflow_id, version, definition, created_at) VALUES (?, 1, ?, ?)",
        )
        .run(row.id, definitionJson, row.createdAt);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  addWorkflowVersion(id: string, version: number, definitionJson: string, now: string): void {
    this.#db.exec("BEGIN");
    try {
      this.#db
        .prepare(
          "INSERT INTO workflow_versions (workflow_id, version, definition, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(id, version, definitionJson, now);
      this.#db
        .prepare("UPDATE workflows SET current_version = ?, updated_at = ? WHERE id = ?")
        .run(version, now, id);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteWorkflow(id: string): void {
    this.#db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
  }

  #update(
    table: "profiles" | "proxies",
    id: string,
    values: Record<string, SQLInputValue | undefined>,
  ): void {
    const entries = Object.entries(values).filter(
      (e): e is [string, SQLInputValue] => e[1] !== undefined,
    );
    if (entries.length === 0) return;
    const sets = entries.map(([column]) => `${column} = ?`).join(", ");
    this.#db
      .prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`)
      .run(...entries.map((e) => e[1]), id);
  }
}
