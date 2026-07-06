/** net.ts — online/offline signal with callbacks. Drives the "cut the WiFi" demo. */
export function onNetChange(cb: (online: boolean) => void): void {
  let last = navigator.onLine;
  const emit = (online: boolean) => {
    if (online !== last) {
      last = online;
      cb(online);
    }
  };
  window.addEventListener("online", () => emit(true));
  window.addEventListener("offline", () => emit(false));
  // Some mobile browsers miss the events (e.g. airplane-mode edge cases); poll as a fallback.
  setInterval(() => emit(navigator.onLine), 2000);
}
export const isOnline = () => navigator.onLine;
