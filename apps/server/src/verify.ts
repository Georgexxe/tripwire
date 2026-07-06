import { createHash, webcrypto } from "node:crypto";
import type { LedgerEntry, ChainVerification } from "@tripwire/shared/src/types";

/** Canonical string used for hashing a ledger entry (must match the edge implementation). */
export function canonical(e: Pick<LedgerEntry, "index" | "ts" | "prevHash" | "event">): string {
  return JSON.stringify({ index: e.index, ts: e.ts, prevHash: e.prevHash, event: e.event });
}

export function hashEntry(e: LedgerEntry): string {
  return createHash("sha256").update(canonical(e)).digest("hex");
}

async function verifySignature(entry: LedgerEntry): Promise<boolean> {
  if (!entry.sig || !entry.publicKey) return false;
  const key = await webcrypto.subtle.importKey(
    "jwk",
    entry.publicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return webcrypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(entry.sig, "base64"),
    new TextEncoder().encode(entry.hash),
  );
}

function samePublicKey(a: LedgerEntry, b: LedgerEntry): boolean {
  return JSON.stringify(a.publicKey) === JSON.stringify(b.publicKey);
}

/** Recompute the chain and confirm every link and device signature. */
export async function verifyChain(entries: LedgerEntry[]): Promise<ChainVerification> {
  let prev = "GENESIS";
  const first = entries[0];
  for (const e of entries) {
    if (e.index < 0 || !Number.isInteger(e.index)) {
      return { ok: false, length: entries.length, brokenAt: e.index, reason: "invalid index" };
    }
    if (first && !samePublicKey(first, e)) {
      return { ok: false, length: entries.length, brokenAt: e.index, reason: "device public key changed mid-chain" };
    }
    if (e.prevHash !== prev) {
      return { ok: false, length: entries.length, brokenAt: e.index, reason: "prevHash mismatch" };
    }
    if (hashEntry(e) !== e.hash) {
      return { ok: false, length: entries.length, brokenAt: e.index, reason: "hash mismatch (entry altered)" };
    }
    if (!(await verifySignature(e))) {
      return { ok: false, length: entries.length, brokenAt: e.index, reason: "signature verification failed" };
    }
    prev = e.hash;
  }
  return { ok: true, length: entries.length };
}
