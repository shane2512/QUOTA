// Synthetic demo data until the backend lands. Every value here is illustrative, not measured.
export const UNIT_MON = 0.1; // stake per allowed request per epoch

export const agents = [
  { id: "scout", name: "Scout", role: "Multi-server research", limit: 100, used: 62, stake: 10, status: "active" },
  { id: "ledger", name: "Ledger-bot", role: "Invoice reconciliation", limit: 40, used: 38, stake: 4, status: "active" },
  { id: "harvest", name: "Harvester", role: "Public dataset sync", limit: 250, used: 14, stake: 25, status: "unstaking" },
] as const;

export const servers = [
  { name: "lantern-search", kind: "MCP tool server", perEpoch: 100, tree: "Open", calls: 18420, violations: 2 },
  { name: "tidewater-data", kind: "REST API", perEpoch: 500, tree: "Open + Screened", calls: 9310, violations: 0 },
];

export const slashes = [
  { id: "s-0412", time: "14:02", commit: "0x9be1…c40a", reveal: "0x31d7…aa02", reward: 2.4, burned: 7.6, state: "paid" },
  { id: "s-0409", time: "11:47", commit: "0x44f0…19be", reveal: "0xd02c…7710", reward: 1.0, burned: 3.0, state: "paid" },
  { id: "s-0413", time: "14:31", commit: "0x72ac…e913", reveal: "pending", reward: 1.2, burned: 3.6, state: "revealing" },
];

export const hex = (n: number) =>
  Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

export const short = () => `0x${hex(4)}…${hex(4)}`;
