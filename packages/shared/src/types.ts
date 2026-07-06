// Shared contracts between the edge PWA and the Alibaba Cloud backend.

/** A detection emitted by the ON-DEVICE model. Raw frames never leave the phone. */
export interface PerceptionEvent {
  id: string;
  ts: number;           // epoch ms
  label: string;        // e.g. "person", "vehicle" — depends on the on-device model
  score: number;        // detector confidence 0..1
  bbox?: [number, number, number, number]; // x,y,w,h (normalized) — optional
}

/** What actually crosses the network: a short summary (+ optional tiny keyframe). */
export interface Escalation {
  eventId: string;
  ts: number;
  deviceId: string;
  summary: string;      // compact natural-language summary, NOT raw video
  keyframe?: string;    // base64 LOW-RES jpeg, heavily downscaled, optional
  bytesSummary: number; // size of what we sent (for the bandwidth metric)
  bytesRawEstimate: number; // estimated bytes if we had streamed the frame(s)
}

/** Qwen's reasoning result, attached back onto the ledger entry. */
export interface Verdict {
  eventId: string;
  severity: "info" | "warn" | "alert";
  reasoning: string;    // Qwen output
  model: string;        // which Qwen model produced it
  ts: number;
  /** Cloud audit of the edge model's claim: did the keyframe support the detection? */
  supportsEdgeClaim?: boolean;
  /** Server HMAC over the verdict fields, so verdict tampering is detectable on sync. */
  sig?: string;
}

export interface DevicePublicKey {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
}

/** One link in the tamper-evident chain. */
export interface LedgerEntry {
  index: number;
  ts: number;
  prevHash: string;
  event: PerceptionEvent;
  verdict?: Verdict;    // attached metadata; it does not rewrite the detection chain
  hash: string;         // sha256 over immutable detection fields (index|ts|prevHash|event)
  sig?: string;         // base64 device signature (ECDSA P-256) over `hash`
  publicKey?: DevicePublicKey; // exported device verification key for cloud sync
  synced: boolean;      // mirrored to the cloud ledger yet?
}

/** Result of verifying a chain (run on device AND server). */
export interface ChainVerification {
  ok: boolean;
  length: number;
  brokenAt?: number;    // index where the chain first fails, if any
  reason?: string;
}
