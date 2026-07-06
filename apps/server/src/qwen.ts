/**
 * qwen.ts — Alibaba Cloud (Qwen Cloud / DashScope) integration.
 *
 * All cloud reasoning runs on Alibaba Cloud Model Studio (DashScope) through its
 * OpenAI-compatible endpoint. Base URLs are region-scoped (API keys are not
 * interchangeable across regions) — set DASHSCOPE_BASE_URL to match your key:
 *   Singapore:     https://dashscope-intl.aliyuncs.com/compatible-mode/v1 (default)
 *   US (Virginia): https://dashscope-us.aliyuncs.com/compatible-mode/v1
 *
 * Two Qwen roles:
 *  1. ADJUDICATOR (qwen3-vl-flash / qwen-plus): decides severity AND audits the edge
 *     model's claim against the keyframe — the cloud cross-examines the edge.
 *  2. ANALYST (qwen-plus): /digest summarizes the verified cloud ledger into a
 *     human incident report.
 */
import OpenAI from "openai";
import type { Escalation, Verdict } from "@tripwire/shared/src/types";
import { signVerdict } from "./verdicts.js";

const ALIBABA_QWEN_BASE_URL =
  process.env.DASHSCOPE_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY ?? "",
  baseURL: ALIBABA_QWEN_BASE_URL,
  timeout: 30_000,   // a hung call must never stall the pipeline
  maxRetries: 1,
});

// Vision-capable model when we send a keyframe; text model otherwise.
const VISION_MODEL = process.env.QWEN_VISION_MODEL ?? "qwen3-vl-flash";
const TEXT_MODEL = process.env.QWEN_TEXT_MODEL ?? "qwen-plus";

const SYSTEM_PROMPT = `You are Tripwire's cloud adjudicator. An on-device edge model watched
a camera feed locally (the raw video never left the device) and escalated only a short
summary and, possibly, ONE low-resolution keyframe. Your job:
1. Decide a severity: "info" | "warn" | "alert".
2. If a keyframe is provided, audit the edge model's claim: does the image actually
   support the detected label? If no keyframe is provided, set supports_claim to true.
3. Give one concise sentence of reasoning.
Respond ONLY as compact JSON: {"severity":"...","supports_claim":true,"reasoning":"..."}`;

/** Adjudicate an escalation using Qwen on Alibaba Cloud. */
export async function reason(esc: Escalation): Promise<Verdict> {
  if (!process.env.DASHSCOPE_API_KEY) {
    return demoVerdict(esc);
  }

  const useVision = Boolean(esc.keyframe);
  const model = useVision ? VISION_MODEL : TEXT_MODEL;

  const userContent: any = useVision
    ? [
        { type: "text", text: `Edge model claim: ${esc.summary}` },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${esc.keyframe}` } },
      ]
    : `Edge model claim: ${esc.summary}`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { severity?: string; supports_claim?: boolean; reasoning?: string } = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    parsed = { severity: "info", reasoning: raw.slice(0, 200) };
  }

  const severity = (["info", "warn", "alert"].includes(parsed.severity ?? "")
    ? parsed.severity
    : "info") as Verdict["severity"];

  return signVerdict({
    eventId: esc.eventId,
    severity,
    reasoning: parsed.reasoning ?? "no reasoning",
    model,
    ts: Date.now(),
    supportsEdgeClaim: typeof parsed.supports_claim === "boolean" ? parsed.supports_claim : true,
  });
}

/** Summarize ledger lines into a short incident report (the /digest endpoint). */
export async function digestReport(lines: string[]): Promise<{ report: string; model: string }> {
  if (!process.env.DASHSCOPE_API_KEY) {
    return {
      report: `Demo digest over ${lines.length} verified events. Set DASHSCOPE_API_KEY to have Qwen write this report.`,
      model: "demo-local-fallback",
    };
  }

  const completion = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are Tripwire's incident analyst. You receive a chronological list of verified, " +
          "signed edge detections with cloud severities. Write a 2-3 sentence incident report: " +
          "what happened, any pattern (clusters, repeats), and the highest severity. Plain text only.",
      },
      { role: "user", content: lines.join("\n") || "No events recorded." },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return {
    report: completion.choices[0]?.message?.content?.trim() ?? "no report",
    model: TEXT_MODEL,
  };
}

function demoVerdict(esc: Escalation): Verdict {
  const lower = esc.summary.toLowerCase();
  const severity: Verdict["severity"] =
    lower.includes("person") || lower.includes("vehicle") ? "warn" : "info";
  return signVerdict({
    eventId: esc.eventId,
    severity,
    reasoning: "Demo verdict: set DASHSCOPE_API_KEY to route this escalation through Qwen on Alibaba Cloud.",
    model: "demo-local-fallback",
    ts: Date.now(),
    supportsEdgeClaim: true,
  });
}
