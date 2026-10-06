import type { VerifyEvent } from "@quota/server";

/// In-memory live feed for the service console (PRD D5): the last verification outcomes, per-status counters and
/// the slashes this server initiated. Only public values are kept (short nullifier, status, tx hashes); never a
/// share, a proof or a secret.
export interface FeedRow {
  t: number; // unix ms
  status: string;
  nullifier?: string; // 0x + first 8 hex digits
}
export interface FeedSlash {
  t: number;
  idCommitment: string; // shortened
  status: string; // slashed | queued | failed ...
  commit?: string;
  reveal?: string;
}

const short = (n: bigint) => `0x${n.toString(16).padStart(8, "0").slice(0, 8)}`;
const shortId = (n: bigint) => {
  const h = n.toString(16);
  return `0x${h.slice(0, 6)}…${h.slice(-4)}`;
};

export class Feed {
  readonly rows: FeedRow[] = [];
  readonly counts: Record<string, number> = {};
  readonly slashes: FeedSlash[] = [];
  readonly startedAt = Date.now();

  constructor(private max = 60) {}

  result = (e: VerifyEvent) => {
    this.counts[e.status] = (this.counts[e.status] ?? 0) + 1;
    this.rows.unshift({ t: e.at, status: e.status, nullifier: e.nullifier === undefined ? undefined : short(e.nullifier) });
    if (this.rows.length > this.max) this.rows.length = this.max;
  };

  slash(o: { idCommitment: bigint; status: string; commit?: string; reveal?: string }) {
    this.slashes.unshift({ t: Date.now(), idCommitment: shortId(o.idCommitment), status: o.status, commit: o.commit, reveal: o.reveal });
    if (this.slashes.length > 20) this.slashes.length = 20;
  }

  snapshot() {
    return { startedAt: this.startedAt, counts: this.counts, rows: this.rows, slashes: this.slashes };
  }
}
