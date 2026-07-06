/**
 * escalation.ts — build a COMPACT escalation (summary + tiny keyframe) and send it.
 * The point: bytes of text cross the network, not megabytes of video. The UI
 * surfaces the measured bandwidth savings.
 */
import type { PerceptionEvent, Escalation, Verdict } from "@tripwire/shared/src/types";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
const DEVICE_ID = (() => {
  let id = localStorage.getItem("tripwire-device");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("tripwire-device", id); }
  return id;
})();

/** Downscale the current frame to a tiny JPEG keyframe (privacy + bandwidth). */
export function keyframe(video: HTMLVideoElement, maxW = 160): { b64: string; bytes: number } | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined;
  const scale = maxW / video.videoWidth;
  const c = document.createElement("canvas");
  c.width = maxW; c.height = Math.round(video.videoHeight * scale);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.5);
  const b64 = dataUrl.split(",")[1] ?? "";
  // Count the base64 length: that is what actually crosses the wire inside the JSON body.
  return { b64, bytes: b64.length };
}

export function buildEscalation(ev: PerceptionEvent, kf?: { b64: string; bytes: number }, rawFrameBytesEstimate = 1_500_000): Escalation {
  const summary = `Detected "${ev.label}" (confidence ${(ev.score * 100).toFixed(0)}%) at ${new Date(ev.ts).toISOString()}.`;
  const bytesSummary = new TextEncoder().encode(summary).length + (kf?.bytes ?? 0);
  const escalation: Escalation = {
    eventId: ev.id, ts: ev.ts, deviceId: DEVICE_ID, summary,
    bytesSummary, bytesRawEstimate: rawFrameBytesEstimate,
  };
  if (kf) escalation.keyframe = kf.b64;
  return escalation;
}

/** POST to the Alibaba Cloud backend; returns the Qwen verdict (or throws if offline). */
export async function sendEscalation(esc: Escalation): Promise<Verdict> {
  const res = await fetch(`${API}/escalate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(esc),
  });
  if (!res.ok) throw new Error(`escalate failed: ${res.status}`);
  return res.json();
}

/** Ask Qwen (text model) to summarize the verified cloud ledger into an incident report. */
export async function fetchDigest(): Promise<{ events: number; report: string; model: string }> {
  const res = await fetch(`${API}/digest`);
  if (!res.ok) throw new Error(`digest failed: ${res.status}`);
  return res.json();
}
