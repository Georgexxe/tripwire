/** net.ts — online/offline signal with callbacks. Drives the "cut the WiFi" demo. */
export function onNetChange(cb: (online: boolean) => void): void {
  window.addEventListener("online", () => cb(true));
  window.addEventListener("offline", () => cb(false));
}
export const isOnline = () => navigator.onLine;
