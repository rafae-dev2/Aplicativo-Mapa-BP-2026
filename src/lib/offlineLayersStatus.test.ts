import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOfflineReadiness,
  type OfflineLayerStatusItem,
} from './offlineLayersStatus';

function makeLayers(overrides?: Partial<Record<OfflineLayerStatusItem['id'], OfflineLayerStatusItem['state']>>): OfflineLayerStatusItem[] {
  const base: OfflineLayerStatusItem[] = [
    { id: 'talhoes-polygons', label: 'Polígonos dos talhões', detail: '1.740 talhões', storage: 'IndexedDB', state: 'cached', essential: true },
    { id: 'hot-talhoes', label: 'Talhões mais acessados', detail: '24 prioritários', storage: 'IndexedDB', state: 'cached', essential: false },
    { id: 'talhoes-labels', label: 'Rótulos dos talhões', detail: '1.740 rótulos', storage: 'IndexedDB', state: 'cached', essential: true },
    { id: 'pois-offline', label: 'Marcações e fila (POIs)', detail: '42 marcações', storage: 'IndexedDB', state: 'cached', essential: true },
    { id: 'poi-icons', label: 'Ícones (represas e caminhões)', detail: '9/9 ícones', storage: 'Cache Storage', state: 'cached', essential: true },
    { id: 'config-metadata', label: 'Configuração e metadados', detail: '7/7 arquivos', storage: 'Cache Storage', state: 'cached', essential: true },
    { id: 'map-base', label: 'Mapa base e satélite', detail: 'Base cartográfica pronta', storage: 'Híbrido', state: 'cached', essential: true },
  ];
  return base.map((item) => ({
    ...item,
    state: overrides?.[item.id] ?? item.state,
  }));
}

test('evaluateOfflineReadiness marks field mode ready when all 6 essential layers are cached', () => {
  const onlineRes = evaluateOfflineReadiness(makeLayers(), {
    online: true,
    serviceWorkerReady: true,
    pendingSyncOps: 0,
  });
  assert.equal(onlineRes.readyForField, true);
  assert.equal(onlineRes.cachedEssentialCount, 6);
  assert.equal(onlineRes.totalEssentialCount, 6);
  assert.equal(onlineRes.readinessPercent, 100);
  assert.match(onlineRes.headline, /Pronto para uso sem internet/i);

  const offlineRes = evaluateOfflineReadiness(makeLayers(), {
    online: false,
    serviceWorkerReady: true,
    pendingSyncOps: 2,
  });
  assert.equal(offlineRes.readyForField, true);
  assert.match(offlineRes.headline, /Operando offline no campo/i);
  assert.match(offlineRes.subline, /2 alteração/);
});

test('evaluateOfflineReadiness flags exact missing layers when essential offline caches are incomplete', () => {
  const res = evaluateOfflineReadiness(
    makeLayers({
      'talhoes-labels': 'missing',
      'poi-icons': 'partial',
    }),
    {
      online: true,
      serviceWorkerReady: true,
      pendingSyncOps: 0,
    }
  );
  assert.equal(res.readyForField, false);
  assert.equal(res.cachedEssentialCount, 4);
  assert.equal(res.totalEssentialCount, 6);
  assert.equal(res.readinessPercent, 75);
  assert.match(res.subline, /Rótulos dos talhões/);
  assert.match(res.subline, /Ícones/);
});
