const CACHE_NAME = "sales-pouch-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Keep network behavior unchanged for the app and Supabase.
  // The service worker is intentionally non-caching for now.
});
