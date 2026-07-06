/**
 * perception.ts — ON-DEVICE inference. Raw frames are processed locally and
 * NEVER leave the phone. Default: MediaPipe Tasks ObjectDetector (loaded from CDN,
 * runs in-browser via WASM/GPU). Swap points marked for TF.js COCO-SSD or ONNX.
 */
import type { PerceptionEvent } from "@tripwire/shared/src/types";

// Labels we care about (tune per use case). Everything else is ignored on-device.
const WATCH = new Set((import.meta.env.VITE_WATCH_LABELS ?? "person").split(","));
const MIN_SCORE = Number(import.meta.env.VITE_MIN_SCORE ?? 0.5);

let detector: any = null;
let ready = false;

export async function initPerception(): Promise<boolean> {
  try {
    // Lazy CDN import keeps the scaffold dependency-light.
    const visionUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
    const vision = await import(/* @vite-ignore */ visionUrl) as any;
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    detector = await vision.ObjectDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
      },
      scoreThreshold: MIN_SCORE,
      runningMode: "VIDEO",
    });
    ready = true;
    return true;
  } catch {
    detector = null;
    ready = false;
    return false;
  }
}

export function isPerceptionReady(): boolean {
  return ready;
}

/** Run one frame through the on-device model; emit a PerceptionEvent if a watched label fires. */
export function detect(video: HTMLVideoElement, tsMs: number): PerceptionEvent | null {
  if (!detector) return null;
  const result = detector.detectForVideo(video, tsMs);
  for (const d of result.detections ?? []) {
    const cat = d.categories?.[0];
    if (!cat) continue;
    if (WATCH.has(cat.categoryName) && cat.score >= MIN_SCORE) {
      const bb = d.boundingBox;
      const event: PerceptionEvent = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        label: cat.categoryName,
        score: cat.score,
      };
      if (bb) event.bbox = [bb.originX, bb.originY, bb.width, bb.height];
      return event;
    }
  }
  return null;
}

export function demoEvent(label = "person"): PerceptionEvent {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    label,
    score: 0.91,
    bbox: [0.25, 0.18, 0.42, 0.58],
  };
}
