/**
 * Tripwire edge loop.
 * 1. capture frame on-device
 * 2. detect locally; raw frames stay on the phone
 * 3. append immutable detection to the signed ledger
 * 4. escalate only a compact summary/keyframe when online
 * 5. queue while offline, then replay and sync on reconnect
 */
import type { PerceptionEvent } from "@tripwire/shared/src/types";
import { startCamera } from "./camera.js";
import { initPerception, detect, demoEvent } from "./perception.js";
import { append, attachVerdict } from "./ledger.js";
import { buildEscalation, keyframe, sendEscalation, fetchDigest } from "./escalation.js";
import { drainEscalationQueue, enqueue, syncLedger } from "./queue.js";
import { onNetChange, isOnline } from "./net.js";
import { setStatus, setOnline, refreshPanel, setLastSync } from "./ui.js";

let totalRaw = 0;
let totalSent = 0;
let lastEmit = 0;
let lastDetect = 0;
let video: HTMLVideoElement;

const DEBOUNCE_MS = 4000;
const DETECT_INTERVAL_MS = 200; // ~5 fps keeps the phone cool during long demo takes

async function main(): Promise<void> {
  video = document.getElementById("cam") as HTMLVideoElement;
  wireControls();

  setStatus("starting camera...");
  try {
    await startCamera(video);
  } catch (err) {
    setStatus(`camera unavailable: ${(err as Error).message}`);
  }

  setStatus("loading on-device model...");
  const modelReady = await initPerception();
  setOnline(isOnline());
  onNetChange((online) => {
    setOnline(online);
    if (online) void syncAll("reconnected");
  });

  setStatus(modelReady ? "watching locally" : "model offline; test event mode ready");
  await refreshPanel(savedPct());

  const loop = async (): Promise<void> => {
    const now = performance.now();
    // readyState guard: MediaPipe throws (a non-Error) on a frameless video element.
    if (modelReady && video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect >= DETECT_INTERVAL_MS) {
      lastDetect = now;
      try {
        const ev = detect(video, now);
        if (ev && Date.now() - lastEmit > DEBOUNCE_MS) {
          lastEmit = Date.now();
          await processEvent(ev);
        }
      } catch {
        // One bad frame must never kill the agent loop.
      }
    }
    requestAnimationFrame(() => void loop());
  };
  await loop();
}

async function processEvent(ev: PerceptionEvent): Promise<void> {
  const entry = await append(ev);
  const kf = keyframe(video);
  const esc = buildEscalation(ev, kf);
  totalRaw += esc.bytesRawEstimate;
  totalSent += esc.bytesSummary;

  if (isOnline()) {
    try {
      const verdict = await sendEscalation(esc);
      await attachVerdict(entry.index, verdict);
      const audit = verdict.supportsEdgeClaim === false ? " (cloud disputes edge claim)" : "";
      setStatus(`${verdict.severity.toUpperCase()}${audit}: ${verdict.reasoning}`);
    } catch (err) {
      enqueue(esc);
      setStatus(`queued escalation: ${(err as Error).message}`);
    }
  } else {
    enqueue(esc);
    setStatus(`logged "${ev.label}" locally`);
  }

  await refreshPanel(savedPct());
}

async function syncAll(label: string): Promise<void> {
  try {
    setStatus(`${label}: draining queue...`);
    const drained = await drainEscalationQueue();
    setStatus(`${label}: verifying cloud ledger...`);
    const verification = await syncLedger();
    setLastSync(`${verification.ok ? "verified" : "failed"} | sent ${drained.sent}, queued ${drained.retained}`);
    setStatus(verification.ok ? "cloud ledger verified" : `sync failed: ${verification.reason ?? "unknown"}`);
  } catch (err) {
    setLastSync("sync error");
    setStatus(`sync error: ${(err as Error).message} — will retry on next sync`);
  }
  await refreshPanel(savedPct());
}

function wireControls(): void {
  document.getElementById("test-event")?.addEventListener("click", () => {
    void processEvent(demoEvent());
  });
  document.getElementById("sync-now")?.addEventListener("click", () => {
    void syncAll("manual sync");
  });
  document.getElementById("digest")?.addEventListener("click", () => {
    void (async () => {
      setStatus("asking Qwen for an incident digest...");
      try {
        const d = await fetchDigest();
        setStatus(`DIGEST (${d.events} events, ${d.model}): ${d.report}`);
      } catch (err) {
        setStatus(`digest failed: ${(err as Error).message}`);
      }
    })();
  });
}

function savedPct(): number {
  return totalRaw === 0 ? 0 : (1 - totalSent / totalRaw) * 100;
}

main().catch((e: Error) => setStatus(`error: ${e.message}`));
