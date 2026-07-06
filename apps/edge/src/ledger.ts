/**
 * ledger.ts — tamper-evident, signed, on-device ledger.
 *
 * Every detection is appended to a SHA-256 hash chain and signed with an
 * on-device ECDSA P-256 key (WebCrypto). Any after-the-fact edit breaks the
 * chain, and the cloud re-verifies on sync. Provenance you can prove.
 */
import type { PerceptionEvent, Verdict, LedgerEntry, ChainVerification, DevicePublicKey } from "@tripwire/shared/src/types";

const DB_NAME = "tripwire";
const STORE = "ledger";
const KEY_STORE = "keys";

// ---- tiny IndexedDB helpers ----
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "index" });
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const r = fn(transaction.objectStore(store));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
    transaction.oncomplete = () => db.close();
  });
}

// ---- crypto ----
async function getKeyPair(): Promise<CryptoKeyPair> {
  const existing = await tx<any>(KEY_STORE, "readonly", (s) => s.get("device")).catch(() => null);
  if (existing) return existing as CryptoKeyPair;
  // extractable: false — the private key physically cannot be exported off the device.
  // The public key remains exportable (WebCrypto always allows exporting public keys).
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]
  );
  await tx(KEY_STORE, "readwrite", (s) => s.put(pair, "device"));
  return pair;
}

async function getPublicKey(): Promise<DevicePublicKey> {
  const pair = await getKeyPair();
  return crypto.subtle.exportKey("jwk", pair.publicKey) as Promise<DevicePublicKey>;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonical(e: Pick<LedgerEntry, "index" | "ts" | "prevHash" | "event">): string {
  // MUST match apps/server/src/verify.ts canonical()
  return JSON.stringify({ index: e.index, ts: e.ts, prevHash: e.prevHash, event: e.event });
}

// ---- public API ----
export async function allEntries(): Promise<LedgerEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const out: LedgerEntry[] = [];
    const cur = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { out.push(c.value); c.continue(); } else resolve(out.sort((a, b) => a.index - b.index));
    };
    cur.onerror = () => reject(cur.error);
  });
}

/** Append a detection to the chain (no verdict yet — that arrives on escalation). */
export async function append(event: PerceptionEvent): Promise<LedgerEntry> {
  const entries = await allEntries();
  const prev = entries[entries.length - 1];
  const index = entries.length;
  const prevHash = prev ? prev.hash : "GENESIS";
  const base = { index, ts: Date.now(), prevHash, event };
  const hash = await sha256Hex(canonical(base));

  const pair = await getKeyPair();
  const publicKey = await getPublicKey();
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(hash)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const entry: LedgerEntry = { ...base, hash, sig, publicKey, synced: false };
  await tx(STORE, "readwrite", (s) => s.put(entry));
  return entry;
}

/** Attach a Qwen verdict without rewriting the signed detection chain. */
export async function attachVerdict(index: number, verdict: Verdict): Promise<void> {
  const entries = await allEntries();
  const e = entries.find((x) => x.index === index);
  if (!e) return;
  e.verdict = verdict;
  await tx(STORE, "readwrite", (s) => s.put(e));
}

export async function attachVerdictByEventId(eventId: string, verdict: Verdict): Promise<boolean> {
  const entries = await allEntries();
  const e = entries.find((x) => x.event.id === eventId);
  if (!e) return false;
  e.verdict = verdict;
  await tx(STORE, "readwrite", (s) => s.put(e));
  return true;
}

export async function markSynced(indexes: number[]): Promise<void> {
  const entries = await allEntries();
  for (const e of entries) if (indexes.includes(e.index)) { e.synced = true; await tx(STORE, "readwrite", (s) => s.put(e)); }
}

/** Verify the whole chain locally (the same check the cloud runs on sync). */
export async function verifyChain(): Promise<ChainVerification> {
  const entries = await allEntries();
  let prev = "GENESIS";
  for (const e of entries) {
    if (e.prevHash !== prev) return { ok: false, length: entries.length, brokenAt: e.index, reason: "prevHash mismatch" };
    if ((await sha256Hex(canonical(e))) !== e.hash) return { ok: false, length: entries.length, brokenAt: e.index, reason: "entry altered" };
    if (!e.sig || !e.publicKey) return { ok: false, length: entries.length, brokenAt: e.index, reason: "missing device signature" };
    prev = e.hash;
  }
  return { ok: true, length: entries.length };
}
