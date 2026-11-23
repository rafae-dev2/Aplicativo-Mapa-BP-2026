import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRATEGIC_POI_ICONS,
  computeStrategicIconsSignature,
  diffStrategicIconLists,
  isStrategicPoiIconPath,
} from './poiIconCache';

test('STRATEGIC_POI_ICONS includes water trucks (represas) and transport trucks', () => {
  assert.ok(STRATEGIC_POI_ICONS.includes('/poi-water-truck-blue.png'));
  assert.ok(STRATEGIC_POI_ICONS.includes('/poi-water-truck-x.png'));
  assert.ok(STRATEGIC_POI_ICONS.includes('/poi-pin-transport-dump-truck.png'));
  assert.ok(STRATEGIC_POI_ICONS.includes('/poi-pin-transport-munck-truck.png'));
});

test('isStrategicPoiIconPath matches truck and dam icons dynamically and ignores unrelated assets', () => {
  assert.equal(isStrategicPoiIconPath('/poi-water-truck-blue.png'), true);
  assert.equal(isStrategicPoiIconPath('/poi-water-truck-x.png'), true);
  assert.equal(isStrategicPoiIconPath('/poi-pin-transport-dump-truck.png'), true);
  assert.equal(isStrategicPoiIconPath('/poi-pin-transport-munck-truck.png'), true);
  assert.equal(isStrategicPoiIconPath('/poi-pin-transport-custom-v2.webp'), true);

  assert.equal(isStrategicPoiIconPath('/index.html'), false);
  assert.equal(isStrategicPoiIconPath('/branco-peres.mapdata'), false);
  assert.equal(isStrategicPoiIconPath('/assets/index-abc123.js'), false);
});

test('computeStrategicIconsSignature is order-independent and changes only when official assets or version change', () => {
  const sigA = computeStrategicIconsSignature(['/poi-a.png', '/poi-b.png'], 'v1');
  const sigReordered = computeStrategicIconsSignature(['/poi-b.png', '/poi-a.png', '/poi-a.png'], 'v1');
  const sigNewAsset = computeStrategicIconsSignature(['/poi-a.png', '/poi-b.png', '/poi-c.png'], 'v1');
  const sigNewVersion = computeStrategicIconsSignature(['/poi-a.png', '/poi-b.png'], 'v2');

  assert.equal(sigA, sigReordered);
  assert.notEqual(sigA, sigNewAsset);
  assert.notEqual(sigA, sigNewVersion);
});

test('diffStrategicIconLists detects zero changes for identical list and exact delta on additions/removals', () => {
  const unchanged = diffStrategicIconLists(STRATEGIC_POI_ICONS, [...STRATEGIC_POI_ICONS]);
  assert.equal(unchanged.hasChanges, false);
  assert.deepEqual(unchanged.added, []);
  assert.deepEqual(unchanged.removed, []);

  const updated = diffStrategicIconLists(
    ['/poi-water-truck-blue.png', '/poi-old.png'],
    ['/poi-water-truck-blue.png', '/poi-new-truck.png']
  );
  assert.equal(updated.hasChanges, true);
  assert.deepEqual(updated.added, ['/poi-new-truck.png']);
  assert.deepEqual(updated.removed, ['/poi-old.png']);
  assert.deepEqual(updated.unchanged, ['/poi-water-truck-blue.png']);
});
