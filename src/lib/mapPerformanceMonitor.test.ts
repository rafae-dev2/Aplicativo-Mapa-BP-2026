import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePerformanceBottlenecks,
  classifyPhaseSeverity,
  type PerfSample,
} from './mapPerformanceMonitor';

test('classifyPhaseSeverity distinguishes ok, slow, and bottleneck durations by phase budget', () => {
  assert.equal(classifyPhaseSeverity('reconnect-poi-fetch', 320), 'ok');
  assert.equal(classifyPhaseSeverity('reconnect-poi-fetch', 1100), 'slow');
  assert.equal(classifyPhaseSeverity('reconnect-poi-fetch', 2200), 'bottleneck');

  assert.equal(classifyPhaseSeverity('poi-markers-render', 45), 'ok');
  assert.equal(classifyPhaseSeverity('poi-markers-render', 180), 'slow');
  assert.equal(classifyPhaseSeverity('poi-markers-render', 420), 'bottleneck');
});

test('analyzePerformanceBottlenecks pinpoints dominant post-offline POI bottleneck with percentage share', () => {
  const samples: PerfSample[] = [
    {
      phase: 'reconnect-queue-batch-flush',
      label: 'Envio em lote (batch) do IndexedDB pós-reconexão',
      durationMs: 250,
      severity: 'ok',
      timestamp: 1,
    },
    {
      phase: 'reconnect-poi-fetch',
      label: 'Recarregamento de POIs após retorno offline',
      durationMs: 2100,
      severity: 'bottleneck',
      timestamp: 2,
    },
    {
      phase: 'reconnect-poi-reconcile',
      label: 'Reconciliação de POIs pós-reconexão',
      durationMs: 12,
      severity: 'ok',
      timestamp: 3,
    },
    {
      phase: 'reconnect-poi-render',
      label: 'Pintura dos marcadores POI pós-reconexão',
      durationMs: 88,
      severity: 'ok',
      timestamp: 4,
    },
  ];

  const report = analyzePerformanceBottlenecks(samples);
  assert.equal(report.totalMs, 2450);
  assert.equal(report.bottlenecks.length, 1);
  assert.equal(report.bottlenecks[0].phase, 'reconnect-poi-fetch');
  assert.equal(report.bottlenecks[0].sharePercent, 86);
  assert.match(report.summaryHint, /Gargalo detectado/i);
});

test('analyzePerformanceBottlenecks reports healthy summary when all phases meet budget', () => {
  const samples: PerfSample[] = [
    {
      phase: 'map-style-load',
      label: 'Carregamento do estilo WebGL/Mapbox',
      durationMs: 420,
      severity: 'ok',
      timestamp: 1,
    },
    {
      phase: 'poi-initial-fetch',
      label: 'Fetch inicial de POIs (Supabase)',
      durationMs: 180,
      severity: 'ok',
      timestamp: 2,
    },
  ];

  const report = analyzePerformanceBottlenecks(samples);
  assert.equal(report.bottlenecks.length, 0);
  assert.equal(report.slowestPhase?.phase, 'map-style-load');
  assert.match(report.summaryHint, /Sem gargalos críticos/i);
});
