import { createHash } from "node:crypto";
import type { LedgerEntry, ChainVerification } from "@tripwire/shared/src/types";
import { verifyChain } from "./verify.js";
import { verifyVerdict } from "./verdicts.js";
import { loadStore, saveStore } from "./store.js";

export interface SyncResult {
  verification: ChainVerification;
  stored: number;
  /** Non-fatal audit of server-signed verdicts riding on the chain. */
  verdictAudit: { checked: number; valid: number };
}

function deviceFingerprint(e: LedgerEntry): string {
  return createHash("sha256").update(JSON.stringify(e.publicKey ?? {})).digest("hex").slice(0, 16);
}

function reject(length: number, reason: string, brokenAt?: number): SyncResult {
  const verification: ChainVerification = { ok: false, length, reason };
  if (brokenAt !== undefined) verification.brokenAt = brokenAt;
  return { verification, stored: 0, verdictAudit: { checked: 0, valid: 0 } };
}

/**
 * Receive a device's full chain, verify integrity, and persist append-only:
 * - empty/malformed payloads are rejected (they must never wipe the store);
 * - a chain shorter than what we already hold for that device is a rollback — rejected;
 * - a chain whose prefix differs from the stored prefix is a history rewrite — rejected.
 */
export async function handleSync(incoming: LedgerEntry[]): Promise<SyncResult> {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return reject(0, "empty or malformed chain rejected");
  }

  const verification = await verifyChain(incoming);
  if (!verification.ok) return { verification, stored: 0, verdictAudit: { checked: 0, valid: 0 } };

  const head = incoming[0];
  if (!head) return reject(0, "empty or malformed chain rejected");
  const device = deviceFingerprint(head);
  const store = loadStore();
  const existing = store[device] ?? [];

  if (incoming.length < existing.length) {
    return reject(incoming.length, "rollback rejected: incoming chain is shorter than the stored chain");
  }
  for (let i = 0; i < existing.length; i++) {
    if (existing[i]?.hash !== incoming[i]?.hash) {
      return reject(incoming.length, "history rewrite rejected: stored prefix mismatch", i);
    }
  }

  const withVerdicts = incoming.filter((e) => e.verdict);
  const verdictAudit = {
    checked: withVerdicts.length,
    valid: withVerdicts.filter((e) => verifyVerdict(e.verdict!)).length,
  };

  store[device] = incoming;
  saveStore(store);
  return { verification, stored: incoming.length, verdictAudit };
}
