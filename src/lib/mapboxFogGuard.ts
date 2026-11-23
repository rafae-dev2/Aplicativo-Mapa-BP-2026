const GUARD_INSTALLED = Symbol.for('mapas-bp.mapbox-fog-guard');

interface MapboxFogLike {
  properties?: {
    get?: (name: string) => unknown;
  };
}

interface MapboxMapInstanceLike {
  style?: {
    fog?: MapboxFogLike | null;
  } | null;
  transform?: unknown;
}

type QueryFogOpacityFn = ((this: MapboxMapInstanceLike, lngLat: unknown) => number) & {
  [GUARD_INSTALLED]?: boolean;
};

interface MapboxLibLike {
  Map?: {
    prototype?: {
      _queryFogOpacity?: QueryFogOpacityFn;
    };
  };
}

function extractMapboxLib(moduleOrLib: unknown): MapboxLibLike | null {
  if (!moduleOrLib || typeof moduleOrLib !== 'object') return null;
  if ('Map' in moduleOrLib) return moduleOrLib as MapboxLibLike;
  if ('default' in moduleOrLib) {
    const def = (moduleOrLib as { default?: unknown }).default;
    if (def && typeof def === 'object' && 'Map' in def) {
      return def as MapboxLibLike;
    }
  }
  return null;
}

/**
 * Guards `mapbox-gl@2.15.x` `Map.prototype._queryFogOpacity` against a known
 * race condition where `Marker._evaluateOpacity` runs while `style.fog` exists
 * on a freshly parsed style (initial load or `setStyle` reload), before the
 * first render frame calls `fog.recalculate(...)` to initialize `fog.properties`.
 */
export function installMapboxFogGuard<T>(moduleOrLib: T): T {
  const lib = extractMapboxLib(moduleOrLib);
  const mapProto = lib?.Map?.prototype;

  if (!mapProto || typeof mapProto._queryFogOpacity !== 'function') {
    return moduleOrLib;
  }

  if (mapProto._queryFogOpacity[GUARD_INSTALLED]) {
    return moduleOrLib;
  }

  const originalQueryFogOpacity = mapProto._queryFogOpacity;
  const guardedQueryFogOpacity: QueryFogOpacityFn = function (this: MapboxMapInstanceLike, lngLat: unknown): number {
    const fog = this?.style?.fog;
    if (!this?.transform || !fog || !fog.properties || typeof fog.properties.get !== 'function') {
      return 0;
    }
    return originalQueryFogOpacity.call(this, lngLat);
  };

  guardedQueryFogOpacity[GUARD_INSTALLED] = true;
  mapProto._queryFogOpacity = guardedQueryFogOpacity;

  return moduleOrLib;
}

let guardedMapboxLibPromise: Promise<any> | null = null;

/**
 * Lazily loads `mapbox-gl`, installs the fog opacity guard before any `Map`
 * instance is constructed, and caches the resulting promise for `react-map-gl`.
 */
export function getGuardedMapboxLib(): Promise<any> {
  if (!guardedMapboxLibPromise) {
    guardedMapboxLibPromise = import('mapbox-gl').then((mod) => installMapboxFogGuard(mod));
  }
  return guardedMapboxLibPromise;
}
