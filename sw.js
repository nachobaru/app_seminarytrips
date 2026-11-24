// Guarda la app en el móvil para que funcione sin conexión.
// Al cambiar cualquier fichero, sube el número de VERSION.
const VERSION = "km-8";
const FICHEROS = ["./", "index.html", "estilo.css", "excel.js", "app.js", "nube.js", "google-script.gs", "manifest.webmanifest", "icono.svg", "icono-192.png", "icono-512.png", "icono-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHEROS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (para recibir mejoras); si no hay conexión, la copia guardada.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (new URL(e.request.url).search) return r; // no guardar la vuelta del inicio de sesión
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
