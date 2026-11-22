// Service worker: guarda os arquivos do app para abrir offline.
// Ao mudar qualquer arquivo do app, aumente a VERSAO para o iPhone baixar a nova versão.
const VERSAO = 'saude-v2';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'app.js', 'taco.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // APIs externas vão direto pela rede
  // Rede primeiro (pega atualizações); se estiver offline, usa o cache
  e.respondWith(
    fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
