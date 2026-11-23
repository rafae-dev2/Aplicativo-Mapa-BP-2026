/**
 * poiReconnectProfiler — Utilitário de monitoramento de performance baseado na
 * User Timing API (`performance.mark` / `performance.measure`) para detectar
 * gargalos no carregamento inicial de POIs após a reconexão offline -> online.
 *
 * Emite marcas e medidas padrão no timeline do DevTools (`bp:poi-reconnect#N:*`)
 * e gera um relatório sucinto e estruturado no console (`console.groupCollapsed`
 * + `console.table`) ao concluir cada ciclo de reconexão.
 */

export type PoiReconnectStage =
  | 'batch-flush'
  | 'poi-fetch'
  | 'conflicts-fetch'
  | 'reconcile'
  | 'markers-paint';

export type ReconnectStageSeverity = 'ok' | 'slow' | 'bottleneck';

export interface ReconnectStageSpec {
  label: string;
  warnMs: number;
  criticalMs: number;
  hint: string;
}

export const POI_RECONNECT_STAGES: Record<PoiReconnectStage, ReconnectStageSpec> = {
  'batch-flush': {
    label: 'Envio em lote (IndexedDB → Backend)',
    warnMs: 800,
    criticalMs: 2200,
    hint: 'Upload do lote pendente demorado; verifique latência da rede ou anexos/fotos no lote.',
  },
  'poi-fetch': {
    label: 'Carga inicial de POIs (Supabase)',
    warnMs: 700,
    criticalMs: 1600,
    hint: 'Consulta completa de POIs lenta após reconexão; avaliar seleção de colunas sem imagens pesadas ou delta por updated_at.',
  },
  'conflicts-fetch': {
    label: 'Consulta de conflitos remotos',
    warnMs: 400,
    criticalMs: 1000,
    hint: 'Chamada sequencial de conflitos está atrasando a reconciliação; paralelizar com fetchAllPois reduz o tempo total.',
  },
  reconcile: {
    label: 'Reconciliação local (merge + tombstones)',
    warnMs: 40,
    criticalMs: 120,
    hint: 'Mesclagem em memória acima do orçamento; revisar indexação por Map e limpeza de tombstones antigos.',
  },
  'markers-paint': {
    label: 'Pintura dos marcadores POI no mapa',
    warnMs: 100,
    criticalMs: 260,
    hint: 'Renderização DOM dos marcadores acima do orçamento de frame; avaliar culling por viewport ou ícones em camada WebGL.',
  },
};

export const UNACCOUNTED_GAP_WARN_MS = 180;
export const UNACCOUNTED_GAP_CRITICAL_MS = 500;

export interface UserTimingLike {
  now(): number;
  mark?(markName: string): unknown;
  measure?(measureName: string, startMark?: string, endMark?: string): PerformanceEntry | void;
  getEntriesByName?(name: string, type?: string): PerformanceEntryList | readonly { name: string; duration: number }[];
  clearMarks?(markName?: string): void;
  clearMeasures?(measureName?: string): void;
}

export interface StageTimingEntry {
  stage: PoiReconnectStage;
  measureName: string;
  durationMs: number;
  meta?: Record<string, unknown>;
}

export interface ReconnectStageSummary {
  stage: PoiReconnectStage;
  label: string;
  measureName: string;
  durationMs: number;
  sharePercent: number;
  warnMs: number;
  criticalMs: number;
  severity: ReconnectStageSeverity;
  hint: string;
  meta?: Record<string, unknown>;
}

export interface ReconnectTableRow {
  Etapa: string;
  Measure: string;
  'Tempo (ms)': number;
  '%': string;
  'Orçamento (ms)': string;
  Status: 'OK' | 'LENTO' | 'GARGALO';
}

export interface PoiReconnectReport {
  cycleId: number;
  totalMeasureName: string;
  wallClockMs: number;
  totalMeasuredMs: number;
  unaccountedGapMs: number;
  pendingOpsInitial: number;
  poiCount: number;
  visibleCount?: number;
  error?: string | null;
  stages: ReconnectStageSummary[];
  bottlenecks: ReconnectStageSummary[];
  slowestStage: ReconnectStageSummary | null;
  overallSeverity: ReconnectStageSeverity;
  summaryLine: string;
  diagnosticNote: string;
  tableRows: ReconnectTableRow[];
  completedAt: number;
}

function round1(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

export function classifyReconnectStage(
  stage: PoiReconnectStage,
  durationMs: number
): ReconnectStageSeverity {
  const spec = POI_RECONNECT_STAGES[stage];
  if (durationMs >= spec.criticalMs) return 'bottleneck';
  if (durationMs >= spec.warnMs) return 'slow';
  return 'ok';
}

export function buildMarkName(cycleId: number, part: string): string {
  return `bp:poi-reconnect#${cycleId}:${part}`;
}

export function buildMeasureName(cycleId: number, part: string): string {
  return `bp:poi-reconnect#${cycleId}:${part}`;
}

/**
 * Função pura que agrega as medidas (`performance.measure`) de um ciclo de
 * reconexão, classifica gargalos e gera tabela + resumo sucinto para console.
 */
export function buildReconnectReport(
  cycleId: number,
  entries: readonly StageTimingEntry[],
  wallClockMs: number,
  context: {
    pendingOpsInitial: number;
    poiCount: number;
    visibleCount?: number;
    error?: string | null;
    completedAt?: number;
  }
): PoiReconnectReport {
  const safeWallClock = round1(wallClockMs);
  const totalMeasuredMs = round1(entries.reduce((sum, e) => sum + Math.max(0, e.durationMs), 0));
  const denom = safeWallClock > 0 ? safeWallClock : totalMeasuredMs;
  const unaccountedGapMs = round1(Math.max(0, safeWallClock - totalMeasuredMs));

  const stages: ReconnectStageSummary[] = entries.map((entry) => {
    const spec = POI_RECONNECT_STAGES[entry.stage];
    const durationMs = round1(entry.durationMs);
    const sharePercent = denom > 0 ? Math.min(100, Math.round((durationMs / denom) * 100)) : 0;
    return {
      stage: entry.stage,
      label: spec.label,
      measureName: entry.measureName,
      durationMs,
      sharePercent,
      warnMs: spec.warnMs,
      criticalMs: spec.criticalMs,
      severity: classifyReconnectStage(entry.stage, durationMs),
      hint: spec.hint,
      meta: entry.meta,
    };
  });

  const sortedByDuration = [...stages].sort((a, b) => b.durationMs - a.durationMs);
  const bottlenecks = sortedByDuration.filter((s) => s.severity !== 'ok');
  const slowestStage = sortedByDuration[0] ?? null;

  const hasCriticalStage = bottlenecks.some((s) => s.severity === 'bottleneck');
  const hasSlowStage = bottlenecks.length > 0;
  const gapCritical = unaccountedGapMs >= UNACCOUNTED_GAP_CRITICAL_MS;
  const gapSlow = unaccountedGapMs >= UNACCOUNTED_GAP_WARN_MS;

  const overallSeverity: ReconnectStageSeverity =
    hasCriticalStage || gapCritical
      ? 'bottleneck'
      : hasSlowStage || gapSlow
        ? 'slow'
        : 'ok';

  const statusTag = (sev: ReconnectStageSeverity): 'OK' | 'LENTO' | 'GARGALO' =>
    sev === 'bottleneck' ? 'GARGALO' : sev === 'slow' ? 'LENTO' : 'OK';

  const tableRows: ReconnectTableRow[] = stages.map((s) => ({
    Etapa: s.label,
    Measure: s.measureName,
    'Tempo (ms)': s.durationMs,
    '%': `${s.sharePercent}%`,
    'Orçamento (ms)': `≤ ${s.warnMs}`,
    Status: statusTag(s.severity),
  }));

  if (unaccountedGapMs >= UNACCOUNTED_GAP_WARN_MS) {
    tableRows.push({
      Etapa: 'Intervalo/fila de main-thread entre etapas',
      Measure: '(wallClock - soma)',
      'Tempo (ms)': unaccountedGapMs,
      '%': `${denom > 0 ? Math.min(100, Math.round((unaccountedGapMs / denom) * 100)) : 0}%`,
      'Orçamento (ms)': `≤ ${UNACCOUNTED_GAP_WARN_MS}`,
      Status: gapCritical ? 'GARGALO' : 'LENTO',
    });
  }

  let diagnosticNote = 'Carregamento de POIs pós-reconexão dentro do orçamento em todas as etapas.';
  let summaryLine = `${context.poiCount} POIs carregados em ${safeWallClock.toFixed(1)} ms`;

  if (context.error) {
    diagnosticNote = `Recarregamento interrompido por erro de rede/backend: ${context.error}`;
    summaryLine = `Falha na carga pós-reconexão (${safeWallClock.toFixed(1)} ms): ${context.error}`;
  } else if (bottlenecks.length > 0) {
    const top = bottlenecks[0];
    diagnosticNote = `Principal gargalo: "${top.label}" (${top.durationMs.toFixed(1)} ms · ${top.sharePercent}%). ${top.hint}`;
    summaryLine = `${context.poiCount} POIs em ${safeWallClock.toFixed(1)} ms · Gargalo: ${top.label} (${top.durationMs.toFixed(1)} ms)`;
  } else if (gapSlow) {
    diagnosticNote = `Tempo ocioso/bloqueio de main-thread de ${unaccountedGapMs.toFixed(1)} ms entre etapas assíncronas (verificar timers, WebGL ou re-renderizações concorrentes).`;
    summaryLine = `${context.poiCount} POIs em ${safeWallClock.toFixed(1)} ms · Gap entre etapas: ${unaccountedGapMs.toFixed(1)} ms`;
  } else if (slowestStage) {
    diagnosticNote = `Sem gargalos críticos. Etapa mais longa: "${slowestStage.label}" (${slowestStage.durationMs.toFixed(1)} ms · ${slowestStage.sharePercent}%).`;
    summaryLine = `${context.poiCount} POIs em ${safeWallClock.toFixed(1)} ms · Maior etapa: ${slowestStage.label} (${slowestStage.durationMs.toFixed(1)} ms)`;
  }

  return {
    cycleId,
    totalMeasureName: buildMeasureName(cycleId, 'total'),
    wallClockMs: safeWallClock,
    totalMeasuredMs,
    unaccountedGapMs,
    pendingOpsInitial: context.pendingOpsInitial,
    poiCount: context.poiCount,
    visibleCount: context.visibleCount,
    error: context.error ?? null,
    stages,
    bottlenecks,
    slowestStage,
    overallSeverity,
    summaryLine,
    diagnosticNote,
    tableRows,
    completedAt: context.completedAt ?? Date.now(),
  };
}

/**
 * Adaptador seguro sobre `window.performance` (ou mock injetável nos testes)
 * que encapsula `performance.mark` e `performance.measure`.
 */
export function createUserTimingAdapter(perfLike?: UserTimingLike | null) {
  const perf: UserTimingLike | null =
    perfLike !== undefined
      ? perfLike
      : typeof performance !== 'undefined'
        ? performance
        : null;

  const fallbackMarks = new Map<string, number>();
  const createdMarks = new Set<string>();
  const createdMeasures = new Set<string>();

  const now = (): number => (perf && typeof perf.now === 'function' ? perf.now() : Date.now());

  return {
    mark(name: string): number {
      const ts = now();
      fallbackMarks.set(name, ts);
      createdMarks.add(name);
      if (perf && typeof perf.mark === 'function') {
        try {
          perf.mark(name);
        } catch {
          /* fallback timestamps permanecem disponíveis */
        }
      }
      return ts;
    },

    measure(name: string, startMark: string, endMark: string): number {
      createdMeasures.add(name);
      if (perf && typeof perf.measure === 'function') {
        try {
          const entry = perf.measure(name, startMark, endMark);
          if (entry && typeof (entry as PerformanceEntry).duration === 'number') {
            return round1((entry as PerformanceEntry).duration);
          }
          if (typeof perf.getEntriesByName === 'function') {
            const matches = perf.getEntriesByName(name, 'measure');
            const latest = matches[matches.length - 1];
            if (latest && typeof latest.duration === 'number') {
              return round1(latest.duration);
            }
          }
        } catch {
          /* cai para o cálculo por timestamps locais */
        }
      }

      const t0 = fallbackMarks.get(startMark);
      const t1 = fallbackMarks.get(endMark);
      if (t0 !== undefined && t1 !== undefined) {
        return round1(t1 - t0);
      }
      return 0;
    },

    clearPrefix(prefix: string): void {
      for (const markName of Array.from(createdMarks)) {
        if (markName.startsWith(prefix)) {
          createdMarks.delete(markName);
          fallbackMarks.delete(markName);
          try {
            perf?.clearMarks?.(markName);
          } catch {
            /* noop */
          }
        }
      }
      for (const measureName of Array.from(createdMeasures)) {
        if (measureName.startsWith(prefix)) {
          createdMeasures.delete(measureName);
          try {
            perf?.clearMeasures?.(measureName);
          } catch {
            /* noop */
          }
        }
      }
    },

    getRecordedMeasures(prefix?: string): Array<{ name: string; duration: number }> {
      if (!perf || typeof perf.getEntriesByName !== 'function') return [];
      const results: Array<{ name: string; duration: number }> = [];
      for (const name of createdMeasures) {
        if (prefix && !name.startsWith(prefix)) continue;
        try {
          const entries = perf.getEntriesByName(name, 'measure');
          for (const entry of entries) {
            results.push({ name: entry.name, duration: round1(entry.duration) });
          }
        } catch {
          /* noop */
        }
      }
      return results;
    },
  };
}

export function logSuccinctReconnectReport(report: PoiReconnectReport): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const badgeStyle =
    report.overallSeverity === 'bottleneck'
      ? 'background:#7f1d1d;color:#fecaca;font-weight:700;padding:2px 6px;border-radius:4px;'
      : report.overallSeverity === 'slow'
        ? 'background:#78350f;color:#fef3c7;font-weight:700;padding:2px 6px;border-radius:4px;'
        : 'background:#14532d;color:#bbf7d0;font-weight:700;padding:2px 6px;border-radius:4px;';

  const statusLabel =
    report.overallSeverity === 'bottleneck'
      ? 'GARGALO'
      : report.overallSeverity === 'slow'
        ? 'LENTO'
        : 'OK';

  const headerTitle = `%c[POI Reconnect Perf #${report.cycleId} · ${report.wallClockMs.toFixed(1)}ms · ${statusLabel}]%c ${report.summaryLine}`;

  if (typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(headerTitle, badgeStyle, 'color:inherit;font-weight:600;');
    if (report.tableRows.length > 0 && typeof console.table === 'function') {
      console.table(report.tableRows);
    }
    const diagLogger = report.overallSeverity === 'bottleneck' ? console.warn : console.info;
    diagLogger(`[POI Reconnect Perf #${report.cycleId}] Diagnóstico: ${report.diagnosticNote}`, {
      measureTotal: report.totalMeasureName,
      wallClockMs: report.wallClockMs,
      totalMeasuredMs: report.totalMeasuredMs,
      unaccountedGapMs: report.unaccountedGapMs,
      pendingOpsInitial: report.pendingOpsInitial,
      poiCount: report.poiCount,
      visibleCount: report.visibleCount,
    });
    console.groupEnd();
  } else {
    console.info(headerTitle, badgeStyle, 'color:inherit;font-weight:600;', {
      stages: report.tableRows,
      diagnostic: report.diagnosticNote,
    });
  }
}

export class PoiReconnectProfiler {
  private readonly timing: ReturnType<typeof createUserTimingAdapter>;
  private readonly emitConsole: boolean;
  private cycleId = 0;
  private active = false;
  private pendingOpsInitial = 0;
  private activeStages = new Set<PoiReconnectStage>();
  private completedEntries = new Map<PoiReconnectStage, StageTimingEntry>();
  private history: PoiReconnectReport[] = [];

  constructor(options?: { performance?: UserTimingLike | null; emitConsole?: boolean }) {
    this.timing = createUserTimingAdapter(options?.performance);
    this.emitConsole = options?.emitConsole ?? true;
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentCycleId(): number {
    return this.cycleId;
  }

  startCycle(pendingOpsCount: number): number {
    // Limpa marcas/medidas de ciclos mais antigos (mantendo apenas os 2 últimos)
    if (this.cycleId >= 2) {
      this.timing.clearPrefix(`bp:poi-reconnect#${this.cycleId - 1}:`);
    }

    this.cycleId += 1;
    this.active = true;
    this.pendingOpsInitial = Math.max(0, pendingOpsCount);
    this.activeStages.clear();
    this.completedEntries.clear();

    this.timing.mark(buildMarkName(this.cycleId, 'start'));
    return this.cycleId;
  }

  markStageStart(stage: PoiReconnectStage): void {
    if (!this.active) return;
    if (this.completedEntries.has(stage)) return;
    this.activeStages.add(stage);
    this.timing.mark(buildMarkName(this.cycleId, `${stage}:start`));
  }

  markStageEnd(stage: PoiReconnectStage, meta?: Record<string, unknown>): StageTimingEntry | null {
    if (!this.active || !this.activeStages.has(stage)) return null;
    this.activeStages.delete(stage);

    const startMark = buildMarkName(this.cycleId, `${stage}:start`);
    const endMark = buildMarkName(this.cycleId, `${stage}:end`);
    const measureName = buildMeasureName(this.cycleId, stage);

    this.timing.mark(endMark);
    const durationMs = this.timing.measure(measureName, startMark, endMark);

    const entry: StageTimingEntry = {
      stage,
      measureName,
      durationMs,
      meta,
    };
    this.completedEntries.set(stage, entry);
    return entry;
  }

  finishCycle(meta: {
    poiCount: number;
    visibleCount?: number;
    error?: string | null;
  }): PoiReconnectReport | null {
    if (!this.active) return null;
    this.active = false;
    this.activeStages.clear();

    const startMark = buildMarkName(this.cycleId, 'start');
    const endMark = buildMarkName(this.cycleId, 'end');
    const totalMeasureName = buildMeasureName(this.cycleId, 'total');

    this.timing.mark(endMark);
    const wallClockMs = this.timing.measure(totalMeasureName, startMark, endMark);

    const orderedStages: PoiReconnectStage[] = [
      'batch-flush',
      'poi-fetch',
      'conflicts-fetch',
      'reconcile',
      'markers-paint',
    ];
    const entries = orderedStages
      .map((s) => this.completedEntries.get(s))
      .filter((e): e is StageTimingEntry => Boolean(e));

    const report = buildReconnectReport(this.cycleId, entries, wallClockMs, {
      pendingOpsInitial: this.pendingOpsInitial,
      poiCount: meta.poiCount,
      visibleCount: meta.visibleCount,
      error: meta.error,
    });

    this.history = [...this.history.slice(-9), report];

    if (this.emitConsole) {
      logSuccinctReconnectReport(report);
    }

    return report;
  }

  getLastReport(): PoiReconnectReport | null {
    return this.history[this.history.length - 1] ?? null;
  }

  getHistory(): readonly PoiReconnectReport[] {
    return this.history;
  }

  getMeasures(cycleId?: number): Array<{ name: string; duration: number }> {
    const prefix = cycleId ? `bp:poi-reconnect#${cycleId}:` : 'bp:poi-reconnect#';
    return this.timing.getRecordedMeasures(prefix);
  }

  printLastReport(): PoiReconnectReport | null {
    const last = this.getLastReport();
    if (last) logSuccinctReconnectReport(last);
    return last;
  }
}

export const poiReconnectProfiler = new PoiReconnectProfiler();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__BP_POI_RECONNECT_PERF__ = poiReconnectProfiler;
}
