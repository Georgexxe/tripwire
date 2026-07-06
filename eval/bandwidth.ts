/**
 * bandwidth.ts — estimate bandwidth savings versus streaming raw video:
 * "Tripwire sends ~X% fewer bytes than streaming raw video to the cloud."
 *
 * Run: npx tsx eval/bandwidth.ts
 */
const RAW_BITRATE_KBPS = 2500;     // typical 720p H.264 stream
const SECONDS = 60;                // one minute of monitoring
const EVENTS_PER_MIN = 6;          // escalations actually sent
const SUMMARY_BYTES = 180;         // ~text summary
const KEYFRAME_BYTES = 4_500;      // 160px low-res jpeg

const rawBytes = (RAW_BITRATE_KBPS * 1000 / 8) * SECONDS;
const tripwireBytes = EVENTS_PER_MIN * (SUMMARY_BYTES + KEYFRAME_BYTES);
const saved = (1 - tripwireBytes / rawBytes) * 100;

console.log(`Raw stream (60s):     ${(rawBytes / 1e6).toFixed(2)} MB`);
console.log(`Tripwire (60s):       ${(tripwireBytes / 1e3).toFixed(2)} KB`);
console.log(`Bandwidth reduction:  ${saved.toFixed(2)}%`);
