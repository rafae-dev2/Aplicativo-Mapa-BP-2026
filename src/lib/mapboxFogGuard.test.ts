import test from 'node:test';
import assert from 'node:assert/strict';
import { installMapboxFogGuard } from './mapboxFogGuard';

function createFakeMapboxLib() {
  let calls = 0;

  class FakeFog {
    properties?: Map<string, unknown>;
    get state() {
      // Mirrors mapbox-gl 2.15.0 Fog#state, which throws if `this.properties` is undefined.
      return {
        range: this.properties!.get('range'),
        horizonBlend: this.properties!.get('horizon-blend'),
        alpha: (this.properties!.get('color') as { a: number }).a,
      };
    }
    getOpacityAtLatLng() {
      return this.state.alpha;
    }
  }

  class FakeMap {
    style?: { fog?: FakeFog | null } | null;
    transform?: Record<string, unknown>;

    _queryFogOpacity() {
      calls += 1;
      return this.style && this.style.fog ? this.style.fog.getOpacityAtLatLng() : 0;
    }
  }

  return {
    lib: { Map: FakeMap },
    FakeMap,
    FakeFog,
    getCalls: () => calls,
  };
}

test('returns 0 instead of throwing when style.fog exists before fog.properties is initialized', () => {
  const { lib, FakeMap, FakeFog, getCalls } = createFakeMapboxLib();
  installMapboxFogGuard(lib);

  const map = new FakeMap();
  map.transform = {};
  map.style = { fog: new FakeFog() };

  assert.equal(map._queryFogOpacity(), 0);
  assert.equal(getCalls(), 0);
});

test('delegates to original _queryFogOpacity once fog.properties is initialized', () => {
  const { lib, FakeMap, FakeFog, getCalls } = createFakeMapboxLib();
  installMapboxFogGuard(lib);

  const fog = new FakeFog();
  fog.properties = new Map<string, unknown>([
    ['range', [0.5, 10]],
    ['horizon-blend', 0.1],
    ['color', { a: 0.42 }],
  ]);

  const map = new FakeMap();
  map.transform = {};
  map.style = { fog };

  assert.equal(map._queryFogOpacity(), 0.42);
  assert.equal(getCalls(), 1);
});

test('returns 0 when style, fog, or transform is missing', () => {
  const { lib, FakeMap, FakeFog } = createFakeMapboxLib();
  installMapboxFogGuard(lib);

  const map = new FakeMap();
  assert.equal(map._queryFogOpacity(), 0);

  map.style = { fog: null };
  assert.equal(map._queryFogOpacity(), 0);

  const fog = new FakeFog();
  fog.properties = new Map<string, unknown>([['color', { a: 0.5 }]]);
  map.style = { fog };
  // transform still missing
  assert.equal(map._queryFogOpacity(), 0);
});

test('supports ESM default export shape and is idempotent across repeated calls', () => {
  const { lib, FakeMap, FakeFog, getCalls } = createFakeMapboxLib();
  const esmModule = { default: lib };

  installMapboxFogGuard(esmModule);
  const firstWrapped = FakeMap.prototype._queryFogOpacity;

  installMapboxFogGuard(esmModule);
  installMapboxFogGuard(lib);
  assert.equal(FakeMap.prototype._queryFogOpacity, firstWrapped);

  const fog = new FakeFog();
  fog.properties = new Map<string, unknown>([['color', { a: 0.25 }]]);
  const map = new FakeMap();
  map.transform = {};
  map.style = { fog };

  assert.equal(map._queryFogOpacity(), 0.25);
  assert.equal(getCalls(), 1);
});
