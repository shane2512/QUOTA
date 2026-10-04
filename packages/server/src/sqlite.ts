import { DatabaseSync } from "node:sqlite";
import type { NullifierStore, Share } from "./index.ts";

/// Persistent nullifier store (PRD Z4) on Node's built-in SQLite (Node ≥ 22.13; no extra dependency).
/// Survives restarts, so an agent cannot reuse a message id across a server restart without being caught.
/// Single-process: record() is synchronous inside, so check-and-insert is atomic.
export class SqliteNullifierStore implements NullifierStore {
  #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS nullifiers (
        epoch TEXT NOT NULL, en TEXT NOT NULL, n TEXT NOT NULL, x TEXT NOT NULL, y TEXT NOT NULL,
        PRIMARY KEY (en, n)
      );
      CREATE INDEX IF NOT EXISTS nullifiers_epoch ON nullifiers (epoch);
    `);
  }

  async record(epoch: bigint, en: bigint, n: bigint, share: Share): Promise<Share | undefined> {
    const ins = this.#db
      .prepare("INSERT OR IGNORE INTO nullifiers (epoch, en, n, x, y) VALUES (?, ?, ?, ?, ?)")
      .run(epoch.toString().padStart(20, "0"), en.toString(), n.toString(), share.x.toString(), share.y.toString());
    if (Number(ins.changes) === 1) return undefined;
    const row = this.#db.prepare("SELECT x, y FROM nullifiers WHERE en = ? AND n = ?").get(en.toString(), n.toString()) as
      | { x: string; y: string }
      | undefined;
    return row ? { x: BigInt(row.x), y: BigInt(row.y) } : undefined;
  }

  async prune(epoch: bigint): Promise<void> {
    this.#db.prepare("DELETE FROM nullifiers WHERE epoch < ?").run(epoch.toString().padStart(20, "0"));
  }

  close(): void {
    this.#db.close();
  }
}
