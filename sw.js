// Legacy Aurora Agent service worker cleanup.
// The working Aura System PWA does not register a service worker.
// This file only removes any older Aurora Agent worker/cache that may
// still be installed from a previous deployment.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("aurora-agent-"))
            .map((key) => caches.delete(key))
        )
      )
    ]).then(() => self.clients.claim())
  );
});