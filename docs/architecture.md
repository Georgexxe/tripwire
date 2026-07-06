# Tripwire Architecture

**Track:** EdgeAgent. **Edge device:** a phone running a browser PWA.

## One paragraph

A phone runs an on-device perception model in the browser. Raw camera frames are
screened locally and never leave the device. When a watched event fires, Tripwire
appends an immutable detection record to a SHA-256 hash chain, signs that hash with an
on-device ECDSA P-256 key, and escalates only a compact summary plus tiny keyframe to a
backend on Alibaba Cloud. Qwen returns a severity verdict, which is attached as
metadata without rewriting the signed detection chain. Offline, the device keeps
logging and queues escalations; on reconnect, queued escalations replay and the cloud
verifies the hash chain plus signatures.

## Components

- **Edge phone PWA:** camera capture, MediaPipe object detection, signed IndexedDB
  ledger, compact escalation builder, offline queue, and status dashboard.
- **Cloud backend:** `/escalate` routes summaries/keyframes to Qwen through DashScope;
  `/sync` verifies chain hashes and ECDSA signatures before persisting the ledger.
- **Shared contracts:** typed event, escalation, verdict, and ledger schemas.

## Data flow

```text
camera -> on-device detect -> append signed ledger entry
  online  -> summary + keyframe -> Alibaba Cloud -> Qwen verdict -> attach metadata
  offline -> queue escalation -> reconnect -> replay queue -> sync verified ledger
```
