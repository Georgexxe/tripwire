/**
 * verdicts.ts — server-side verdict signing.
 *
 * The device signs detections; the cloud signs verdicts. Each verdict returned by
 * /escalate carries an HMAC-SHA256 over its fields, so if anyone edits a verdict
 * (e.g. downgrades "alert" to "info") after the fact, the next /sync flags it.
 * The check is a non-fatal audit: chain verification stays independent, so a ledger
 * carrying verdicts minted by a different server (e.g. local dev before deploying)
 * still syncs — it is just reported.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Verdict } from "@tripwire/shared/src/types";

const SECRET_FILE = process.env.VERDICT_SECRET_FILE ?? ".verdict-secret";

const secret: string = (() => {
  if (process.env.VERDICT_SIGNING_SECRET) return process.env.VERDICT_SIGNING_SECRET;
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
  const s = randomBytes(32).toString("hex");
  writeFileSync(SECRET_FILE, s);
  return s;
})();

function canonicalVerdict(v: Verdict): string {
  return JSON.stringify({
    eventId: v.eventId,
    severity: v.severity,
    reasoning: v.reasoning,
    model: v.model,
    ts: v.ts,
    supportsEdgeClaim: v.supportsEdgeClaim ?? null,
  });
}

function hmac(v: Verdict): string {
  return createHmac("sha256", secret).update(canonicalVerdict(v)).digest("hex");
}

export function signVerdict(v: Verdict): Verdict {
  return { ...v, sig: hmac(v) };
}

export function verifyVerdict(v: Verdict): boolean {
  if (!v.sig) return false;
  const expected = Buffer.from(hmac(v), "hex");
  const actual = Buffer.from(v.sig, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
