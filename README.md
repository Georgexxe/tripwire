# Tripwire

**Privacy-preserving, tamper-evident edge perception agent.**
Built for the **Global AI Hackathon Series with Qwen Cloud** - **EdgeAgent track**.

The edge device is a **phone**. Its browser is the runtime: an on-device model screens
the camera feed locally, raw video never leaves the phone, every detection is written
to a signed hash-chain ledger, and only a compact summary plus tiny keyframe is
escalated to **Qwen on Alibaba Cloud** for reasoning.

Cut the network and Tripwire keeps running locally, queues escalations, and syncs when
the connection returns. The cloud re-verifies the detection hash chain and ECDSA
signatures before storing the ledger.

## Why it is different

Tripwire is a perception firewall, not a streaming camera. It is built on three
properties: **verifiable provenance** (every detection is hash-chained and signed on
the device), a **perception firewall** (the edge decides what is allowed to reach the
cloud), and a **two-way trust model** — the device signs detections, the cloud signs
verdicts, and Qwen *audits* the edge model's claims instead of rubber-stamping them.

## Security model

- Every detection is appended to a SHA-256 hash chain and signed on-device with a
  **non-extractable** ECDSA P-256 WebCrypto key. The private key cannot leave the phone.
- On sync, the cloud recomputes the chain, verifies every signature, and enforces
  **append-only history**: empty payloads, shorter chains (rollback), and rewritten
  prefixes are rejected per device.
- Qwen verdicts are attached as metadata (the detection chain is never rewritten) and
  are **HMAC-signed by the server**, so editing a verdict after the fact is detected
  by the sync audit.
- Threat-model scope: tampering is detectable *after* logging/sync. A fully
  compromised device could fabricate its own chain before first contact; closing that
  gap requires device attestation (see roadmap below).

## Qwen usage (two roles)

1. **Adjudicator** (`qwen-vl-plus`): receives the compact summary + tiny keyframe and
   *cross-examines the edge model* — does the image actually support the claimed
   detection? Severity + `supports_claim` + reasoning.
2. **Analyst** (`qwen-plus`): `GET /digest` turns the verified cloud ledger into a
   2-3 sentence incident report (the Digest button in the UI).

## Monorepo

```text
apps/edge       phone PWA (Vite + TypeScript)
apps/server     Alibaba Cloud backend (Node + TypeScript)
packages/shared shared contracts
eval            bandwidth metric
docs            architecture
```

## Run locally

This workspace uses pnpm.

```bash
pnpm install

# 1) backend
export DASHSCOPE_API_KEY=sk-...   # optional locally; required for real Qwen calls
pnpm dev:server                   # http://localhost:9000

# 2) edge PWA
export VITE_API_URL=http://localhost:9000
pnpm dev:edge                     # open the LAN URL on your phone
```

Without `DASHSCOPE_API_KEY`, `/escalate` returns a deterministic local verdict so the
ledger, queue, sync, and UI can be tested immediately. Set the key to route
escalations through Qwen on Alibaba Cloud.

> Phone camera access requires a secure context. `localhost` is fine on a laptop, but a
> phone needs HTTPS via a tunnel such as Cloudflare Tunnel/ngrok or a deployed PWA.

## Verify

```bash
pnpm typecheck
pnpm build:edge
```

## Architecture

See `docs/architecture.md` and `docs/architecture.svg`. The Alibaba Cloud
integration lives in `apps/server/src/qwen.ts`; deployment notes are in
`apps/server/alibaba/deploy.md`.

## Config

| Var | Where | Meaning |
|---|---|---|
| `DASHSCOPE_API_KEY` | server | Qwen Cloud / DashScope API key |
| `VERDICT_SIGNING_SECRET` | server | optional fixed HMAC secret for verdict signing (auto-generated and persisted to `.verdict-secret` if unset) |
| `QWEN_VISION_MODEL` | server | default `qwen-vl-plus` |
| `QWEN_TEXT_MODEL` | server | default `qwen-plus` |
| `VITE_API_URL` | edge | backend URL |
| `VITE_WATCH_LABELS` | edge | comma list, default `person` |
| `VITE_MIN_SCORE` | edge | detection threshold, default `0.5` |

## Roadmap

- Persist verified ledgers to Alibaba Cloud OSS.
- Device attestation, so a chain is trusted from first boot rather than first sync.
- Multi-device ledger merging and richer watch-label scenarios.

## License

MIT — see `LICENSE`.
