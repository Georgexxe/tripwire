/**
 * index.ts — minimal HTTP backend. Deploy on Alibaba Cloud (ECS or Function Compute).
 *
 * Routes:
 *   POST /escalate  -> { Escalation }  => Verdict   (calls Qwen on Alibaba Cloud)
 *   POST /sync      -> LedgerEntry[]   => { verification, stored, verdictAudit }
 *   GET  /digest    -> Qwen incident report over the verified cloud ledger
 *   GET  /health    -> { ok: true }
 *
 * For Alibaba Function Compute, wrap `route()` in the FC HTTP handler signature
 * (see apps/server/alibaba/deploy.md). On ECS this runs as-is with `npm run dev`.
 */
import { createServer } from "node:http";
import { handleEscalate } from "./escalate.js";
import { handleSync } from "./sync.js";
import { handleDigest } from "./digest.js";

const PORT = Number(process.env.PORT ?? 9000);

function cors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

const server = createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "tripwire-cloud" }));
      return;
    }
    if (req.method === "POST" && req.url === "/escalate") {
      const verdict = await handleEscalate(await readJson(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(verdict));
      return;
    }
    if (req.method === "GET" && req.url === "/digest") {
      const digest = await handleDigest();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(digest));
      return;
    }
    if (req.method === "POST" && req.url === "/sync") {
      const result = await handleSync(await readJson(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(404).end(JSON.stringify({ error: "not found" }));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message ?? "server error" }));
  }
});

server.listen(PORT, () => console.log(`tripwire-cloud listening on :${PORT}`));
