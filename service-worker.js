const CACHE_NAME = "primary-medication-v51";
const APP_SHELL = ["./", "./index.html", "./style.css", "./header-layout.css", "./text-mark-fix.css", "./drugs.js", "./outpatient-loader.js", "./outpatient-drugs.js", "./outpatient-web-verification.js", "./drug-lookup.js", "./pharmacy-scope.js", "./catalog-data-loader.js", "./outpatient-clinical-hydration.js", "./chinese-drug-labels.json?v=14", "./app.js", "./outpatient-metadata-ui.js", "./fast-search-ui.js", "./smart-add-fix.js", "./free-smart-source-v11.js", "./notebook-scroll-fix.js", "./mark-notebook-ui.js", "./mark-menu-below-selection.js", "./header-brand.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response.ok && response.type !== "opaque") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchAndCache(event.request)
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetchAndCache(event.request))
  );
});
