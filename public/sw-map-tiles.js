/* eslint-disable no-restricted-globals */
/**
 * sw-map-tiles.js — Service Worker DEDICADO ao cache de tiles, dados do mapa e
 * ícones estratégicos (caminhões e represas) para operação visual offline.
 *
 * Otimização para redes móveis:
 *  - Os ícones oficiais de POIs usam Cache-First estrito sem revalidação em
 *    segundo plano a cada renderização.
 *  - O pré-cache só baixa ícones quando a assinatura da lista oficial
 *    (`STRATEGIC_POI_ICONS` + `STRATEGIC_POI_ICONS_VERSION`) muda ou quando um
 *    ativo obrigatório ainda não existe no cache, removendo ícones obsoletos.
 */

const TILES_CACHE = 'bp-map-tiles-v1';
const DATA_CACHE = 'mapas-branco-peres-data';
const POI_ICONS_CACHE = 'bp-poi-icons-v1';
const POI_ICONS_MANIFEST_KEY = '/__poi-icons-manifest-meta__';
const STRATEGIC_POI_ICONS_VERSION = '2026-01';
const CONFIG_METADATA_CACHE = 'bp-config-metadata-v1';
const CONFIG_METADATA_MANIFEST_KEY = '/__config-metadata-manifest__';
const CONFIG_METADATA_VERSION = '2026-01';
const MAX_TILES = 6000;
const TILE_PRUNE_MISSES = 64;
const TILE_PRUNE_INTERVAL = 60 * 1000;
let tileMissesSincePrune = 0;
let lastTilePruneAt = 0;

/**
 * Lista oficial de ícones estratégicos de caminhões e represas (pegadores de água).
 */
const STRATEGIC_POI_ICONS = [
  '/poi-water-truck-blue.png',
  '/poi-water-truck-x.png',
  '/poi-water-truck-transparent.png',
  '/poi-water-truck-unavailable.png',
  '/poi-pin-transport-dump-truck.png',
  '/poi-pin-transport-dump-truck-256.png',
  '/poi-pin-transport-munck-truck.png',
  '/poi-pin-fire.png',
  '/poi-pin-custom.png',
];

const STRATEGIC_POI_ICON_PATTERN =
  /^\/poi-(?:water-truck|pin-transport|pin-fire|pin-custom)[^/]*\.(?:png|webp|svg)$/i;

/**
 * Lista oficial de arquivos de configuração e metadados servidos em modo
 * Cache-First estrito para minimizar chamadas de rede na inicialização offline.
 */
const CONFIG_AND_METADATA_ASSETS = [
  '/manifest.json',
  '/runtime-config.js',
  '/notification-config.js',
  '/version.json',
  '/planning_data.json',
  '/planejamento_colheita.json',
  '/experimentos_2026.json',
];

const CONFIG_METADATA_EXACT_SET = new Set([
  ...CONFIG_AND_METADATA_ASSETS,
  '/app-shell-assets.json',
  '/pwa-icon-generation-report.json',
]);

const CONFIG_METADATA_PATTERN =
  /^\/(?:(?:runtime|notification|app)-config\.js|manifest(?:-[^/]+)?\.json|version\.json|app-shell-assets\.json|(?:planning_data|planejamento_colheita|experimentos_\d+)\.json)$/i;

const TILE_HOSTS = [
  'api.mapbox.com',
  'a.tiles.mapbox.com',
  'b.tiles.mapbox.com',
  'c.tiles.mapbox.com',
  'd.tiles.mapbox.com',
  'tiles.mapbox.com',
];

function computeIconListSignature(icons, version) {
  const canonical = Array.from(new Set(icons)).sort((a, b) => a.localeCompare(b));
  return `${version}::${canonical.join('|')}`;
}

function isTileRequest(url) {
  if (url.hostname === 'events.mapbox.com') return false;
  return TILE_HOSTS.indexOf(url.hostname) !== -1;
}

function isOfflineMapDataset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.endsWith('.mapdata') ||
    url.pathname.endsWith('-labels.json') ||
    url.pathname.endsWith('.geojson')
  );
}

function isStrategicPoiIcon(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    STRATEGIC_POI_ICONS.indexOf(url.pathname) !== -1 ||
    STRATEGIC_POI_ICON_PATTERN.test(url.pathname)
  );
}

function isConfigOrMetadataRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    CONFIG_METADATA_EXACT_SET.has(url.pathname) ||
    CONFIG_METADATA_PATTERN.test(url.pathname)
  );
}

function normalizeKey(href) {
  try {
    const u = new URL(href);
    u.searchParams.delete('sku');
    u.searchParams.delete('access_token');
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return u.origin + u.pathname + search;
  } catch (e) {
    return href;
  }
}

async function readIconManifest(cache) {
  try {
    const res = await cache.match(POI_ICONS_MANIFEST_KEY);
    if (!res) return null;
    const data = await res.json();
    if (!data || typeof data.signature !== 'string' || !Array.isArray(data.icons)) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeIconManifest(cache, manifest) {
  try {
    await cache.put(
      POI_ICONS_MANIFEST_KEY,
      new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch {
    /* noop */
  }
}

/**
 * Atualiza o cache de ícones de POIs somente quando houver alteração na lista
 * oficial (ou versão) ou se algum ativo obrigatório estiver ausente no cache.
 */
async function precacheStrategicPoiIcons(
  iconList = STRATEGIC_POI_ICONS,
  version = STRATEGIC_POI_ICONS_VERSION
) {
  try {
    const cache = await caches.open(POI_ICONS_CACHE);
    const urls = Array.isArray(iconList) && iconList.length ? iconList : STRATEGIC_POI_ICONS;
    const targetVersion = typeof version === 'string' && version ? version : STRATEGIC_POI_ICONS_VERSION;
    const targetSignature = computeIconListSignature(urls, targetVersion);
    const stored = await readIconManifest(cache);

    const presence = await Promise.all(
      urls.map(async (iconPath) => ({
        iconPath,
        present: Boolean(await cache.match(iconPath)),
      }))
    );
    const missing = presence.filter((item) => !item.present).map((item) => item.iconPath);

    // Zero tráfego de rede quando a lista oficial não mudou e todos os ícones já estão no cache
    if (stored && stored.signature === targetSignature && missing.length === 0) {
      return { updated: false, fetched: 0, removed: 0, count: urls.length, signature: targetSignature };
    }

    const prevIcons = stored && Array.isArray(stored.icons) ? stored.icons : [];
    const nextSet = new Set(urls);
    const prevSet = new Set(prevIcons);
    const removedIcons = prevIcons.filter((icon) => !nextSet.has(icon));
    const addedIcons = urls.filter((icon) => !prevSet.has(icon));
    const versionChanged = Boolean(stored && stored.version !== targetVersion);
    const toFetch = versionChanged ? urls : Array.from(new Set([...addedIcons, ...missing]));

    let removed = 0;
    for (const obsolete of removedIcons) {
      if (await cache.delete(obsolete)) removed += 1;
    }

    let fetched = 0;
    await Promise.allSettled(
      toFetch.map(async (iconPath) => {
        const response = await fetch(iconPath, {
          cache: versionChanged ? 'no-cache' : 'force-cache',
        });
        if (response && response.ok) {
          await safeCachePut(cache, iconPath, response);
          fetched += 1;
        }
      })
    );

    const remainingMissing = (
      await Promise.all(urls.map((iconPath) => cache.match(iconPath)))
    ).filter((match) => !match).length;

    if (remainingMissing === 0) {
      await writeIconManifest(cache, {
        signature: targetSignature,
        version: targetVersion,
        icons: urls,
        updatedAt: Date.now(),
      });
    }

    return {
      updated: fetched > 0 || removed > 0,
      fetched,
      removed,
      count: urls.length - remainingMissing,
      signature: targetSignature,
    };
  } catch (error) {
    console.warn('[sw-map-tiles] Pré-cache estratégico de ícones POI ignorado:', error);
    return { updated: false, fetched: 0, removed: 0, count: 0, signature: '' };
  }
}

async function readConfigMetadataManifest(cache) {
  try {
    const res = await cache.match(CONFIG_METADATA_MANIFEST_KEY);
    if (!res) return null;
    const data = await res.json();
    if (!data || typeof data.signature !== 'string' || !Array.isArray(data.assets)) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeConfigMetadataManifest(cache, manifest) {
  try {
    await cache.put(
      CONFIG_METADATA_MANIFEST_KEY,
      new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch {
    /* noop */
  }
}

/**
 * Pré-cache controlado por assinatura dos arquivos de configuração e metadados.
 * Só acessa a rede quando a versão/lista oficial muda ou quando falta algum arquivo.
 */
async function precacheConfigMetadata(
  assetList = CONFIG_AND_METADATA_ASSETS,
  version = CONFIG_METADATA_VERSION
) {
  try {
    const cache = await caches.open(CONFIG_METADATA_CACHE);
    const urls = Array.isArray(assetList) && assetList.length ? assetList : CONFIG_AND_METADATA_ASSETS;
    const targetVersion = typeof version === 'string' && version ? version : CONFIG_METADATA_VERSION;
    const targetSignature = computeIconListSignature(urls, targetVersion);
    const stored = await readConfigMetadataManifest(cache);

    const presence = await Promise.all(
      urls.map(async (assetPath) => ({
        assetPath,
        present: Boolean(await cache.match(assetPath)),
      }))
    );
    const missing = presence.filter((item) => !item.present).map((item) => item.assetPath);

    if (stored && stored.signature === targetSignature && missing.length === 0) {
      return { updated: false, fetched: 0, removed: 0, count: urls.length, signature: targetSignature };
    }

    const prevAssets = stored && Array.isArray(stored.assets) ? stored.assets : [];
    const nextSet = new Set(urls);
    const prevSet = new Set(prevAssets);
    const removedAssets = prevAssets.filter((asset) => !nextSet.has(asset));
    const addedAssets = urls.filter((asset) => !prevSet.has(asset));
    const versionChanged = Boolean(stored && stored.version !== targetVersion);
    const toFetch = versionChanged ? urls : Array.from(new Set([...addedAssets, ...missing]));

    let removed = 0;
    for (const obsolete of removedAssets) {
      if (await cache.delete(obsolete)) removed += 1;
    }

    let fetched = 0;
    await Promise.allSettled(
      toFetch.map(async (assetPath) => {
        const response = await fetch(assetPath, {
          cache: versionChanged ? 'no-cache' : 'force-cache',
        });
        if (response && response.ok) {
          await safeCachePut(cache, assetPath, response);
          fetched += 1;
        }
      })
    );

    const remainingMissing = (
      await Promise.all(urls.map((assetPath) => cache.match(assetPath)))
    ).filter((match) => !match).length;

    if (remainingMissing === 0) {
      await writeConfigMetadataManifest(cache, {
        signature: targetSignature,
        version: targetVersion,
        assets: urls,
        updatedAt: Date.now(),
      });
    }

    return {
      updated: fetched > 0 || removed > 0,
      fetched,
      removed,
      count: urls.length - remainingMissing,
      signature: targetSignature,
    };
  } catch (error) {
    console.warn('[sw-map-tiles] Pré-cache de configuração/metadados ignorado:', error);
    return { updated: false, fetched: 0, removed: 0, count: 0, signature: '' };
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([precacheStrategicPoiIcons(), precacheConfigMetadata()]).finally(() => {
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([self.clients.claim(), precacheStrategicPoiIcons(), precacheConfigMetadata()])
  );
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
  if (data.type === 'CACHE_POI_ICONS') {
    event.waitUntil(
      precacheStrategicPoiIcons(data.icons, data.version).then((result) => {
        if (event.source) {
          event.source.postMessage({ type: 'POI_ICONS_CACHED', ...result });
        }
      })
    );
  }
  if (data.type === 'CACHE_CONFIG_METADATA') {
    event.waitUntil(
      precacheConfigMetadata(data.assets, data.version).then((result) => {
        if (event.source) {
          event.source.postMessage({ type: 'CONFIG_METADATA_CACHED', ...result });
        }
      })
    );
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
  if (isTileRequest(url)) {
    event.respondWith(handleTile(event.request, url));
    return;
  }
  if (isConfigOrMetadataRequest(url)) {
    event.respondWith(handleConfigMetadata(event.request, url));
    return;
  }
  if (isStrategicPoiIcon(url)) {
    event.respondWith(handleStrategicPoiIcon(event.request, url));
    return;
  }
  if (isOfflineMapDataset(url)) {
    event.respondWith(handleDataset(event.request));
  }
});

/**
 * Estratégia Cache-First estrita para arquivos de configuração e metadados
 * (`manifest.json`, `runtime-config.js`, `notification-config.js`, `version.json`,
 * `planning_data.json`, etc.).
 * - Em inicialização normal/offline, entrega diretamente do cache sem gerar
 *   chamadas de rede (inclusive para URLs com query string como `?v=189`).
 * - Apenas solicitações explícitas com `?forceNetwork=1` ou header
 *   `X-BP-Force-Refresh: 1` consultam a rede primeiro (com fallback para o cache).
 */
async function handleConfigMetadata(request, url) {
  const cache = await caches.open(CONFIG_METADATA_CACHE);
  const canonicalKey = url.pathname;
  const forceNetwork =
    url.searchParams.get('forceNetwork') === '1' ||
    request.headers.get('X-BP-Force-Refresh') === '1';

  if (forceNetwork) {
    try {
      const netResp = await fetch(request, { cache: 'no-store' });
      if (netResp && netResp.ok) {
        await safeCachePut(cache, canonicalKey, netResp);
      }
      return netResp;
    } catch {
      const fallback = (await cache.match(canonicalKey)) || (await cache.match(request));
      if (fallback) return fallback;
      return new Response('', { status: 504, statusText: 'offline-uncached-config' });
    }
  }

  const cached = (await cache.match(canonicalKey)) || (await cache.match(request));
  if (cached) return cached;

  try {
    const netResp = await fetch(request, { cache: 'force-cache' });
    if (netResp && netResp.ok) {
      await safeCachePut(cache, canonicalKey, netResp);
    }
    return netResp;
  } catch {
    return new Response('', { status: 504, statusText: 'offline-uncached-config' });
  }
}

/**
 * Estratégia Cache-First estrita para ícones de caminhões e represas:
 * entrega instantânea sem gerar tráfego de revalidação em redes móveis.
 * Atualizações ocorrem apenas quando a lista oficial (`STRATEGIC_POI_ICONS` /
 * `STRATEGIC_POI_ICONS_VERSION`) muda.
 */
async function handleStrategicPoiIcon(request, url) {
  const cache = await caches.open(POI_ICONS_CACHE);
  const iconKey = url.pathname;
  const cached = (await cache.match(iconKey)) || (await cache.match(request));
  if (cached) return cached;

  try {
    const netResp = await fetch(request, { cache: 'force-cache' });
    if (netResp && netResp.ok) {
      await safeCachePut(cache, iconKey, netResp);
    }
    return netResp;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'offline-uncached-poi-icon' });
  }
}

async function handleDataset(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const netResp = await fetch(request, { cache: 'force-cache' });
    if (netResp && netResp.ok) {
      await safeCachePut(cache, request, netResp);
    }
    return netResp;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'offline-uncached-dataset' });
  }
}

async function handleTile(request, url) {
  const cache = await caches.open(TILES_CACHE);
  const key = normalizeKey(url.href);
  const cached = await cache.match(key);
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
