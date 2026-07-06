import { allEntries } from "./store.js";
import { digestReport } from "./qwen.js";

/** GET /digest — Qwen summarizes the verified cloud ledger into an incident report. */
export async function handleDigest(): Promise<{ events: number; report: string; model: string }> {
  const entries = allEntries();
  const lines = entries.map((e) => {
    const verdict = e.verdict ? `${e.verdict.severity}${e.verdict.supportsEdgeClaim === false ? " (claim disputed)" : ""}` : "unreviewed";
    return `${new Date(e.event.ts).toISOString()} ${e.event.label} ${(e.event.score * 100).toFixed(0)}% -> ${verdict}`;
  });
  const { report, model } = await digestReport(lines);
  return { events: entries.length, report, model };
}
