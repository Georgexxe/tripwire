/**
 * queue.ts — offline-first. When the network is down, escalations queue in
 * localStorage; when it returns, we drain the queue and sync the ledger to cloud.
 */
import type { Escalation, LedgerEntry, ChainVerification } from "@tripwire/shared/src/types";
import { sendEscalation } from "./escalation.js";
import { allEntries, attachVerdictByEventId, markSynced } from "./ledger.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
const Q = "tripwire-queue";

export interface QueueDrainResult {
  sent: number;
  retained: number;
}

function readQueue(): Escalation[] {
  try {
    return JSON.parse(localStorage.getItem(Q) ?? "[]") as Escalation[];
  } catch {
    return [];
  }
}

function writeQueue(q: Escalation[]): void {
  if (q.length === 0) localStorage.removeItem(Q);
  else localStorage.setItem(Q, JSON.stringify(q));
}

export function enqueue(esc: Escalation): void {
  const q = readQueue();
  if (!q.some((item) => item.eventId === esc.eventId)) q.push(esc);
  writeQueue(q);
}
export function queueSize(): number {
  return readQueue().length;
}
export function clearQueue(): void { localStorage.removeItem(Q); }

/** Replay queued escalations on reconnect, preserving failures for the next try. */
export async function drainEscalationQueue(): Promise<QueueDrainResult> {
  const q = readQueue();
  const retained: Escalation[] = [];
  let sent = 0;

  for (const esc of q) {
    try {
      const verdict = await sendEscalation(esc);
      await attachVerdictByEventId(esc.eventId, verdict);
      sent += 1;
    } catch {
      retained.push(esc);
    }
  }

  writeQueue(retained);
  return { sent, retained: retained.length };
}

/** On reconnect: push the local ledger to cloud for integrity verification + storage. */
export async function syncLedger(): Promise<ChainVerification> {
  const entries: LedgerEntry[] = await allEntries();
  const res = await fetch(`${API}/sync`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entries),
  });
  if (!res.ok) throw new Error(`sync failed: HTTP ${res.status}`);
  const result = await res.json();
  if (!result?.verification) throw new Error("sync failed: malformed server response");
  if (result.verification.ok) await markSynced(entries.map((e) => e.index));
  return result.verification;
}
