import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PoiReconnectProfiler,
  buildReconnectReport,
  classifyReconnectStage,
  type UserTimingLike,
} from './poiReconnectProfiler';

function createMockPerformance() {
  let clock = 1000;
  const marks = new Map<string, number>();
  const measures: Array<{ name: string; duration: number; startMark?: string; endMark?: string }> = [];

  const perf: UserTimingLike = {
    now: () => clock,
    mark: (name: string) => {
      marks.set(name, clock);
      return { name, startTime: clock, duration: 0, entryType: 'mark' };
    },
    measure: (name: string, startMark?: string, endMark?: string) => {
      const start = startMark ? (marks.get(startMark) ?? clock) : 0;
      const end = endMark ? (marks.get(endMark) ?? clock) : clock;
      const duration = Math.max(0, end - start);
      const entry = { name, duration, startTime: start, entryType: 'measure' } as PerformanceEntry;
      measures.push({ name, duration, startMark, endMark });
      return entry;
    },
    getEntriesByName: (name: string) =>
      measures
        .filter((m) => m.name === name)
        .map((m) => ({ name: m.name, duration: m.duration })),
    clearMarks: (name?: string) => {
      if (name) marks.delete(name);
      else marks.clear();
    },
    clearMeasures: (name?: string) => {
      if (!name) {
        measures.length = 0;
        return;
      }
      for (let i = measures.length - 1; i >= 0; i -= 1) {
        if (measures[i].name === name) measures.splice(i, 1);
      }
    },
  };

  return {
    perf,
    advance(ms: number) {
      clock += ms;
    },
    getMarks: () => Array.from(marks.keys()),
    getMeasures: () => [...measures],
  };
}

test('PoiReconnectProfiler records performance.mark/measure entries and detects POI fetch bottleneck', () => {
  const mock = createMockPerformance();
  const profiler = new PoiReconnectProfiler({ performance: mock.perf, emitConsole: false });

  const cycleId = profiler.startCycle(3);
  assert.equal(cycleId, 1);

  profiler.markStageStart('batch-flush');
  mock.advance(140);
  profiler.markStageEnd('batch-flush', { flushed: 3 });

  profiler.markStageStart('poi-fetch');
  mock.advance(1850);
  profiler.markStageEnd('poi-fetch', { poiCount: 42 });

  profiler.markStageStart('conflicts-fetch');
  mock.advance(95);
  profiler.markStageEnd('conflicts-fetch', { count: 0 });

  profiler.markStageStart('reconcile');
  mock.advance(8);
  profiler.markStageEnd('reconcile', { reconciledCount: 42 });

  profiler.markStageStart('markers-paint');
  mock.advance(62);
  profiler.markStageEnd('markers-paint', { visibleCount: 42 });

  const report = profiler.finishCycle({ poiCount: 42, visibleCount: 42 });
  assert.ok(report);
  assert.equal(report.cycleId, 1);
  assert.equal(report.totalMeasureName, 'bp:poi-reconnect#1:total');
  assert.equal(report.wallClockMs, 2155);
  assert.equal(report.totalMeasuredMs, 2155);
  assert.equal(report.unaccountedGapMs, 0);
  assert.equal(report.overallSeverity, 'bottleneck');
  assert.equal(report.bottlenecks.length, 1);
  assert.equal(report.bottlenecks[0].stage, 'poi-fetch');
  assert.equal(report.bottlenecks[0].measureName, 'bp:poi-reconnect#1:poi-fetch');
  assert.equal(report.tableRows.length, 5);
  assert.match(report.summaryLine, /Gargalo: Carga inicial de POIs/i);
  assert.match(report.diagnosticNote, /Principal gargalo/i);

  const measureNames = mock.getMeasures().map((m) => m.name);
  assert.deepEqual(measureNames, [
    'bp:poi-reconnect#1:batch-flush',
    'bp:poi-reconnect#1:poi-fetch',
    'bp:poi-reconnect#1:conflicts-fetch',
    'bp:poi-reconnect#1:reconcile',
    'bp:poi-reconnect#1:markers-paint',
    'bp:poi-reconnect#1:total',
  ]);
});

test('buildReconnectReport detects hidden main-thread gap between async reconnection stages', () => {
  const report = buildReconnectReport(
    2,
    [
      { stage: 'batch-flush', measureName: 'bp:poi-reconnect#2:batch-flush', durationMs: 80 },
      { stage: 'poi-fetch', measureName: 'bp:poi-reconnect#2:poi-fetch', durationMs: 220 },
      { stage: 'reconcile', measureName: 'bp:poi-reconnect#2:reconcile', durationMs: 5 },
      { stage: 'markers-paint', measureName: 'bp:poi-reconnect#2:markers-paint', durationMs: 45 },
    ],
    950,
    { pendingOpsInitial: 1, poiCount: 40, visibleCount: 40 }
  );

  assert.equal(report.totalMeasuredMs, 350);
  assert.equal(report.unaccountedGapMs, 600);
  assert.equal(report.overallSeverity, 'bottleneck');
  assert.equal(report.tableRows.length, 5);
  assert.equal(report.tableRows[4].Status, 'GARGALO');
  assert.match(report.diagnosticNote, /main-thread/i);
});

test('PoiReconnectProfiler works with native User Timing API and prunes stale cycles cleanly', () => {
  const profiler = new PoiReconnectProfiler({ emitConsole: false });

  for (let i = 1; i <= 3; i += 1) {
    profiler.startCycle(0);
    profiler.markStageStart('poi-fetch');
    profiler.markStageEnd('poi-fetch');
    profiler.finishCycle({ poiCount: 10 });
  }

  assert.equal(profiler.getCurrentCycleId(), 3);
  assert.equal(profiler.getHistory().length, 3);
  assert.equal(profiler.getMeasures(1).length, 0);
  assert.ok(profiler.getMeasures(3).some((m) => m.name === 'bp:poi-reconnect#3:total'));
  assert.equal(classifyReconnectStage('conflicts-fetch', 450), 'slow');
  assert.equal(classifyReconnectStage('markers-paint', 320), 'bottleneck');
});
