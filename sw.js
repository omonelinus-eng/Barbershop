/* Barbershop Manager — service worker
   Purpose: keep the app SHELL (this HTML/CSS/JS, manifest, icons) available
   with zero network, so the app never shows a browser "can't be reached" /
   "you are offline" page. Actual business data (sales, customers, etc.)
   is handled separately by Firestore's own offline persistence — this
   worker does not need to know anything about that.
*/
const CACHE_VERSION = "barbershop-shell-v4";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {}) // don't fail install if an icon is missing, etc.
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes

  const url = new URL(req.url);

  // Only manage requests to our own origin (the app shell). Everything else
  // (Firestore/Auth calls, Google Fonts, CDN scripts) is left to the network
  // and to Firestore's own offline queue/cache — the browser and the
  // Firestore SDK already handle those failure modes gracefully.
  if (url.origin !== self.location.origin) return;

  // Navigations (full page loads / reloads) — try the network first so the
  // user gets fresh content when online, but NEVER let a failed navigation
  // show the browser's offline error page: fall back to the cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", res.clone()));
          return res;
        })
        .catch(() => caches.match("./index.html").then((res) => res || caches.match(req)))
    );
    return;
  }

  // Static shell assets — cache-first, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
