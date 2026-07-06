/**
 * store.ts — cloud ledger persistence, one chain per device key.
 *
 * Default: a local JSON file. For durable production storage, persist to Alibaba
 * Cloud OSS with the `ali-oss` SDK — see apps/server/alibaba/deploy.md.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { LedgerEntry } from "@tripwire/shared/src/types";

const FILE = process.env.LEDGER_FILE ?? "ledger-store.json";

export type LedgerStore = Record<string, LedgerEntry[]>; // deviceKey fingerprint -> chain

export function loadStore(): LedgerStore {
  if (!existsSync(FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    // Migrate the old flat-array format from earlier demos.
    if (Array.isArray(parsed)) return parsed.length ? { legacy: parsed } : {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveStore(store: LedgerStore): void {
  writeFileSync(FILE, JSON.stringify(store, null, 2));
}

export function allEntries(): LedgerEntry[] {
  return Object.values(loadStore()).flat().sort((a, b) => a.ts - b.ts);
}
