/**
 * hotTalhoesCache — Cache persistente em IndexedDB para os polígonos dos
 * talhões mais acessados (frequência + recência).
 *
 * Objetivo:
 * - Registrar cada talhão acessado/selecionado pelo usuário e persistir seu
 *   polígono GeoJSON completo em um store enxuto no IndexedDB
 *   (`mapas-hot-talhoes-db` / `talhoes`, limitado aos 120 mais acessados).
 * - Na reabertura do app ou retorno de instabilidade de rede, hidratar em
 *   milissegundos os polígonos prioritários antes mesmo de o pacote completo
 *   (.mapdata ~2MB) terminar de trafegar pela rede móvel.
 */

import type { GeoJSONData, GeoJSONFeature } from './geojson-validator';

export const HOT_TALHOES_DB_NAME = 'mapas-hot-talhoes-db';
export const HOT_TALHOES_DB_VERSION = 1;
export const HOT_TALHOES_STORE = 'talhoes';
export const DEFAULT_HOT_TALHOES_CAPACITY = 120;

export interface HotTalhaoRecord {
  key: string;
  fundo: number;
  talhao: number;
  accessCount: number;
  lastAccessedAt: number;
  feature: GeoJSONFeature;
}

export interface HotTalhoesStats {
  count: number;
  totalAccesses: number;
  topTalhoes: Array<{
    key: string;
    fundo: number;
    talhao: number;
    accessCount: number;
    lastAccessedAt: number;
  }>;
  updatedAt: number | null;
}

export interface HotTalhoesStorageAdapter {
  getAll(): Promise<HotTalhaoRecord[]>;
  get(key: string): Promise<HotTalhaoRecord | null>;
  put(record: HotTalhaoRecord): Promise<boolean>;
  putMany(records: readonly HotTalhaoRecord[]): Promise<boolean>;
  deleteMany(keys: readonly string[]): Promise<boolean>;
  clear(): Promise<boolean>;
}

export function makeTalhaoKey(fundo: number, talhao: number): string {
  return `${Math.trunc(fundo)}:${Math.trunc(talhao)}`;
}

/**
 * Pontuação combinada de frequência + recência (LFU com decaimento suave)
 * para manter no cache persistente os talhões mais relevantes na operação diária.
 */
export function computeHotScore(record: Pick<HotTalhaoRecord, 'accessCount' | 'lastAccessedAt'>, now = Date.now()): number {
  const ageHours = Math.max(0, (now - record.lastAccessedAt) / (1000 * 60 * 60));
  const recencyMultiplier = 1 / (1 + ageHours / 168); // meia-vida de 7 dias
  return record.accessCount * 10 + recencyMultiplier * 5;
}

export function rankHotTalhoes(
  records: readonly HotTalhaoRecord[],
  limit = DEFAULT_HOT_TALHOES_CAPACITY,
  now = Date.now()
): HotTalhaoRecord[] {
  return [...records]
    .sort((a, b) => {
      const scoreDiff = computeHotScore(b, now) - computeHotScore(a, now);
      if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
      if (b.accessCount !== a.accessCount) return b.accessCount - a.accessCount;
      return b.lastAccessedAt - a.lastAccessedAt;
    })
    .slice(0, Math.max(0, limit));
}

export function buildHotTalhoesFeatureCollection(records: readonly HotTalhaoRecord[]): GeoJSONData | null {
  if (!records || records.length === 0) return null;
  const features = records
    .map((r) => r.feature)
    .filter((f): f is GeoJSONFeature => Boolean(f && f.geometry && f.properties));
  if (features.length === 0) return null;
  return {
    type: 'FeatureCollection',
    features,
  };
}

// ── Adaptador IndexedDB nativo ────────────────────────────────────────────────

function openHotTalhoesDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(HOT_TALHOES_DB_NAME, HOT_TALHOES_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HOT_TALHOES_STORE)) {
          const store = db.createObjectStore(HOT_TALHOES_STORE, { keyPath: 'key' });
          store.createIndex('accessCount', 'accessCount', { unique: false });
          store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function createIndexedDbHotTalhoesAdapter(): HotTalhoesStorageAdapter {
  return {
    async getAll() {
      const db = await openHotTalhoesDB();
      if (!db) return [];
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(HOT_TALHOES_STORE, 'readonly');
          const req = tx.objectStore(HOT_TALHOES_STORE).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as HotTalhaoRecord[]) : []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    },

    async get(key) {
      const db = await openHotTalhoesDB();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(HOT_TALHOES_STORE, 'readonly');
          const req = tx.objectStore(HOT_TALHOES_STORE).get(key);
          req.onsuccess = () => resolve((req.result as HotTalhaoRecord | undefined) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    },

    async put(record) {
      const db = await openHotTalhoesDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(HOT_TALHOES_STORE, 'readwrite');
          tx.objectStore(HOT_TALHOES_STORE).put(record);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },

    async putMany(records) {
      if (records.length === 0) return true;
      const db = await openHotTalhoesDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(HOT_TALHOES_STORE, 'readwrite');
          const store = tx.objectStore(HOT_TALHOES_STORE);
          for (const rec of records) {
            store.put(rec);
          }
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },

    async deleteMany(keys) {
      if (keys.length === 0) return true;
      const db = await openHotTalhoesDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(HOT_TALHOES_STORE, 'readwrite');
          const store = tx.objectStore(HOT_TALHOES_STORE);
          for (const key of keys) {
            store.delete(key);
          }
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },

    async clear() {
      const db = await openHotTalhoesDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(HOT_TALHOES_STORE, 'readwrite');
          tx.objectStore(HOT_TALHOES_STORE).clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    },
  };
}

// ── Controlador de cache persistente dos talhões mais acessados ───────────────

export class HotTalhoesCacheController {
  private readonly storage: HotTalhoesStorageAdapter;
  private readonly capacity: number;
  private readonly nowFn: () => number;

  constructor(options?: {
    storage?: HotTalhoesStorageAdapter;
    capacity?: number;
    now?: () => number;
  }) {
    this.storage = options?.storage ?? createIndexedDbHotTalhoesAdapter();
    this.capacity = options?.capacity ?? DEFAULT_HOT_TALHOES_CAPACITY;
    this.nowFn = options?.now ?? (() => Date.now());
  }

  /**
   * Registra um acesso a um talhão (seleção, clique no mapa ou busca),
   * incrementa sua frequência e persiste o polígono GeoJSON no IndexedDB.
   */
  async recordAccess(feature: GeoJSONFeature): Promise<HotTalhaoRecord | null> {
    const fundo = Number(feature?.properties?.FAZENDA);
    const talhao = Number(feature?.properties?.TALHAO);
    if (!Number.isFinite(fundo) || !Number.isFinite(talhao) || !feature?.geometry) {
      return null;
    }

    const key = makeTalhaoKey(fundo, talhao);
    const now = this.nowFn();
    const existing = await this.storage.get(key);
    const updated: HotTalhaoRecord = {
      key,
      fundo,
      talhao,
      accessCount: (existing?.accessCount ?? 0) + 1,
      lastAccessedAt: now,
      feature,
    };

    await this.storage.put(updated);
    await this.pruneIfOverCapacity(now);
    return updated;
  }

  /**
   * Pré-aquece o cache com os talhões iniciais prioritários quando o cache
   * persistente ainda está vazio, garantindo carga instantânea já no primeiro uso.
   */
  async seedIfEmpty(features: readonly GeoJSONFeature[], limit = 24): Promise<number> {
    const current = await this.storage.getAll();
    if (current.length > 0 || features.length === 0) return current.length;

    const now = this.nowFn();
    const targetLimit = Math.min(limit, this.capacity);
    // Prioriza Fundo 25 (abertura padrão) seguido pelos primeiros talhões
    const prioritized = [
      ...features.filter((f) => Number(f?.properties?.FAZENDA) === 25),
      ...features.filter((f) => Number(f?.properties?.FAZENDA) !== 25),
    ].slice(0, targetLimit);

    const records: HotTalhaoRecord[] = [];
    const seen = new Set<string>();
    for (const feature of prioritized) {
      const fundo = Number(feature?.properties?.FAZENDA);
      const talhao = Number(feature?.properties?.TALHAO);
      if (!Number.isFinite(fundo) || !Number.isFinite(talhao) || !feature?.geometry) continue;
      const key = makeTalhaoKey(fundo, talhao);
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        key,
        fundo,
        talhao,
        accessCount: fundo === 25 && talhao === 1 ? 2 : 1,
        lastAccessedAt: now,
        feature,
      });
    }

    if (records.length > 0) {
      await this.storage.putMany(records);
    }
    return records.length;
  }

  private async pruneIfOverCapacity(now: number): Promise<void> {
    const all = await this.storage.getAll();
    if (all.length <= this.capacity) return;
    const ranked = rankHotTalhoes(all, this.capacity, now);
    const keepKeys = new Set(ranked.map((r) => r.key));
    const toEvict = all.filter((r) => !keepKeys.has(r.key)).map((r) => r.key);
    if (toEvict.length > 0) {
      await this.storage.deleteMany(toEvict);
    }
  }

  async getHotRecords(limit = this.capacity): Promise<HotTalhaoRecord[]> {
    const all = await this.storage.getAll();
    return rankHotTalhoes(all, limit, this.nowFn());
  }

  async loadFeatureCollection(limit = this.capacity): Promise<GeoJSONData | null> {
    const records = await this.getHotRecords(limit);
    return buildHotTalhoesFeatureCollection(records);
  }

  async getStats(topLimit = 5): Promise<HotTalhoesStats> {
    const all = await this.storage.getAll();
    const ranked = rankHotTalhoes(all, this.capacity, this.nowFn());
    const totalAccesses = ranked.reduce((sum, r) => sum + r.accessCount, 0);
    const updatedAt = ranked.reduce<number | null>(
      (max, r) => (max === null || r.lastAccessedAt > max ? r.lastAccessedAt : max),
      null
    );
    return {
      count: ranked.length,
      totalAccesses,
      topTalhoes: ranked.slice(0, topLimit).map((r) => ({
        key: r.key,
        fundo: r.fundo,
        talhao: r.talhao,
        accessCount: r.accessCount,
        lastAccessedAt: r.lastAccessedAt,
      })),
      updatedAt,
    };
  }

  async clear(): Promise<boolean> {
    return this.storage.clear();
  }
}

export const hotTalhoesCache = new HotTalhoesCacheController();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__BP_HOT_TALHOES__ = hotTalhoesCache;
}
