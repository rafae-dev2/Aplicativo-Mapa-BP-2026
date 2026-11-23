/**
 * mapPerformanceMonitor — Monitor de performance em tempo real para o console
 * do desenvolvedor (sem poluir a interface do usuário).
 *
 * Mede o carregamento dos componentes do mapa (estilo WebGL, GeoJSON de
 * fazendas, rótulos, hidratação e fetch de POIs, renderização de marcadores) e
 * acompanha especificamente o ciclo pós-reconexão offline -> online para
 * identificar gargalos no recarregamento de POIs.
 */

export type MapPerfPhase =
  | 'map-shell-mount'
  | 'map-style-load'
  | 'farm-geojson-load'
  | 'farm-labels-load'
  | 'poi-initial-hydrate'
  | 'poi-initial-fetch'
  | 'poi-markers-render'
  | 'reconnect-queue-batch-flush'
  | 'reconnect-poi-fetch'
  | 'reconnect-poi-reconcile'
  | 'reconnect-poi-render';

export type PerfSeverity = 'ok' | 'slow' | 'bottleneck';

export interface PerfBudget {
  label: string;
  warnMs: number;
  criticalMs: number;
  hint: string;
}

export interface PerfSample {
  phase: MapPerfPhase;
  label: string;
  durationMs: number;
  severity: PerfSeverity;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface BottleneckFinding {
  phase: MapPerfPhase;
  label: string;
  durationMs: number;
  sharePercent: number;
  severity: PerfSeverity;
  hint: string;
}

export interface PerformanceReport {
  totalMs: number;
  samples: PerfSample[];
  bottlenecks: BottleneckFinding[];
  slowestPhase: BottleneckFinding | null;
  summaryHint: string;
}

export const PERF_BUDGETS: Record<MapPerfPhase, PerfBudget> = {
  'map-shell-mount': {
    label: 'Montagem do MapContainer',
    warnMs: 250,
    criticalMs: 700,
    hint: 'Reduzir trabalho síncrono na montagem inicial do componente do mapa.',
  },
  'map-style-load': {
    label: 'Carregamento do estilo WebGL/Mapbox',
    warnMs: 1800,
    criticalMs: 3500,
    hint: 'Latência ao carregar estilo/tiles remotos; pré-cache offline reduz esse tempo.',
  },
  'farm-geojson-load': {
    label: 'Polígonos das fazendas (.mapdata)',
    warnMs: 1200,
    criticalMs: 2500,
    hint: 'Parsing ou download do arquivo de talhões alto; cache em IndexedDB acelera.',
  },
  'farm-labels-load': {
    label: 'Rótulos dos talhões (-labels.json)',
    warnMs: 600,
    criticalMs: 1500,
    hint: 'Carregamento de rótulos lento; manter persistência local no IndexedDB.',
  },
  'poi-initial-hydrate': {
    label: 'Hidratação local de POIs (IndexedDB)',
    warnMs: 120,
    criticalMs: 350,
    hint: 'Snapshot local grande (possivelmente fotos base64); manter compressão ativa.',
  },
  'poi-initial-fetch': {
    label: 'Fetch inicial de POIs (Supabase)',
    warnMs: 800,
    criticalMs: 1800,
    hint: 'Latência na consulta inicial de POIs no backend; avaliar paginação ou projeção sem fotos pesadas.',
  },
  'poi-markers-render': {
    label: 'Renderização inicial de marcadores POI',
    warnMs: 120,
    criticalMs: 300,
    hint: 'Muitos marcadores DOM simultâneos; viewport culling ou clustering reduz custo de layout.',
  },
  'reconnect-queue-batch-flush': {
    label: 'Envio em lote (batch) do IndexedDB pós-reconexão',
    warnMs: 1000,
    criticalMs: 2500,
    hint: 'Upload do lote pendente demorado (verificar tamanho de fotos ou latência da rede móvel).',
  },
  'reconnect-poi-fetch': {
    label: 'Recarregamento de POIs após retorno offline',
    warnMs: 800,
    criticalMs: 1800,
    hint: 'Principal gargalo de rede pós-reconexão: consulta completa de POIs lenta ao voltar do modo offline.',
  },
  'reconnect-poi-reconcile': {
    label: 'Reconciliação de POIs pós-reconexão',
    warnMs: 50,
    criticalMs: 150,
    hint: 'Mesclagem local de conflitos/tombstones acima do ideal.',
  },
  'reconnect-poi-render': {
    label: 'Pintura dos marcadores POI pós-reconexão',
    warnMs: 120,
    criticalMs: 300,
    hint: 'Re-renderização de marcadores DOM após reconexão acima do orçamento de 120 ms.',
  },
};

export function classifyPhaseSeverity(phase: MapPerfPhase, durationMs: number): PerfSeverity {
  const budget = PERF_BUDGETS[phase];
  if (durationMs >= budget.criticalMs) return 'bottleneck';
  if (durationMs >= budget.warnMs) return 'slow';
  return 'ok';
}

/**
 * Analisa um conjunto de amostras medidas, calcula participação percentual de
 * cada etapa e identifica gargalos concretos com diagnóstico acionável.
 */
export function analyzePerformanceBottlenecks(samples: readonly PerfSample[]): PerformanceReport {
  const totalMs = Math.round(samples.reduce((sum, s) => sum + Math.max(0, s.durationMs), 0) * 10) / 10;
  const findings: BottleneckFinding[] = samples
    .map((sample) => {
      const budget = PERF_BUDGETS[sample.phase];
      const sharePercent = totalMs > 0 ? Math.round((sample.durationMs / totalMs) * 100) : 0;
      return {
        phase: sample.phase,
        label: sample.label,
        durationMs: Math.round(sample.durationMs * 10) / 10,
        sharePercent,
        severity: sample.severity,
        hint: budget.hint,
      };
    })
    .sort((a, b) => b.durationMs - a.durationMs);

  const bottlenecks = findings.filter((item) => item.severity !== 'ok');
  const slowestPhase = findings[0] ?? null;

  let summaryHint = 'Todos os componentes operaram dentro do orçamento de performance.';
  if (bottlenecks.length > 0) {
    const top = bottlenecks[0];
    summaryHint = `Gargalo detectado em "${top.label}" (${top.durationMs} ms · ${top.sharePercent}% do ciclo): ${top.hint}`;
  } else if (slowestPhase && slowestPhase.durationMs > 0) {
    summaryHint = `Sem gargalos críticos. Etapa dominante: "${slowestPhase.label}" (${slowestPhase.durationMs} ms · ${slowestPhase.sharePercent}%).`;
  }

  return {
    totalMs,
    samples: [...samples],
    bottlenecks,
    slowestPhase,
    summaryHint,
  };
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function logSampleToConsole(sample: PerfSample): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const badgeStyle =
    sample.severity === 'bottleneck'
      ? 'background:#7f1d1d;color:#fecaca;font-weight:700;padding:2px 6px;border-radius:4px;'
      : sample.severity === 'slow'
        ? 'background:#78350f;color:#fef3c7;font-weight:700;padding:2px 6px;border-radius:4px;'
        : 'background:#1e3a5f;color:#bae6fd;font-weight:700;padding:2px 6px;border-radius:4px;';

  const statusTag =
    sample.severity === 'bottleneck'
      ? 'GARGALO'
      : sample.severity === 'slow'
        ? 'LENTO'
        : 'OK';

  const logger = sample.severity === 'bottleneck' ? console.warn : console.info;
  logger(
    `%c[MapPerf · ${statusTag} · ${sample.durationMs.toFixed(1)}ms]%c ${sample.label}`,
    badgeStyle,
    'color:inherit;font-weight:600;',
    sample.meta ?? {}
  );
}

function logReportToConsole(title: string, report: PerformanceReport, extra?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const hasCritical = report.bottlenecks.some((b) => b.severity === 'bottleneck');
  const hasSlow = report.bottlenecks.length > 0;
  const badgeStyle = hasCritical
    ? 'background:#7f1d1d;color:#fecaca;font-weight:700;padding:2px 6px;border-radius:4px;'
    : hasSlow
      ? 'background:#78350f;color:#fef3c7;font-weight:700;padding:2px 6px;border-radius:4px;'
      : 'background:#14532d;color:#bbf7d0;font-weight:700;padding:2px 6px;border-radius:4px;';

  console.info(
    `%c[MapPerf · ${title}]%c Total: ${report.totalMs.toFixed(1)}ms — ${report.summaryHint}`,
    badgeStyle,
    'color:inherit;font-weight:600;',
    {
      totalMs: report.totalMs,
      bottlenecks: report.bottlenecks,
      breakdown: report.samples.map((s) => ({
        etapa: s.label,
        ms: Number(s.durationMs.toFixed(1)),
        status: s.severity,
      })),
      ...(extra || {}),
    }
  );
}

const INITIAL_PHASES = new Set<MapPerfPhase>([
  'map-shell-mount',
  'map-style-load',
  'farm-geojson-load',
  'farm-labels-load',
  'poi-initial-hydrate',
  'poi-initial-fetch',
  'poi-markers-render',
]);

class MapPerformanceMonitor {
  private activeTimers = new Map<MapPerfPhase, number>();
  private initialSamples = new Map<MapPerfPhase, PerfSample>();
  private initialReportLogged = false;
  private reconnectCycleId = 0;
  private reconnectActive = false;
  private reconnectStartedAt = 0;
  private reconnectSamples: PerfSample[] = [];
  private lastReconnectReport: PerformanceReport | null = null;
  private wasOffline = false;

  markWentOffline(): void {
    this.wasOffline = true;
  }

  hasPendingOfflineReturn(): boolean {
    return this.wasOffline;
  }

  isReconnectCycleActive(): boolean {
    return this.reconnectActive;
  }

  startPhase(phase: MapPerfPhase): number {
    const start = nowMs();
    this.activeTimers.set(phase, start);
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      try {
        performance.mark(`bp:perf:${phase}:start`);
      } catch {
        /* noop */
      }
    }
    return start;
  }

  endPhase(phase: MapPerfPhase, meta?: Record<string, unknown>): PerfSample | null {
    const started = this.activeTimers.get(phase);
    if (started === undefined) return null;
    this.activeTimers.delete(phase);
    let durationMs = Math.max(0, Math.round((nowMs() - started) * 10) / 10);
    if (
      typeof performance !== 'undefined' &&
      typeof performance.mark === 'function' &&
      typeof performance.measure === 'function'
    ) {
      const startMark = `bp:perf:${phase}:start`;
      const endMark = `bp:perf:${phase}:end`;
      const measureName = `bp:perf:${phase}`;
      try {
        performance.mark(endMark);
        const entry = performance.measure(measureName, startMark, endMark);
        if (entry && typeof entry.duration === 'number') {
          durationMs = Math.max(0, Math.round(entry.duration * 10) / 10);
        }
      } catch {
        /* mantém fallback baseado em performance.now() */
      }
    }
    return this.recordPhase(phase, durationMs, meta);
  }

  recordPhase(phase: MapPerfPhase, durationMs: number, meta?: Record<string, unknown>): PerfSample {
    const rounded = Math.max(0, Math.round(durationMs * 10) / 10);
    const sample: PerfSample = {
      phase,
      label: PERF_BUDGETS[phase].label,
      durationMs: rounded,
      severity: classifyPhaseSeverity(phase, rounded),
      timestamp: Date.now(),
      meta,
    };

    if (INITIAL_PHASES.has(phase) && !this.initialSamples.has(phase)) {
      this.initialSamples.set(phase, sample);
    }

    if (phase.startsWith('reconnect-') && this.reconnectActive) {
      if (!this.reconnectSamples.some((s) => s.phase === phase)) {
        this.reconnectSamples = [...this.reconnectSamples, sample];
      }
    }

    logSampleToConsole(sample);
    this.maybeEmitInitialSummary();
    return sample;
  }

  private maybeEmitInitialSummary(): void {
    if (this.initialReportLogged) return;
    const hasMapStyle = this.initialSamples.has('map-style-load');
    const hasGeo = this.initialSamples.has('farm-geojson-load');
    const hasPoi =
      this.initialSamples.has('poi-initial-fetch') ||
      this.initialSamples.has('poi-initial-hydrate');

    if (hasMapStyle && hasGeo && hasPoi) {
      this.initialReportLogged = true;
      const report = analyzePerformanceBottlenecks(Array.from(this.initialSamples.values()));
      logReportToConsole('Resumo Carga Inicial', report);
    }
  }

  startReconnectCycle(pendingOpsCount: number): number {
    this.wasOffline = false;
    this.reconnectCycleId += 1;
    this.reconnectActive = true;
    this.reconnectStartedAt = nowMs();
    this.reconnectSamples = [];

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      console.info(
        `%c[MapPerf · Reconexão #${this.reconnectCycleId}]%c Iniciando medição pós-offline (fila IndexedDB: ${pendingOpsCount})`,
        'background:#0c4a6e;color:#bae6fd;font-weight:700;padding:2px 6px;border-radius:4px;',
        'color:inherit;font-weight:600;'
      );
    }
    return this.reconnectCycleId;
  }

  completeReconnectCycle(poiCount: number): PerformanceReport | null {
    if (!this.reconnectActive) return null;
    this.reconnectActive = false;
    const wallClockMs = Math.max(0, Math.round((nowMs() - this.reconnectStartedAt) * 10) / 10);
    const report = analyzePerformanceBottlenecks(this.reconnectSamples);
    this.lastReconnectReport = report;

    logReportToConsole(`Resumo Pós-Reconexão #${this.reconnectCycleId}`, report, {
      wallClockMs,
      poiCount,
    });
    return report;
  }

  getSnapshot(): {
    initialReport: PerformanceReport;
    lastReconnectReport: PerformanceReport | null;
    reconnectCycleCount: number;
  } {
    return {
      initialReport: analyzePerformanceBottlenecks(Array.from(this.initialSamples.values())),
      lastReconnectReport: this.lastReconnectReport,
      reconnectCycleCount: this.reconnectCycleId,
    };
  }
}

export const mapPerformanceMonitor = new MapPerformanceMonitor();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__BP_MAP_PERF__ = mapPerformanceMonitor;
}
