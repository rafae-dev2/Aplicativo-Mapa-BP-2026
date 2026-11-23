import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateConnectionQuality,
  formatConnectionLabel,
  type LatencySample,
} from './networkQualityMonitor';

test('formatConnectionLabel produces readable labels for 4G, Wi-Fi, 3G, 2G and Offline', () => {
  assert.equal(formatConnectionLabel({ online: false }), 'Offline');
  assert.equal(formatConnectionLabel({ online: true, type: 'wifi', effectiveType: '4g' }), 'Wi-Fi');
  assert.equal(formatConnectionLabel({ online: true, type: 'cellular', effectiveType: '4g' }), '4G');
  assert.equal(formatConnectionLabel({ online: true, type: 'cellular', effectiveType: '3g' }), '3G');
  assert.equal(formatConnectionLabel({ online: true, type: 'cellular', effectiveType: 'slow-2g' }), '2G Lento');
});

test('evaluateConnectionQuality pauses sync automatically on high RTT or slow-2g and resumes on healthy Wi-Fi', () => {
  const highRtt = evaluateConnectionQuality({
    online: true,
    type: 'cellular',
    effectiveType: '3g',
    rtt: 2400,
    downlink: 0.4,
  });
  assert.equal(highRtt.tier, 'unstable');
  assert.equal(highRtt.shouldPauseSync, true);
  assert.match(highRtt.pauseReason || '', /Latência instável/i);

  const slow2g = evaluateConnectionQuality({
    online: true,
    type: 'cellular',
    effectiveType: 'slow-2g',
    rtt: 400,
  });
  assert.equal(slow2g.tier, 'unstable');
  assert.equal(slow2g.shouldPauseSync, true);

  const wifi = evaluateConnectionQuality({
    online: true,
    type: 'wifi',
    effectiveType: '4g',
    rtt: 45,
    downlink: 10,
  });
  assert.equal(wifi.tier, 'good');
  assert.equal(wifi.connectionLabel, 'Wi-Fi');
  assert.equal(wifi.shouldPauseSync, false);
  assert.equal(wifi.pauseReason, null);
});

test('evaluateConnectionQuality detects unstable latency jitter and consecutive failures from real RTT samples', () => {
  const now = 100_000;
  const jitterSamples: LatencySample[] = [
    { rttMs: 120, ok: true, timestamp: now - 5000 },
    { rttMs: 1650, ok: true, timestamp: now - 2000 },
  ];
  const jitterState = evaluateConnectionQuality(
    { online: true, type: 'cellular', effectiveType: '4g', rtt: 150 },
    jitterSamples,
    now
  );
  assert.equal(jitterState.tier, 'unstable');
  assert.equal(jitterState.shouldPauseSync, true);
  assert.match(jitterState.pauseReason || '', /Oscilação alta/i);

  const failingSamples: LatencySample[] = [
    { rttMs: 900, ok: false, timestamp: now - 4000 },
    { rttMs: 950, ok: false, timestamp: now - 1000 },
  ];
  const failureState = evaluateConnectionQuality(
    { online: true, type: 'wifi', effectiveType: '4g', rtt: 60 },
    failingSamples,
    now
  );
  assert.equal(failureState.tier, 'unstable');
  assert.equal(failureState.shouldPauseSync, true);
  assert.match(failureState.pauseReason || '', /Falhas intermitentes/i);
});
