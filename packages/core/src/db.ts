import { DatabaseSync } from "node:sqlite";

const MIGRATIONS: string[] = [
  `CREATE TABLE proxies (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     url TEXT NOT NULL,
     created_at TEXT NOT NULL,
     last_check TEXT
   );
   CREATE TABLE profiles (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     grp TEXT,
     notes TEXT,
     proxy_id TEXT REFERENCES proxies(id),
     identity TEXT NOT NULL,
     last_ip TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     last_opened_at TEXT
   );
   CREATE INDEX profiles_proxy ON profiles(proxy_id);`,
  `CREATE TABLE workflows (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     current_version INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE workflow_versions (
     workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
     version INTEGER NOT NULL,
     definition TEXT NOT NULL,
     created_at TEXT NOT NULL,
     PRIMARY KEY (workflow_id, version)
   );`,
  `ALTER TABLE profiles ADD COLUMN fingerprint BLOB;`,
];

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
