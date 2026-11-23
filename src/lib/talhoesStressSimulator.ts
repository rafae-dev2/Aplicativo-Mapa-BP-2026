import type { GeoJSONData, GeoJSONFeature } from './geojson-validator';
import { HotTalhoesCacheController, createIndexedDbHotTalhoesAdapter, makeTalhaoKey } from './hotTalhoesCache';

export interface StressThresholds {
  /** Tempo máximo tolerado para leitura do IndexedDB (ms) */
  maxIdbReadMs: number;
  /** Tempo máximo tolerado para renderização completa dos polígonos no mapa (ms) */
  maxMapRenderMs: number;
  /** Maior duração de frame único tolerada antes de considerar travamento de UI (ms) */
  maxSingleFrameMs: number;
  /** Total Blocking Time (soma de parcelas > 50ms) máximo tolerado (ms) */
  maxTotalBlockingTimeMs: number;
}

export const DEFAULT_STRESS_THRESHOLDS: StressThresholds = {
  maxIdbReadMs: 1200,
  maxMapRenderMs: 4000,
  maxSingleFrameMs: 450,
  maxTotalBlockingTimeMs: 900,
};

export interface FrameResponsivenessMetrics {
  frameCount: number;
  avgFrameMs: number;
  avgFps: number;
  p95FrameMs: number;
  maxFrameMs: number;
  framesOver50ms: number;
  framesOver100ms: number;
  longTaskCount: number;
  totalBlockingTimeMs: number;
  uiResponsive: boolean;
}

export interface TalhoesStressReport {
  timestamp: string;
  talhaoCount: number;
  totalVertices: number;
  totalRings: number;
  payloadBytes: number;
  idbSeedMs: number;
  idbReadMs: number;
  geoJsonBuildMs: number;
  mapRenderMs: number;
  totalPipelineMs: number;
  mapSourceUpdated: boolean;
  responsiveness: FrameResponsivenessMetrics;
  thresholds: StressThresholds;
  passed: boolean;
  failureReasons: string[];
}

export interface TalhoesStressRunOptions {
  /** Quantidade de talhões complexos (mínimo garantido: 100, padrão: 120) */
  count?: number;
  /** Quantidade de vértices no anel externo de cada talhão (padrão: 72) */
  verticesPerRing?: number;
  /** Incluir anel interno (ilha/APP) para estressar triangulação WebGL (padrão: true) */
  includeInteriorHole?: boolean;
  /** Thresholds customizados para validação de responsividade */
  thresholds?: Partial<StressThresholds>;
  /** Se verdadeiro, imprime relatório tabular no console */
  logReport?: boolean;
}

/**
 * Gera N talhões agrícolas complexos (polígonos irregulares de alta densidade de vértices,
 * com recortes internos opcionais simulando áreas de APP/represas) na região da Branco Peres.
 */
export function generateComplexTalhoes(
  count = 120,
  verticesPerRing = 72,
  includeInteriorHole = true
): GeoJSONFeature[] {
  const safeCount = Math.max(100, Math.floor(count));
  const safeVertices = Math.max(24, Math.floor(verticesPerRing));
  const cols = Math.ceil(Math.sqrt(safeCount));
  const originLng = -51.14;
  const originLat = -21.55;
  const cellSpan = 0.012;
  const baseRadius = 0.0044;

  const features: GeoJSONFeature[] = [];

  for (let i = 0; i < safeCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const centerLng = originLng + col * cellSpan + ((row % 2) * 0.0018);
    const centerLat = originLat + row * cellSpan;

    // Anel externo recortado/ondulado (curvas de nível agrícolas)
    const outerRing: number[][] = [];
    for (let v = 0; v < safeVertices; v++) {
      const angle = (v / safeVertices) * Math.PI * 2;
      const harmonic =
        1 +
        0.16 * Math.sin(angle * 3 + i * 0.45) +
        0.09 * Math.cos(angle * 7 - i * 0.31) +
        0.05 * Math.sin(angle * 13 + i * 0.77);
      const rLng = baseRadius * harmonic * 1.08;
      const rLat = baseRadius * harmonic * 0.92;
      outerRing.push([
        Number((centerLng + Math.cos(angle) * rLng).toFixed(6)),
        Number((centerLat + Math.sin(angle) * rLat).toFixed(6)),
      ]);
    }
    outerRing.push([...outerRing[0]]);

    const rings: number[][][] = [outerRing];

    // Recorte interno (sentido contrário) para estressar earcut/WebGL tessellation
    if (includeInteriorHole) {
      const holeVertices = 18;
      const holeRing: number[][] = [];
      for (let h = holeVertices - 1; h >= 0; h--) {
        const angle = (h / holeVertices) * Math.PI * 2;
        const holeRadius = baseRadius * (0.22 + 0.04 * Math.sin(angle * 4 + i));
        holeRing.push([
          Number((centerLng + Math.cos(angle) * holeRadius).toFixed(6)),
          Number((centerLat + Math.sin(angle) * holeRadius).toFixed(6)),
        ]);
      }
      holeRing.push([...holeRing[0]]);
      rings.push(holeRing);
    }

    const fazenda = 900 + Math.floor(i / 10);
    const talhao = (i % 10) + 1;

    features.push({
      type: 'Feature',
      properties: {
        FAZENDA: fazenda,
        TALHAO: talhao,
        AREA_TOTAL: Number((18.5 + (i % 27) * 2.35).toFixed(2)),
        ZONA: (i % 4) + 1,
      },
      geometry: {
        type: 'Polygon',
        coordinates: rings,
      },
    });
  }

  return features;
}

/**
 * Conta o total real de vértices e anéis em uma FeatureCollection GeoJSON.
 */
export function countGeoJsonVertices(fc: GeoJSONData): { totalVertices: number; totalRings: number } {
  let totalVertices = 0;
  let totalRings = 0;

  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (!geom || !Array.isArray(geom.coordinates)) continue;
    if (geom.type === 'Polygon') {
      const rings = geom.coordinates as number[][][];
      totalRings += rings.length;
      for (const ring of rings) {
        totalVertices += Array.isArray(ring) ? ring.length : 0;
      }
    } else if (geom.type === 'MultiPolygon') {
      const polys = geom.coordinates as number[][][][];
      for (const poly of polys) {
        totalRings += poly.length;
        for (const ring of poly) {
          totalVertices += Array.isArray(ring) ? ring.length : 0;
        }
      }
    }
  }

  return { totalVertices, totalRings };
}

/**
 * Analisa tempos de frame (rAF) e Long Tasks para validar se a thread principal
 * permaneceu responsiva durante leitura IndexedDB + renderização do mapa.
 */
export function analyzeFrameTimings(
  frameDeltasMs: number[],
  longTaskDurationsMs: number[] = [],
  thresholds: Partial<StressThresholds> = {}
): FrameResponsivenessMetrics {
  const merged = { ...DEFAULT_STRESS_THRESHOLDS, ...thresholds };
  const cleanDeltas = frameDeltasMs
    .filter((d) => Number.isFinite(d) && d > 0)
    .map((d) => Number(d.toFixed(2)));

  if (cleanDeltas.length === 0) {
    return {
      frameCount: 0,
      avgFrameMs: 0,
      avgFps: 0,
      p95FrameMs: 0,
      maxFrameMs: 0,
      framesOver50ms: 0,
      framesOver100ms: 0,
      longTaskCount: longTaskDurationsMs.length,
      totalBlockingTimeMs: 0,
      uiResponsive: false,
    };
  }

  const sorted = [...cleanDeltas].sort((a, b) => a - b);
  const sum = cleanDeltas.reduce((acc, v) => acc + v, 0);
  const avgFrameMs = Number((sum / cleanDeltas.length).toFixed(2));
  const avgFps = Number(Math.min(120, 1000 / Math.max(avgFrameMs, 1)).toFixed(1));
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95FrameMs = Number(sorted[p95Idx].toFixed(2));
  const maxFrameMs = Number(sorted[sorted.length - 1].toFixed(2));
  const framesOver50ms = cleanDeltas.filter((d) => d > 50).length;
  const framesOver100ms = cleanDeltas.filter((d) => d > 100).length;

  // TBT: usa Long Tasks nativas se disponíveis; caso contrário deriva de frames > 50ms
  const tbtSource =
    longTaskDurationsMs.length > 0
      ? longTaskDurationsMs.reduce((acc, d) => acc + Math.max(0, d - 50), 0)
      : cleanDeltas.reduce((acc, d) => acc + Math.max(0, d - 50), 0);
  const totalBlockingTimeMs = Number(tbtSource.toFixed(1));

  const uiResponsive =
    maxFrameMs <= merged.maxSingleFrameMs &&
    totalBlockingTimeMs <= merged.maxTotalBlockingTimeMs;

  return {
    frameCount: cleanDeltas.length,
    avgFrameMs,
    avgFps,
    p95FrameMs,
    maxFrameMs,
    framesOver50ms,
    framesOver100ms,
    longTaskCount: longTaskDurationsMs.length,
    totalBlockingTimeMs,
    uiResponsive,
  };
}

let registeredMapInstance: any = null;

export function registerBenchmarkMapInstance(map: any | null): void {
  registeredMapInstance = map;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function waitAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * Executa a simulação completa no navegador:
 * 1) Grava 100+ talhões complexos no IndexedDB (`mapas-hot-talhoes-db`) preservando backup;
 * 2) Inicia monitor de frames (`requestAnimationFrame`) + `PerformanceObserver('longtask')`;
 * 3) Força leitura fria do IndexedDB, monta FeatureCollection e injeta na fonte Mapbox `fazendas`;
 * 4) Valida renderização WebGL + responsividade da UI e restaura o estado original ao final.
 */
export async function runIndexedDbTalhoesStressSimulation(
  options: TalhoesStressRunOptions = {}
): Promise<TalhoesStressReport> {
  const count = Math.max(100, options.count ?? 120);
  const verticesPerRing = Math.max(24, options.verticesPerRing ?? 72);
  const includeInteriorHole = options.includeInteriorHole ?? true;
  const thresholds: StressThresholds = {
    ...DEFAULT_STRESS_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };

  const storage = createIndexedDbHotTalhoesAdapter();
  const benchController = new HotTalhoesCacheController({
    storage,
    capacity: Math.max(150, count + 20),
  });

  // Backup do conteúdo real do IndexedDB e da fonte Mapbox para não corromper dados do usuário
  const originalRecords = await storage.getAll();
  const map = registeredMapInstance;
  const originalSourceData = (() => {
    try {
      const src = map?.getSource?.('fazendas');
      return src?._data ? src._data : null;
    } catch {
      return null;
    }
  })();

  const complexFeatures = generateComplexTalhoes(count, verticesPerRing, includeInteriorHole);
  const syntheticRecords = complexFeatures.map((feature, index) => {
    const fundo = Number(feature.properties.FAZENDA);
    const talhao = Number(feature.properties.TALHAO);
    return {
      key: makeTalhaoKey(fundo, talhao),
      fundo,
      talhao,
      accessCount: count - index + 1,
      lastAccessedAt: Date.now() - index * 1000,
      feature,
    };
  });

  // 1) Grava os 100+ talhões complexos no IndexedDB
  const seedStart = nowMs();
  await storage.clear();
  await storage.putMany(syntheticRecords);
  const idbSeedMs = Number((nowMs() - seedStart).toFixed(2));

  // 2) Inicia observadores de frame e Long Tasks antes da leitura forçada
  const frameDeltas: number[] = [];
  const longTasks: number[] = [];
  let trackingFrames = true;
  let lastFrameAt = nowMs();

  const tick = () => {
    if (!trackingFrames) return;
    const current = nowMs();
    frameDeltas.push(current - lastFrameAt);
    lastFrameAt = current;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  let longTaskObserver: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 0) longTasks.push(entry.duration);
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      longTaskObserver = null;
    }
  }

  let idbReadMs = 0;
  let geoJsonBuildMs = 0;
  let mapRenderMs = 0;
  let mapSourceUpdated = false;
  let totalVertices = 0;
  let totalRings = 0;
  let payloadBytes = 0;
  let loadedCount = 0;

  const pipelineStart = nowMs();
  try {
    // 3) Leitura forçada do IndexedDB
    const readStart = nowMs();
    const loadedRecords = await benchController.getHotRecords(count);
    idbReadMs = Number((nowMs() - readStart).toFixed(2));
    loadedCount = loadedRecords.length;

    // 4) Montagem da FeatureCollection GeoJSON
    const buildStart = nowMs();
    const fc: GeoJSONData = {
      type: 'FeatureCollection',
      features: loadedRecords.map((r) => r.feature),
    };
    const counts = countGeoJsonVertices(fc);
    totalVertices = counts.totalVertices;
    totalRings = counts.totalRings;
    payloadBytes = JSON.stringify(fc).length;
    geoJsonBuildMs = Number((nowMs() - buildStart).toFixed(2));

    // 5) Renderização no Mapbox WebGL + espera de frames reais
    const renderStart = nowMs();
    const source = map?.getSource?.('fazendas');
    if (source && typeof source.setData === 'function') {
      mapSourceUpdated = true;
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(guardTimer);
          resolve();
        };
        const guardTimer = setTimeout(finish, 3500);
        try {
          map.once('idle', finish);
          source.setData(fc);
          map.triggerRepaint?.();
        } catch {
          finish();
        }
      });
    }
    await waitAnimationFrames(14);
    mapRenderMs = Number((nowMs() - renderStart).toFixed(2));
  } finally {
    trackingFrames = false;
    try {
      longTaskObserver?.disconnect();
    } catch {
      /* noop */
    }

    // Restaura estado original no IndexedDB e na fonte do mapa
    try {
      await storage.clear();
      if (originalRecords.length > 0) {
        await storage.putMany(originalRecords);
      }
    } catch {
      /* noop */
    }

    try {
      if (originalSourceData && map?.getSource?.('fazendas')?.setData) {
        map.getSource('fazendas').setData(originalSourceData);
      }
    } catch {
      /* noop */
    }
  }

  const totalPipelineMs = Number((nowMs() - pipelineStart).toFixed(2));
  const responsiveness = analyzeFrameTimings(frameDeltas, longTasks, thresholds);

  const failureReasons: string[] = [];
  if (loadedCount < 100) {
    failureReasons.push(`Esperados >= 100 talhões lidos do IndexedDB, obtidos ${loadedCount}`);
  }
  if (idbReadMs > thresholds.maxIdbReadMs) {
    failureReasons.push(`Leitura IndexedDB excedeu limite (${idbReadMs}ms > ${thresholds.maxIdbReadMs}ms)`);
  }
  if (mapRenderMs > thresholds.maxMapRenderMs) {
    failureReasons.push(`Renderização do mapa excedeu limite (${mapRenderMs}ms > ${thresholds.maxMapRenderMs}ms)`);
  }
  if (!responsiveness.uiResponsive) {
    failureReasons.push(
      `UI apresentou travamento (frame máx ${responsiveness.maxFrameMs}ms, TBT ${responsiveness.totalBlockingTimeMs}ms)`
    );
  }

  const report: TalhoesStressReport = {
    timestamp: new Date().toISOString(),
    talhaoCount: loadedCount,
    totalVertices,
    totalRings,
    payloadBytes,
    idbSeedMs,
    idbReadMs,
    geoJsonBuildMs,
    mapRenderMs,
    totalPipelineMs,
    mapSourceUpdated,
    responsiveness,
    thresholds,
    passed: failureReasons.length === 0,
    failureReasons,
  };

  if (options.logReport !== false && typeof console !== 'undefined') {
    const badgeColor = report.passed ? '#14532d' : '#7f1d1d';
    const textColor = report.passed ? '#bbf7d0' : '#fecaca';
    console.info(
      `%c[TalhoesStressSim · ${report.passed ? 'APROVADO' : 'FALHOU'}]%c ${report.talhaoCount} talhões (${report.totalVertices.toLocaleString('pt-BR')} vértices) | IDB: ${report.idbReadMs}ms | Render: ${report.mapRenderMs}ms | FPS: ${report.responsiveness.avgFps} | Frame máx: ${report.responsiveness.maxFrameMs}ms | TBT: ${report.responsiveness.totalBlockingTimeMs}ms`,
      `background:${badgeColor};color:${textColor};font-weight:700;padding:2px 6px;border-radius:4px;`,
      'color:inherit;font-weight:600;',
      report
    );
  }

  return report;
}

if (typeof window !== 'undefined') {
  (window as any).__BP_TALHOES_BENCH__ = {
    run: runIndexedDbTalhoesStressSimulation,
    registerMap: registerBenchmarkMapInstance,
    generateComplexTalhoes,
    analyzeFrameTimings,
  };
}
