import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { ProxyCheck } from "@ppb/shared";
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

const toProfile = (r: RawProfile): ProfileRow => ({
  id: r.id,
  name: r.name,
  group: r.grp,
  notes: r.notes,
  proxyId: r.proxy_id,
  identity: JSON.parse(r.identity) as Identity,
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

  insertProfile(row: ProfileRow): void {
    this.#db
      .prepare(
        `INSERT INTO profiles (id, name, grp, notes, proxy_id, identity, last_ip, created_at, updated_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.name,
        row.group,
        row.notes,
        row.proxyId,
        JSON.stringify(row.identity),
        row.lastIp,
        row.createdAt,
        row.updatedAt,
        row.lastOpenedAt,
      );
  }

  updateProfile(
    id: string,
    patch: {
      name?: string;
      group?: string | null;
      notes?: string | null;
      proxyId?: string | null;
      identity?: Identity;
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
      last_ip: patch.lastIp,
      last_opened_at: patch.lastOpenedAt,
      updated_at: edited ? new Date().toISOString() : undefined,
    });
  }

  deleteProfile(id: string): void {
    this.#db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
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
