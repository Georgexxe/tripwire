# Deploying on Alibaba Cloud

The backend integrates Alibaba Cloud Model Studio (DashScope) through its
OpenAI-compatible API. The integration lives in `apps/server/src/qwen.ts` and calls:

```text
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

## Option A: ECS

1. Create a small Ubuntu ECS instance.
2. Install Node.js and pnpm.
3. Clone the repo and run `pnpm install`.
4. Set `DASHSCOPE_API_KEY` (and optionally `VERDICT_SIGNING_SECRET`).
5. Run `pnpm dev:server`, or use a process manager such as `pm2` for production.
6. Open port 9000, or place Nginx/Caddy in front for TLS.

## Option B: Function Compute

1. Adapt `apps/server/src/index.ts` to the Function Compute HTTP handler signature.
2. Deploy through the FC console or Serverless Devs.
3. Set `DASHSCOPE_API_KEY` in the function's environment variables.

## Health check

```bash
curl https://<backend-host>/health
# {"ok":true,"service":"tripwire-cloud"}
```

## Optional: durable ledger storage on OSS

`apps/server/src/store.ts` persists verified ledgers to a local JSON file by
default. For production, swap it for Alibaba Cloud OSS using the `ali-oss` SDK —
the store interface (`loadStore`/`saveStore`) is the only seam you need to replace.
