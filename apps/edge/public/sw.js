// Offline shell: pre-cache the app skeleton, then cache every successful GET at
// runtime (app bundle, MediaPipe WASM, the .tflite model) so a reload with no
// network still boots the full agent.
const CACHE = "tripwire-v2";
const ASSETS = ["/", "/index.html", "/manifest.webmanifest"];
const RUNTIME_HOSTS = [self.location.origin, "https://cdn.jsdelivr.net", "https://storage.googleapis.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Never cache the API; those calls must hit the network (the queue handles offline).
  if (e.request.method !== "GET") return;
  if (url.includes("/escalate") || url.includes("/sync") || url.includes("/digest") || url.includes("/health")) return;
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((resp) => {
          if (resp.ok && RUNTIME_HOSTS.some((h) => url.startsWith(h))) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
    )
  );
});
