import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeoJSON } from './geojson-validator';
import {
  analyzeFrameTimings,
  countGeoJsonVertices,
  generateComplexTalhoes,
} from './talhoesStressSimulator';

test('generateComplexTalhoes produces 100+ complex multi-ring GeoJSON polygons with valid properties', () => {
  const features = generateComplexTalhoes(120, 72, true);
  assert.equal(features.length, 120);

  const fc = { type: 'FeatureCollection' as const, features };
  const validated = validateGeoJSON(fc);
  assert.ok(validated, 'generated FeatureCollection must pass validateGeoJSON');

  const counts = countGeoJsonVertices(validated);
  // 120 * (73 outer + 19 hole) = 11.040 vertices, 240 rings
  assert.equal(counts.totalRings, 240);
  assert.ok(counts.totalVertices >= 10_000, `expected >= 10000 vertices, got ${counts.totalVertices}`);

  // Guarantees minimum floor of 100 talhões even if caller passes smaller count
  const floored = generateComplexTalhoes(40, 32, false);
  assert.equal(floored.length, 100);
});

test('analyzeFrameTimings passes smooth frame cadence and flags UI freeze stalls', () => {
  const smoothFrames = Array.from({ length: 30 }, () => 16.6);
  const healthy = analyzeFrameTimings(smoothFrames, []);
  assert.equal(healthy.uiResponsive, true);
  assert.ok(healthy.avgFps >= 55);
  assert.equal(healthy.totalBlockingTimeMs, 0);
  assert.equal(healthy.framesOver50ms, 0);

  // Simulate main-thread freeze with 650ms stall + long tasks
  const frozenFrames = [16.5, 16.8, 650, 18.2, 420, 16.7];
  const frozen = analyzeFrameTimings(frozenFrames, [620, 400], {
    maxSingleFrameMs: 450,
    maxTotalBlockingTimeMs: 900,
  });
  assert.equal(frozen.uiResponsive, false);
  assert.equal(frozen.maxFrameMs, 650);
  assert.equal(frozen.framesOver100ms, 2);
  assert.equal(frozen.totalBlockingTimeMs, 920);
});
