import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type {
  Profile,
  Repository,
  Session,
  Settings,
} from "../shared/types.js";
export const emptyProfile: Profile = {
  name: "",
  email: "",
  headline: "",
  resumeText: "",
  skills: [],
  goals: "",
};
export const defaultSettings: Settings = {
  provider: "guided",
  model: "",
  baseUrl: "http://127.0.0.1:11434",
};
export class Store {
  private db: DatabaseSync;
  constructor(public readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dir, "sparr.sqlite"));
    chmodSync(join(dir, "sparr.sqlite"), 0o600);
    this.db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(kind,id));",
    );
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT json FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { json: string } | undefined;
    return row ? JSON.parse(row.json) : undefined;
  }
  put(kind: string, id: string, data: unknown) {
    this.db
      .prepare(
        "INSERT INTO records(kind,id,json) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json",
      )
      .run(kind, id, JSON.stringify(data));
  }
  list<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT json FROM records WHERE kind=? ORDER BY rowid DESC")
        .all(kind) as { json: string }[]
    ).map((r) => JSON.parse(r.json));
  }
  delete(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction(action: () => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  deleteReceipts(sessionId: string) {
    this.db
      .prepare("DELETE FROM records WHERE kind=? AND substr(id,1,?)=?")
      .run("receipt", sessionId.length + 1, sessionId + ":");
  }
  clear() {
    this.db.exec(
      "DELETE FROM records; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;",
    );
  }
  profile() {
    return this.get<Profile>("profile", "local") ?? { ...emptyProfile };
  }
  settings() {
    return this.get<Settings>("settings", "local") ?? { ...defaultSettings };
  }
  sessions() {
    return this.list<Session>("session");
  }
  repositories() {
    return this.list<Repository>("repository");
  }
  close() {
    this.db.close();
  }
}
