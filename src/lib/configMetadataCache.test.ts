import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_AND_METADATA_ASSETS,
  computeConfigMetadataSignature,
  isConfigOrMetadataPath,
} from './configMetadataCache';

test('CONFIG_AND_METADATA_ASSETS includes critical startup config and metadata files', () => {
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/manifest.json'));
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/runtime-config.js'));
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/notification-config.js'));
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/version.json'));
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/planning_data.json'));
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/planejamento_colheita.json'));
  assert.ok(CONFIG_AND_METADATA_ASSETS.includes('/experimentos_2026.json'));
});

test('isConfigOrMetadataPath matches versioned config/metadata paths and ignores API or tile URLs', () => {
  assert.equal(isConfigOrMetadataPath('/runtime-config.js?v=189'), true);
  assert.equal(isConfigOrMetadataPath('/notification-config.js?v=2'), true);
  assert.equal(isConfigOrMetadataPath('/manifest.json'), true);
  assert.equal(isConfigOrMetadataPath('/version.json?t=1234'), true);
  assert.equal(isConfigOrMetadataPath('/app-shell-assets.json'), true);
  assert.equal(isConfigOrMetadataPath('/planning_data.json'), true);
  assert.equal(isConfigOrMetadataPath('/experimentos_2026.json'), true);

  assert.equal(isConfigOrMetadataPath('/rest/v1/pois'), false);
  assert.equal(isConfigOrMetadataPath('/branco-peres.mapdata'), false);
  assert.equal(isConfigOrMetadataPath('/poi-water-truck-blue.png'), false);
});

test('computeConfigMetadataSignature is deterministic and order-independent', () => {
  const sigA = computeConfigMetadataSignature(['/manifest.json', '/version.json'], '2026-01');
  const sigB = computeConfigMetadataSignature(['/version.json', '/manifest.json'], '2026-01');
  const sigC = computeConfigMetadataSignature(['/manifest.json', '/version.json'], '2026-02');
  assert.equal(sigA, sigB);
  assert.notEqual(sigA, sigC);
});
