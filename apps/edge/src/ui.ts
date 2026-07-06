import { verifyChain, allEntries } from "./ledger.js";
import { queueSize } from "./queue.js";

let lastSync = "not synced";

export function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

export function setOnline(online: boolean): void {
  const el = document.getElementById("net");
  if (!el) return;
  el.textContent = online ? "ONLINE" : "OFFLINE";
  el.className = online ? "pill ok" : "pill warn";
}

export function setLastSync(text: string): void {
  lastSync = text;
}

export async function refreshPanel(bandwidthSaved: number): Promise<void> {
  const entries = await allEntries();
  const chain = await verifyChain();
  const panel = document.getElementById("panel");
  const feed = document.getElementById("feed");
  if (!panel || !feed) return;

  const verdicts = entries.filter((entry) => entry.verdict).length;
  const unsynced = entries.filter((entry) => !entry.synced).length;

  panel.innerHTML = `
    <div class="metric">
      <span>Detections</span>
      <strong>${entries.length}</strong>
    </div>
    <div class="metric">
      <span>Queued</span>
      <strong>${queueSize()}</strong>
    </div>
    <div class="metric">
      <span>Verdicts</span>
      <strong>${verdicts}</strong>
    </div>
    <div class="metric">
      <span>Unsynced</span>
      <strong>${unsynced}</strong>
    </div>
    <div class="metric wide">
      <span>Chain integrity</span>
      <strong class="${chain.ok ? "ok" : "warn"}">${chain.ok ? "VERIFIED" : `BROKEN @ ${chain.brokenAt}`}</strong>
    </div>
    <div class="metric wide">
      <span>Bandwidth saved</span>
      <strong>${bandwidthSaved.toFixed(1)}%</strong>
    </div>
    <div class="metric wide">
      <span>Cloud sync</span>
      <strong>${lastSync}</strong>
    </div>
  `;

  feed.innerHTML = entries.slice(-8).reverse().map((entry) => {
    const verdict = entry.verdict;
    const severity = verdict?.severity ?? "local";
    const when = new Date(entry.event.ts).toLocaleTimeString();
    return `
      <li>
        <div>
          <strong>${entry.event.label}</strong>
          <span>${when} | ${(entry.event.score * 100).toFixed(0)}%</span>
        </div>
        <span class="badge ${severity}">${severity}</span>
      </li>
    `;
  }).join("") || `<li class="empty">No detections yet</li>`;
}
