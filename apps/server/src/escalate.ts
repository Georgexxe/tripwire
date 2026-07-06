import type { Escalation, Verdict } from "@tripwire/shared/src/types";
import { reason } from "./qwen.js";

/** Handle an escalation: ask Qwen (on Alibaba Cloud) for a verdict. */
export async function handleEscalate(esc: Escalation): Promise<Verdict> {
  return reason(esc);
}
