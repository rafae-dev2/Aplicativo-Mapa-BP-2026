import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeoJSONFeature } from './geojson-validator';
import {
  HotTalhoesCacheController,
  buildHotTalhoesFeatureCollection,
  makeTalhaoKey,
  type HotTalhaoRecord,
  type HotTalhoesStorageAdapter,
} from './hotTalhoesCache';

function createMemoryHotStorage(backing = new Map<string, HotTalhaoRecord>()): HotTalhoesStorageAdapter {
  return {
    async getAll() {
      return Array.from(backing.values()).map((r) => ({ ...r }));
    },
    async get(key) {
      const hit = backing.get(key);
      return hit ? { ...hit } : null;
    },
    async put(record) {
      backing.set(record.key, { ...record });
      return true;
    },
    async putMany(records) {
      for (const r of records) backing.set(r.key, { ...r });
      return true;
    },
    async deleteMany(keys) {
      for (const k of keys) backing.delete(k);
      return true;
    },
    async clear() {
      backing.clear();
      return true;
    },
  };
}

function makeFeature(fundo: number, talhao: number): GeoJSONFeature {
  return {
    type: 'Feature',
    properties: {
      FAZENDA: fundo,
      TALHAO: talhao,
      AREA_TOTAL: 12.5,
      ZONA: 1,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-51.04, -21.49],
        [-51.03, -21.49],
        [-51.03, -21.48],
        [-51.04, -21.48],
        [-51.04, -21.49],
      ]],
    },
  };
}

test('HotTalhoesCacheController tracks access counts, ranks frequently visited talhões, and hydrates valid GeoJSON', async () => {
  let now = 1_700_000_000_000;
  const backing = new Map<string, HotTalhaoRecord>();
  const cache = new HotTalhoesCacheController({
    storage: createMemoryHotStorage(backing),
    capacity: 10,
    now: () => (now += 1000),
  });

  await cache.recordAccess(makeFeature(25, 1));
  await cache.recordAccess(makeFeature(42, 7));
  await cache.recordAccess(makeFeature(42, 7));
  await cache.recordAccess(makeFeature(42, 7));
  await cache.recordAccess(makeFeature(10, 3));

  const stats = await cache.getStats();
  assert.equal(stats.count, 3);
  assert.equal(stats.totalAccesses, 5);
  assert.equal(stats.topTalhoes[0].key, makeTalhaoKey(42, 7));
  assert.equal(stats.topTalhoes[0].accessCount, 3);

  // Persistência entre reinicializações (novo controller lendo mesmo IndexedDB/store)
  const restarted = new HotTalhoesCacheController({
    storage: createMemoryHotStorage(backing),
    capacity: 10,
    now: () => now,
  });
  const fc = await restarted.loadFeatureCollection();
  assert.ok(fc);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 3);
  assert.equal(fc.features[0].properties.FAZENDA, 42);
  assert.equal(fc.features[0].properties.TALHAO, 7);
});

test('HotTalhoesCacheController evicts least-accessed cold talhões when over capacity', async () => {
  let now = 1_700_000_000_000;
  const cache = new HotTalhoesCacheController({
    storage: createMemoryHotStorage(),
    capacity: 3,
    now: () => (now += 60_000),
  });

  // 25:1 é muito acessado (3x), 25:2 é pouco acessado (1x), 25:3 e 25:4 entram depois
  await cache.recordAccess(makeFeature(25, 1));
  await cache.recordAccess(makeFeature(25, 1));
  await cache.recordAccess(makeFeature(25, 1));
  await cache.recordAccess(makeFeature(25, 2)); // candidato frio a despejo
  await cache.recordAccess(makeFeature(25, 3));
  await cache.recordAccess(makeFeature(25, 4));

  const records = await cache.getHotRecords();
  assert.equal(records.length, 3);
  const keys = records.map((r) => r.key);
  assert.ok(keys.includes('25:1'), 'hot talhão 25:1 must be preserved');
  assert.ok(!keys.includes('25:2'), 'coldest talhão 25:2 should be evicted');
});

test('HotTalhoesCacheController seedIfEmpty pre-warms Fundo 25 first and buildHotTalhoesFeatureCollection handles empty list', async () => {
  assert.equal(buildHotTalhoesFeatureCollection([]), null);

  const cache = new HotTalhoesCacheController({
    storage: createMemoryHotStorage(),
    capacity: 10,
  });

  const seeded = await cache.seedIfEmpty([
    makeFeature(10, 1),
    makeFeature(25, 1),
    makeFeature(25, 2),
    makeFeature(10, 2),
  ], 3);

  assert.equal(seeded, 3);
  const records = await cache.getHotRecords();
  assert.equal(records[0].key, '25:1');
  assert.ok(records.some((r) => r.key === '25:2'));
});
