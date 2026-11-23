/**
 * offlineLayersStatus — Auditoria real e sincronização sob demanda de todas as
 * camadas de dados armazenadas localmente (IndexedDB + Cache Storage + SW)
 * para operação no campo sem internet ("na roça sem conexão").
 */

import {
  OFFLINE_TILE_CACHE_NAMES,
  hasOfflineDataset,
  loadOfflineDataset,
  saveOfflineDataset,
  formatStorageSize,
} from './offlineMapEngine';
import { hotTalhoesCache, type HotTalhoesStats } from './hotTalhoesCache';
import {
  STRATEGIC_POI_ICONS,
  POI_ICONS_CACHE_NAME,
  warmStrategicPoiIconsCache,
} from './poiIconCache';
import {
  CONFIG_AND_METADATA_ASSETS,
  CONFIG_METADATA_CACHE_NAME,
  warmConfigMetadataCache,
} from './configMetadataCache';
import { pendingCount as getPendingCount, loadPoisSnapshotIDB } from './offlineQueue';

export type OfflineLayerId =
  | 'talhoes-polygons'
  | 'hot-talhoes'
  | 'talhoes-labels'
  | 'pois-offline'
  | 'poi-icons'
  | 'config-metadata'
  | 'map-base';

export type LayerCacheState = 'cached' | 'partial' | 'missing';

export interface OfflineLayerStatusItem {
  id: OfflineLayerId;
  label: string;
  detail: string;
  storage: 'IndexedDB' | 'Cache Storage' | 'Híbrido';
  state: LayerCacheState;
  essential: boolean;
  count?: number;
  expectedCount?: number;
}

export interface OfflineLayersSummary {
  online: boolean;
  serviceWorkerReady: boolean;
  readyForField: boolean;
  cachedEssentialCount: number;
  totalEssentialCount: number;
  readinessPercent: number;
  headline: string;
  subline: string;
  estimatedUsageLabel: string | null;
  pendingSyncOps: number;
  hotTalhoesStats: HotTalhoesStats;
  layers: OfflineLayerStatusItem[];
  checkedAt: number;
}

/**
 * Avaliador puro de prontidão offline para uso em campo (testável sem DOM).
 */
export function evaluateOfflineReadiness(
  layers: readonly OfflineLayerStatusItem[],
  meta: {
    online: boolean;
    serviceWorkerReady: boolean;
    pendingSyncOps: number;
  }
): {
  readyForField: boolean;
  cachedEssentialCount: number;
  totalEssentialCount: number;
  readinessPercent: number;
  headline: string;
  subline: string;
} {
  const essentialLayers = layers.filter((l) => l.essential);
  const totalEssentialCount = essentialLayers.length;
  const cachedEssentialCount = essentialLayers.filter((l) => l.state === 'cached').length;
  const partialEssentialCount = essentialLayers.filter((l) => l.state === 'partial').length;
  const readinessPercent =
    totalEssentialCount > 0
      ? Math.round(((cachedEssentialCount + partialEssentialCount * 0.5) / totalEssentialCount) * 100)
      : 100;

  const readyForField = cachedEssentialCount === totalEssentialCount && totalEssentialCount > 0;

  let headline = 'Pronto para uso sem internet';
  let subline = `${cachedEssentialCount}/${totalEssentialCount} camadas essenciais armazenadas no aparelho`;

  if (!readyForField) {
    const missingNames = essentialLayers
      .filter((l) => l.state !== 'cached')
      .map((l) => l.label);
    headline = meta.online ? 'Sincronização offline incompleta' : 'Cache offline parcial';
    subline = `Faltam: ${missingNames.slice(0, 2).join(', ')}${missingNames.length > 2 ? ` (+${missingNames.length - 2})` : ''}`;
  } else if (!meta.online) {
    headline = 'Operando offline no campo';
    subline =
      meta.pendingSyncOps > 0
        ? `${cachedEssentialCount}/${totalEssentialCount} camadas em cache · ${meta.pendingSyncOps} alteração(ões) na fila`
        : `${cachedEssentialCount}/${totalEssentialCount} camadas ativas sem depender de rede`;
  } else if (meta.pendingSyncOps > 0) {
    subline = `${cachedEssentialCount}/${totalEssentialCount} camadas em cache · ${meta.pendingSyncOps} alteração(ões) pendente(s)`;
  }

  return {
    readyForField,
    cachedEssentialCount,
    totalEssentialCount,
    readinessPercent,
    headline,
    subline,
  };
}

async function countMatchingCacheAssets(
  cacheName: string,
  expectedAssets: readonly string[]
): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  try {
    const cache = await caches.open(cacheName);
    const checks = await Promise.all(
      expectedAssets.map(async (assetPath) => Boolean(await cache.match(assetPath)))
    );
    return checks.filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function countCachedTiles(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let total = 0;
  for (const cacheName of OFFLINE_TILE_CACHE_NAMES) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      total += keys.length;
    } catch {
      /* noop */
    }
  }
  return total;
}

/**
 * Inspeciona o estado real de todas as camadas persistidas em IndexedDB e
 * Cache Storage para o painel lateral.
 */
export async function inspectOfflineLayersStatus(): Promise<OfflineLayersSummary> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

  const [
    hasMapData,
    hasLabels,
    hotStats,
    poiSnapshot,
    cachedIconsCount,
    cachedConfigCount,
    tileCount,
  ] = await Promise.all([
    hasOfflineDataset('branco-peres-mapdata'),
    hasOfflineDataset('branco-peres-labels'),
    hotTalhoesCache.getStats(3),
    loadPoisSnapshotIDB(),
    countMatchingCacheAssets(POI_ICONS_CACHE_NAME, STRATEGIC_POI_ICONS),
    countMatchingCacheAssets(CONFIG_METADATA_CACHE_NAME, CONFIG_AND_METADATA_ASSETS),
    countCachedTiles(),
  ]);

  let mapFeatureCount = 0;
  if (hasMapData) {
    try {
      const raw = await loadOfflineDataset<{ features?: unknown[] }>('branco-peres-mapdata');
      mapFeatureCount = Array.isArray(raw?.features) ? raw.features.length : 0;
    } catch {
      mapFeatureCount = 0;
    }
  }

  let labelsCount = 0;
  if (hasLabels) {
    try {
      const raw = await loadOfflineDataset<{ features?: unknown[] }>('branco-peres-labels');
      labelsCount = Array.isArray(raw?.features) ? raw.features.length : 0;
    } catch {
      labelsCount = 0;
    }
  }

  let serviceWorkerReady = false;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      serviceWorkerReady = Boolean(reg?.active || navigator.serviceWorker.controller);
    } catch {
      serviceWorkerReady = false;
    }
  }

  let estimatedUsageLabel: string | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') {
        estimatedUsageLabel = formatStorageSize(est.usage);
      }
    } catch {
      /* noop */
    }
  }

  const pendingSyncOps = getPendingCount();
  const poiCount = poiSnapshot?.length ?? 0;

  const layers: OfflineLayerStatusItem[] = [
    {
      id: 'talhoes-polygons',
      label: 'Polígonos dos talhões',
      detail: hasMapData
        ? mapFeatureCount > 0
          ? `${mapFeatureCount.toLocaleString('pt-BR')} talhões salvos`
          : 'Base de fazendas salva'
        : 'Não baixado no aparelho',
      storage: 'IndexedDB',
      state: hasMapData ? 'cached' : 'missing',
      essential: true,
      count: mapFeatureCount,
    },
    {
      id: 'hot-talhoes',
      label: 'Talhões mais acessados',
      detail:
        hotStats.count > 0
          ? `${hotStats.count} polígonos · abertura rápida`
          : 'Será preenchido ao abrir talhões',
      storage: 'IndexedDB',
      state: hotStats.count > 0 ? 'cached' : 'partial',
      essential: false,
      count: hotStats.count,
    },
    {
      id: 'talhoes-labels',
      label: 'Rótulos dos talhões',
      detail: hasLabels
        ? labelsCount > 0
          ? `${labelsCount.toLocaleString('pt-BR')} rótulos salvos`
          : 'Rótulos salvos localmente'
        : 'Não baixado no aparelho',
      storage: 'IndexedDB',
      state: hasLabels ? 'cached' : 'missing',
      essential: true,
      count: labelsCount,
    },
    {
      id: 'pois-offline',
      label: 'Marcações e fila (POIs)',
      detail:
        poiSnapshot !== null
          ? `${poiCount} marcações${pendingSyncOps > 0 ? ` · ${pendingSyncOps} na fila` : ' · fila ativa'}`
          : 'Aguardando primeira carga de POIs',
      storage: 'IndexedDB',
      state: poiSnapshot !== null ? 'cached' : 'missing',
      essential: true,
      count: poiCount,
    },
    {
      id: 'poi-icons',
      label: 'Ícones (represas e caminhões)',
      detail: `${cachedIconsCount}/${STRATEGIC_POI_ICONS.length} ícones em cache`,
      storage: 'Cache Storage',
      state:
        cachedIconsCount >= STRATEGIC_POI_ICONS.length
          ? 'cached'
          : cachedIconsCount > 0
            ? 'partial'
            : 'missing',
      essential: true,
      count: cachedIconsCount,
      expectedCount: STRATEGIC_POI_ICONS.length,
    },
    {
      id: 'config-metadata',
      label: 'Configuração e metadados',
      detail: `${cachedConfigCount}/${CONFIG_AND_METADATA_ASSETS.length} arquivos locais`,
      storage: 'Cache Storage',
      state:
        cachedConfigCount >= CONFIG_AND_METADATA_ASSETS.length
          ? 'cached'
          : cachedConfigCount > 0
            ? 'partial'
            : 'missing',
      essential: true,
      count: cachedConfigCount,
      expectedCount: CONFIG_AND_METADATA_ASSETS.length,
    },
    {
      id: 'map-base',
      label: 'Mapa base e satélite',
      detail:
        tileCount > 0
          ? `Base vetorial · ${tileCount.toLocaleString('pt-BR')} tiles satélite`
          : 'Base vetorial · 0 tiles satélite',
      storage: 'Híbrido',
      state: hasMapData ? 'cached' : tileCount > 0 ? 'partial' : 'missing',
      essential: true,
      count: tileCount,
    },
  ];

  const evaluation = evaluateOfflineReadiness(layers, {
    online,
    serviceWorkerReady,
    pendingSyncOps,
  });

  return {
    online,
    serviceWorkerReady,
    ...evaluation,
    estimatedUsageLabel,
    pendingSyncOps,
    hotTalhoesStats: hotStats,
    layers,
    checkedAt: Date.now(),
  };
}

/**
 * Garante o download/armazenamento persistente de todas as camadas essenciais
 * para uso offline em campo com um único clique no painel lateral.
 */
export async function syncAllOfflineLayers(): Promise<OfflineLayersSummary> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return inspectOfflineLayersStatus();
  }

  const tasks: Promise<unknown>[] = [
    warmStrategicPoiIconsCache(),
    warmConfigMetadataCache(),
  ];

  // Garante polígonos dos talhões no IndexedDB + pré-aquecimento de talhões prioritários
  tasks.push(
    (async () => {
      let mapData = await loadOfflineDataset<{ features?: unknown[] }>('branco-peres-mapdata');
      if (!mapData) {
        try {
          const res = await fetch('/branco-peres.mapdata?v=186', { cache: 'force-cache' });
          if (res.ok) {
            mapData = (await res.json()) as { features?: unknown[] };
            await saveOfflineDataset('branco-peres-mapdata', mapData);
          }
        } catch {
          /* noop */
        }
      }
      if (mapData && Array.isArray(mapData.features) && mapData.features.length > 0) {
        await hotTalhoesCache.seedIfEmpty(mapData.features as any, 24);
      }
    })()
  );

  // Garante rótulos dos talhões no IndexedDB
  tasks.push(
    (async () => {
      const hasLabels = await hasOfflineDataset('branco-peres-labels');
      if (!hasLabels) {
        try {
          const res = await fetch('/branco-peres-labels.json?v=186', { cache: 'force-cache' });
          if (res.ok) {
            const labels = await res.json();
            await saveOfflineDataset('branco-peres-labels', labels);
          }
        } catch {
          /* noop */
        }
      }
    })()
  );

  await Promise.allSettled(tasks);
  return inspectOfflineLayersStatus();
}
