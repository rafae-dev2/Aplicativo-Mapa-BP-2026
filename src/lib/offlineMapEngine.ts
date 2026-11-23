import type { Theme } from '@/contexts/ThemeContext';

export type OfflineQualityPreset = 'fast' | 'field' | 'detailed';
export type OfflineBaseMode = 'cartographic' | 'cached-satellite';

export interface OfflineBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface SavedOfflineRegion {
  id: string;
  name: string;
  createdAt: number;
  center: [number, number];
  zoom: number;
  bounds: OfflineBounds;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  estimatedBytes: number;
  preset: OfflineQualityPreset;
}

export interface OfflineCacheStats {
  tileCount: number;
  hasMapData: boolean;
  hasLabels: boolean;
  farmFeatureCount: number;
  estimatedUsageBytes: number | null;
  estimatedQuotaBytes: number | null;
  regions: SavedOfflineRegion[];
  serviceWorkerReady: boolean;
}

export interface OfflineDownloadProgress {
  completed: number;
  total: number;
  downloaded: number;
  cachedHits: number;
  failed: number;
  percent: number;
  stage: 'preparing' | 'data' | 'tiles' | 'done';
}

export const OFFLINE_MODE_STORAGE_KEY = 'mapas-bp-offline-mode';
export const OFFLINE_BASE_STORAGE_KEY = 'mapas-bp-offline-base';
export const OFFLINE_REGIONS_STORAGE_KEY = 'mapas-areas-offline-v2';

export const OFFLINE_TILE_CACHE_NAMES = ['bp-map-tiles-v1', 'mapbox-tiles'] as const;
const IDB_NAME = 'mapas-offline-store-v1';
const IDB_STORE = 'datasets';
const AVG_TILE_BYTES = 26 * 1024; // ~26 KB average for Mapbox satellite 256/512 jpg tiles

export const QUALITY_PRESETS: Record<
  OfflineQualityPreset,
  { label: string; description: string; zoomRange: [number, number]; maxTiles: number }
> = {
  fast: {
    label: 'Rápido',
    description: 'Visão geral das fazendas (Z11–13)',
    zoomRange: [11, 13],
    maxTiles: 60,
  },
  field: {
    label: 'Campo',
    description: 'Equilíbrio ideal para talhões (Z11–14)',
    zoomRange: [11, 14],
    maxTiles: 160,
  },
  detailed: {
    label: 'Detalhado',
    description: 'Estradas e carreadores (Z12–15)',
    zoomRange: [12, 15],
    maxTiles: 280,
  },
};

export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}

export function tileCenterLngLat(x: number, y: number, z: number): { lng: number; lat: number } {
  const n = Math.pow(2, z);
  const lng = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

export function computeTileListForBounds(
  bounds: OfflineBounds,
  zooms: readonly number[],
  maxTiles = 240
): TileCoord[] {
  const jobs: TileCoord[] = [];
  const validZooms = Array.from(
    new Set(zooms.map((z) => Math.round(z)).filter((z) => z >= 2 && z <= 18))
  ).sort((a, b) => a - b);

  for (const z of validZooms) {
    const tl = lngLatToTile(bounds.west, bounds.north, z);
    const br = lngLatToTile(bounds.east, bounds.south, z);
    const minX = Math.min(tl.x, br.x);
    const maxX = Math.max(tl.x, br.x);
    const minY = Math.min(tl.y, br.y);
    const maxY = Math.max(tl.y, br.y);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        jobs.push({ z, x, y });
        if (jobs.length >= maxTiles) return jobs;
      }
    }
  }
  return jobs;
}

export function estimateDownloadBytes(tileCount: number): number {
  return Math.max(0, Math.round(tileCount)) * AVG_TILE_BYTES;
}

export function formatStorageSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function normalizeTileCacheKey(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete('sku');
    u.searchParams.delete('access_token');
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return u.origin + u.pathname + search;
  } catch {
    return href;
  }
}

export function buildMapboxSatelliteTileUrl(
  tile: TileCoord,
  accessToken: string
): string {
  return `https://api.mapbox.com/v4/mapbox.satellite/${tile.z}/${tile.x}/${tile.y}@2x.jpg90?access_token=${encodeURIComponent(accessToken)}`;
}

/**
 * Generates a lightweight local GeoJSON lat/lng coordinate grid around the
 * farm region so the offline cartographic style provides clear spatial scale
 * even when no external satellite tiles are cached.
 */
export function generateReferenceGridGeoJSON(bounds: OfflineBounds, stepDeg = 0.05) {
  const features: Array<{
    type: 'Feature';
    properties: { kind: 'major' | 'minor' };
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }> = [];

  const pad = stepDeg * 2;
  const startLng = Math.floor((bounds.west - pad) / stepDeg) * stepDeg;
  const endLng = Math.ceil((bounds.east + pad) / stepDeg) * stepDeg;
  const startLat = Math.floor((bounds.south - pad) / stepDeg) * stepDeg;
  const endLat = Math.ceil((bounds.north + pad) / stepDeg) * stepDeg;

  let idx = 0;
  for (let lng = startLng; lng <= endLng + 1e-9 && idx < 120; lng += stepDeg, idx++) {
    const isMajor = Math.round(lng / stepDeg) % 2 === 0;
    features.push({
      type: 'Feature',
      properties: { kind: isMajor ? 'major' : 'minor' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [Number(lng.toFixed(5)), Number(startLat.toFixed(5))],
          [Number(lng.toFixed(5)), Number(endLat.toFixed(5))],
        ],
      },
    });
  }

  idx = 0;
  for (let lat = startLat; lat <= endLat + 1e-9 && idx < 120; lat += stepDeg, idx++) {
    const isMajor = Math.round(lat / stepDeg) % 2 === 0;
    features.push({
      type: 'Feature',
      properties: { kind: isMajor ? 'major' : 'minor' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [Number(startLng.toFixed(5)), Number(lat.toFixed(5))],
          [Number(endLng.toFixed(5)), Number(lat.toFixed(5))],
        ],
      },
    });
  }

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

const DEFAULT_OFFLINE_GRID_BOUNDS: OfflineBounds = {
  west: -51.45,
  south: -21.85,
  east: -50.55,
  north: -21.05,
};

/**
 * Self-contained Mapbox GL v8 Style JSON with ZERO external network requests
 * (no remote tiles, sprites, or glyphs). Guarantees that farms, talhões, POIs,
 * GPS, search, and drawing tools operate normally 100% offline without blank
 * screens or style load failures.
 */
export function createOfflineCartographicStyle(
  theme: Theme = 'current',
  bounds: OfflineBounds = DEFAULT_OFFLINE_GRID_BOUNDS
) {
  const isLight = theme === 'light';
  const bgColor = isLight ? '#e9efe9' : theme === 'dark' ? '#091321' : '#0c1816';
  const minorGrid = isLight ? 'rgba(22, 90, 114, 0.09)' : 'rgba(173, 255, 47, 0.07)';
  const majorGrid = isLight ? 'rgba(22, 90, 114, 0.18)' : 'rgba(173, 255, 47, 0.14)';

  return {
    version: 8 as const,
    name: 'Branco Peres Offline Cartográfico',
    sources: {
      'bp-offline-grid': {
        type: 'geojson' as const,
        data: generateReferenceGridGeoJSON(bounds, 0.025),
      },
    },
    layers: [
      {
        id: 'bp-offline-background',
        type: 'background' as const,
        paint: {
          'background-color': bgColor,
        },
      },
      {
        id: 'bp-offline-grid-minor',
        type: 'line' as const,
        source: 'bp-offline-grid',
        filter: ['==', ['get', 'kind'], 'minor'],
        paint: {
          'line-color': minorGrid,
          'line-width': 0.8,
        },
      },
      {
        id: 'bp-offline-grid-major',
        type: 'line' as const,
        source: 'bp-offline-grid',
        filter: ['==', ['get', 'kind'], 'major'],
        paint: {
          'line-color': majorGrid,
          'line-width': 1.2,
        },
      },
    ],
  };
}

// ── IndexedDB persistence for offline datasets (mapdata + labels) ────────────

function openOfflineDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveOfflineDataset(key: string, data: unknown): Promise<boolean> {
  const db = await openOfflineDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ key, data, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadOfflineDataset<T>(key: string): Promise<T | null> {
  const db = await openOfflineDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result?.data as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function hasOfflineDataset(key: string): Promise<boolean> {
  const db = await openOfflineDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getKey(key);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// ── Saved offline regions registry ───────────────────────────────────────────

export function loadSavedOfflineRegions(): SavedOfflineRegion[] {
  try {
    const raw = localStorage.getItem(OFFLINE_REGIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineRegionRecord(region: SavedOfflineRegion): SavedOfflineRegion[] {
  const existing = loadSavedOfflineRegions().filter((item) => item.id !== region.id);
  const next = [region, ...existing].slice(0, 20);
  try {
    localStorage.setItem(OFFLINE_REGIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota fallback */
  }
  return next;
}

export function removeOfflineRegionRecord(regionId: string): SavedOfflineRegion[] {
  const next = loadSavedOfflineRegions().filter((item) => item.id !== regionId);
  try {
    localStorage.setItem(OFFLINE_REGIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

// ── Cache Storage tile inspection, prefetch & cleanup ────────────────────────

export async function getOfflineCacheStats(farmFeatureCount = 0): Promise<OfflineCacheStats> {
  let tileCount = 0;
  if (typeof caches !== 'undefined') {
    for (const cacheName of OFFLINE_TILE_CACHE_NAMES) {
      try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        tileCount += keys.length;
      } catch {
        /* ignore cache read error */
      }
    }
  }

  let estimatedUsageBytes: number | null = null;
  let estimatedQuotaBytes: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      estimatedUsageBytes = typeof est.usage === 'number' ? est.usage : null;
      estimatedQuotaBytes = typeof est.quota === 'number' ? est.quota : null;
    } catch {
      /* ignore estimate error */
    }
  }

  const [hasMapData, hasLabels] = await Promise.all([
    hasOfflineDataset('branco-peres-mapdata'),
    hasOfflineDataset('branco-peres-labels'),
  ]);

  let serviceWorkerReady = false;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      serviceWorkerReady = Boolean(reg?.active || navigator.serviceWorker.controller);
    } catch {
      serviceWorkerReady = false;
    }
  }

  return {
    tileCount,
    hasMapData,
    hasLabels,
    farmFeatureCount,
    estimatedUsageBytes,
    estimatedQuotaBytes,
    regions: loadSavedOfflineRegions(),
    serviceWorkerReady,
  };
}

export async function clearOfflineTileCaches(): Promise<void> {
  if (typeof caches !== 'undefined') {
    await Promise.all(
      OFFLINE_TILE_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false))
    );
  }
  try {
    localStorage.removeItem(OFFLINE_REGIONS_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Prefetches Mapbox style assets, farm datasets (IndexedDB), and satellite
 * raster tiles directly into Cache Storage using normalized keys compatible
 * with both `sw-map-tiles.js` and `service-worker.js`, without teleporting
 * the user's map camera.
 */
export async function downloadOfflineRegionPack(options: {
  name: string;
  bounds: OfflineBounds;
  center: [number, number];
  zoom: number;
  preset: OfflineQualityPreset;
  accessToken: string;
  geojsonData?: unknown;
  labelsData?: unknown;
  signal?: AbortSignal;
  onProgress?: (progress: OfflineDownloadProgress) => void;
}): Promise<{ cancelled: boolean; region?: SavedOfflineRegion; downloaded: number; cachedHits: number; failed: number }> {
  const { name, bounds, center, zoom, preset, accessToken, geojsonData, labelsData, signal, onProgress } = options;
  const presetConfig = QUALITY_PRESETS[preset];
  const [minZ, maxZ] = presetConfig.zoomRange;
  const zooms: number[] = [];
  for (let z = minZ; z <= maxZ; z++) zooms.push(z);

  const tiles = computeTileListForBounds(bounds, zooms, presetConfig.maxTiles);
  const styleUrls = [
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${encodeURIComponent(accessToken)}`,
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(accessToken)}`,
  ];

  const totalSteps = tiles.length + styleUrls.length;
  let completed = 0;
  let downloaded = 0;
  let cachedHits = 0;
  let failed = 0;

  const report = (stage: OfflineDownloadProgress['stage']) => {
    onProgress?.({
      completed,
      total: Math.max(1, totalSteps),
      downloaded,
      cachedHits,
      failed,
      percent: Math.min(100, Math.round((completed / Math.max(1, totalSteps)) * 100)),
      stage,
    });
  };

  report('preparing');

  // Step 1: Ensure farm polygons & labels are persisted in IndexedDB
  report('data');
  if (geojsonData) {
    await saveOfflineDataset('branco-peres-mapdata', geojsonData);
  }
  if (labelsData) {
    await saveOfflineDataset('branco-peres-labels', labelsData);
  }

  if (signal?.aborted) {
    return { cancelled: true, downloaded, cachedHits, failed };
  }

  // Step 2: Cache style JSONs + satellite tiles into shared Cache Storage
  const cache = typeof caches !== 'undefined' ? await caches.open(OFFLINE_TILE_CACHE_NAMES[0]) : null;
  const allUrls = [
    ...styleUrls,
    ...tiles.map((t) => buildMapboxSatelliteTileUrl(t, accessToken)),
  ];

  report('tiles');
  const CONCURRENCY = 6;
  let cursor = 0;

  const worker = async () => {
    while (cursor < allUrls.length) {
      if (signal?.aborted) return;
      const url = allUrls[cursor++];
      const key = normalizeTileCacheKey(url);
      try {
        if (cache) {
          const existing = await cache.match(key);
          if (existing) {
            cachedHits += 1;
            completed += 1;
            report('tiles');
            continue;
          }
        }
        const resp = await fetch(url, { mode: 'cors', signal });
        if (resp.ok) {
          if (cache) {
            await cache.put(key, resp.clone()).catch(() => {});
          }
          downloaded += 1;
        } else {
          failed += 1;
        }
      } catch {
        if (signal?.aborted) return;
        failed += 1;
      }
      completed += 1;
      report('tiles');
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (signal?.aborted) {
    return { cancelled: true, downloaded, cachedHits, failed };
  }

  const savedCount = downloaded + cachedHits;
  const region: SavedOfflineRegion = {
    id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: Date.now(),
    center,
    zoom,
    bounds,
    minZoom: minZ,
    maxZoom: maxZ,
    tileCount: savedCount,
    estimatedBytes: estimateDownloadBytes(savedCount),
    preset,
  };
  saveOfflineRegionRecord(region);

  report('done');
  return { cancelled: false, region, downloaded, cachedHits, failed };
}
