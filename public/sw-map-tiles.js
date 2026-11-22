/* eslint-disable no-restricted-globals */
/**
 * sw-map-tiles.js — Service Worker DEDICADO ao cache de tiles do mapa (offline).
 *
 * Seguro para rodar ate no preview de desenvolvimento porque so intercepta
 * requisicoes para os dominios de tiles do Mapbox. Nao toca no app shell nem
 * nos modulos do Vite (nao causa "codigo velho" em cache).
 *
 * Estrategia: CACHE-FIRST (rapido e funciona offline) + revalidacao em segundo
 * plano quando online. A chave de cache e NORMALIZADA (remove `sku` e
 * `access_token`, que mudam a cada sessao) para os tiles serem reaproveitados
 * offline mesmo em outra sessao.
 */

const TILES_CACHE = 'bp-map-tiles-v1';
const MAX_TILES = 6000;
const TILE_PRUNE_MISSES = 64;
const TILE_PRUNE_INTERVAL = 60 * 1000;
let tileMissesSincePrune = 0;
let lastTilePruneAt = 0;

const TILE_HOSTS = [
  'api.mapbox.com',
  'a.tiles.mapbox.com',
  'b.tiles.mapbox.com',
  'c.tiles.mapbox.com',
  'd.tiles.mapbox.com',
  'tiles.mapbox.com',
];

function isTileRequest(url) {
  // events.mapbox.com = telemetria (nao cachear)
  if (url.hostname === 'events.mapbox.com') return false;
  return TILE_HOSTS.indexOf(url.hostname) !== -1;
}

function normalizeKey(href) {
  try {
    const u = new URL(href);
    u.searchParams.delete('sku');
    u.searchParams.delete('access_token');
    // ordena os params restantes para chave estavel
    const params = Array.from(u.searchParams.entries()).sort();
    const search = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return u.origin + u.pathname + search;
  } catch (e) {
    return href;
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'TILES_COUNT') {
    caches.open(TILES_CACHE)
      .then((c) => c.keys())
      .then((keys) => {
        if (event.source) event.source.postMessage({ type: 'TILES_COUNT_RESULT', count: keys.length });
      });
  }
  if (data.type === 'TILES_CLEAR') {
    caches.delete(TILES_CACHE).then(() => {
      if (event.source) event.source.postMessage({ type: 'TILES_CLEARED' });
    });
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }
  if (!isTileRequest(url)) return; // deixa o navegador tratar (app, vite, etc.)
  event.respondWith(handleTile(event.request, url));
});

async function handleTile(request, url) {
  const cache = await caches.open(TILES_CACHE);
  const key = normalizeKey(url.href);
  const cached = await cache.match(key);
  // Hits não rebaixam o tile nem enumeram Cache Storage por requisição.
  if (cached) return cached;
  try {
    const netResp = await fetch(request, { cache: 'force-cache' });
    if (netResp && netResp.ok) {
      await safeCachePut(cache, key, netResp);
      void pruneTilesIfNeeded(cache);
    }
    return netResp;
  } catch (e) {
    /* offline — sem tile novo */
  }
  // offline e sem cache para esse tile
  return new Response('', { status: 504, statusText: 'offline-uncached-tile' });
}

async function safeCachePut(cache, request, response) {
  try {
    await cache.put(request, response.clone());
    return true;
  } catch (error) {
    console.warn('[sw-map-tiles] Cache put ignorado:', error);
    return false;
  }
}

async function pruneTilesIfNeeded(cache) {
  tileMissesSincePrune += 1;
  const now = Date.now();
  if (tileMissesSincePrune < TILE_PRUNE_MISSES && now - lastTilePruneAt < TILE_PRUNE_INTERVAL) return;
  tileMissesSincePrune = 0;
  lastTilePruneAt = now;
  try {
    const keys = await cache.keys();
    const excess = Math.max(0, keys.length - MAX_TILES);
    await Promise.all(keys.slice(0, Math.min(excess, TILE_PRUNE_MISSES)).map((key) => cache.delete(key)));
  } catch (error) {
    console.warn('[sw-map-tiles] Poda throttled falhou:', error);
  }
}
