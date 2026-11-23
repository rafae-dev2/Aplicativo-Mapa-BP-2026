import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lngLatToTile,
  tileCenterLngLat,
  computeTileListForBounds,
  estimateDownloadBytes,
  formatStorageSize,
  normalizeTileCacheKey,
  createOfflineCartographicStyle,
  generateReferenceGridGeoJSON,
} from './offlineMapEngine';

test('slippy tile conversion round-trips near Branco Peres region', () => {
  const lng = -50.99;
  const lat = -21.45;
  const z = 13;
  const { x, y } = lngLatToTile(lng, lat, z);
  const center = tileCenterLngLat(x, y, z);

  assert.ok(Math.abs(center.lng - lng) < 0.05);
  assert.ok(Math.abs(center.lat - lat) < 0.05);
});

test('computeTileListForBounds caps tile count cleanly and deduplicates zooms', () => {
  const bounds = { west: -51.2, south: -21.6, east: -50.8, north: -21.2 };
  const tiles = computeTileListForBounds(bounds, [11, 11, 12, 13], 25);
  assert.equal(tiles.length, 25);
  assert.ok(tiles.every((t) => t.z >= 11 && t.z <= 13));
});

test('normalizeTileCacheKey strips dynamic access_token and sku params', () => {
  const a = normalizeTileCacheKey(
    'https://api.mapbox.com/v4/mapbox.satellite/12/1467/2300@2x.jpg90?sku=101abc&access_token=pk.123'
  );
  const b = normalizeTileCacheKey(
    'https://api.mapbox.com/v4/mapbox.satellite/12/1467/2300@2x.jpg90?access_token=pk.999&sku=999xyz'
  );
  assert.equal(a, b);
  assert.equal(a, 'https://api.mapbox.com/v4/mapbox.satellite/12/1467/2300@2x.jpg90');
});

test('createOfflineCartographicStyle builds a zero-network Mapbox v8 style without remote glyphs', () => {
  const style = createOfflineCartographicStyle('current');
  assert.equal(style.version, 8);
  assert.equal('glyphs' in style, false);
  assert.equal('sprite' in style, false);
  assert.ok(style.sources['bp-offline-grid']);
  assert.ok(style.layers.some((l) => l.id === 'bp-offline-background'));

  const lightStyle = createOfflineCartographicStyle('light');
  assert.notEqual(
    (style.layers[0] as any).paint['background-color'],
    (lightStyle.layers[0] as any).paint['background-color']
  );
});

test('generateReferenceGridGeoJSON produces major and minor coordinate lines', () => {
  const grid = generateReferenceGridGeoJSON(
    { west: -51.1, south: -21.5, east: -50.9, north: -21.3 },
    0.05
  );
  assert.equal(grid.type, 'FeatureCollection');
  assert.ok(grid.features.length > 4);
  assert.ok(grid.features.some((f) => f.properties.kind === 'major'));
  assert.ok(grid.features.some((f) => f.properties.kind === 'minor'));
});

test('formatStorageSize and estimateDownloadBytes return readable labels', () => {
  assert.equal(formatStorageSize(0), '0 KB');
  assert.equal(formatStorageSize(512 * 1024), '512 KB');
  assert.equal(formatStorageSize(2.5 * 1024 * 1024), '2.5 MB');
  assert.ok(estimateDownloadBytes(100) > 2 * 1024 * 1024);
});
