import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OfflineQueueController,
  applyPendingOpsToPois,
  coalescePendingOp,
  computeExponentialBackoffMs,
  type OfflineSyncState,
  type PendingOp,
  type QueueStorageAdapter,
  type SyncLogEntry,
} from './offlineQueue';
import type { POI } from '@/components/POIManager';

function createMemoryIdbAdapter(seed: PendingOp[] = []): {
  adapter: QueueStorageAdapter;
  records: Map<string, PendingOp>;
} {
  const records = new Map<string, PendingOp>(seed.map((op) => [op.opId, op]));
  return {
    records,
    adapter: {
      async getAll() {
        return Array.from(records.values()).sort((a, b) => a.ts - b.ts);
      },
      async replaceAll(ops) {
        records.clear();
        ops.forEach((op) => records.set(op.opId, op));
      },
      async deleteById(opId) {
        records.delete(opId);
      },
      async clear() {
        records.clear();
      },
    },
  };
}

function makePoi(overrides: Partial<POI> = {}): POI {
  return {
    id: overrides.id ?? 'poi-1',
    lat: -21.45,
    lng: -51.02,
    title: 'Represa Sede',
    description: 'Cheia',
    category: 'represa',
    createdAt: 1000,
    type: 'custom',
    ...overrides,
  };
}

test('coalescePendingOp collapses insert + update into a single insert with updated fields', () => {
  const poi = makePoi({ id: 'p-100', title: 'Nova Represa' });
  let q = coalescePendingOp([], { type: 'insert', poi }, 100, () => 'op-1');
  q = coalescePendingOp(q, { type: 'update', id: 'p-100', updates: { title: 'Represa Editada Offline' } }, 200, () => 'op-2');

  assert.equal(q.length, 1);
  assert.equal(q[0].type, 'insert');
  assert.equal(q[0].poi?.title, 'Represa Editada Offline');
});

test('coalescePendingOp merges consecutive updates and replaces prior ops on delete', () => {
  const base = makePoi({ id: 'p-200', title: 'Caminhão 01', description: 'Início' });
  let q = coalescePendingOp([], { type: 'update', id: 'p-200', updates: { title: 'Caminhão 02' }, basePoi: base, baseRevision: 1 }, 100, () => 'op-1');
  q = coalescePendingOp(q, { type: 'update', id: 'p-200', updates: { description: 'Descarga concluída' } }, 200, () => 'op-2');

  assert.equal(q.length, 1);
  assert.equal(q[0].type, 'update');
  assert.deepEqual(q[0].updates, { title: 'Caminhão 02', description: 'Descarga concluída' });
  assert.equal(q[0].baseRevision, 1);

  q = coalescePendingOp(q, { type: 'delete', id: 'p-200' }, 300, () => 'op-3');
  assert.equal(q.length, 1);
  assert.equal(q[0].type, 'delete');
  assert.equal(q[0].id, 'p-200');
});

test('OfflineQueueController persists queued offline POIs across restart, emits live sync state and structured logs on reconnect', async () => {
  const { adapter, records } = createMemoryIdbAdapter();
  const offlineController = new OfflineQueueController(adapter);

  const createdPoi = makePoi({ id: 'offline-poi-1', title: 'Criado Sem Rede', photo: 'data:image/jpeg;base64,AAAA' });
  await offlineController.enqueueAsync({ type: 'insert', poi: createdPoi });
  await offlineController.enqueueAsync({
    type: 'update',
    id: 'existing-poi-2',
    updates: { title: 'Editado no campo' },
  });

  assert.equal(records.size, 2);

  // Simula recarregamento do app (nova instância lendo do mesmo IndexedDB)
  const reloadedController = new OfflineQueueController(adapter);
  const hydrated = await reloadedController.init();
  assert.equal(hydrated.length, 2);
  assert.equal(hydrated[0].poi?.photo, 'data:image/jpeg;base64,AAAA');

  const syncStates: OfflineSyncState[] = [];
  const logs: SyncLogEntry[] = [];
  const unsub = reloadedController.subscribeSyncState((s) => syncStates.push(s));

  // Enquanto offline (ping falha), nada é perdido e syncing volta para false
  const offlineFlush = await reloadedController.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: false, reason: 'offline' }),
    insert: async () => ({ ok: true, error: null }),
    update: async () => ({ ok: true, error: null }),
    remove: async () => ({ ok: true, error: null }),
    onLog: (entry) => logs.push(entry),
  });
  assert.equal(offlineFlush.ok, false);
  assert.equal(offlineFlush.remaining, 2);
  assert.equal(records.size, 2);
  assert.equal(reloadedController.getSyncState().syncing, false);
  assert.equal(logs[logs.length - 1]?.stage, 'item-error');

  syncStates.length = 0;
  logs.length = 0;

  // Ao retornar conexão, flush envia na ordem correta, emite estados "syncing: true" e logs estruturados
  const sent: string[] = [];
  let syncedCallbackCount = 0;
  const onlineFlush = await reloadedController.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: true }),
    insert: async (poi) => {
      sent.push(`insert:${poi.id}`);
      return { ok: true, error: null };
    },
    update: async (id) => {
      sent.push(`update:${id}`);
      return { ok: true, error: null };
    },
    remove: async (id) => {
      sent.push(`delete:${id}`);
      return { ok: true, error: null };
    },
    onSynced: (res) => {
      syncedCallbackCount += res.flushed;
    },
    onLog: (entry) => logs.push(entry),
  });

  unsub();

  assert.equal(onlineFlush.ok, true);
  assert.equal(onlineFlush.flushed, 2);
  assert.equal(onlineFlush.remaining, 0);
  assert.deepEqual(sent, ['insert:offline-poi-1', 'update:existing-poi-2']);
  assert.equal(syncedCallbackCount, 2);
  assert.equal(records.size, 0);

  // Confirma ciclo completo do indicador de sincronização
  assert.equal(syncStates[0]?.syncing, true);
  assert.equal(syncStates[0]?.total, 2);
  assert.equal(syncStates[syncStates.length - 1]?.syncing, false);
  assert.equal(syncStates[syncStates.length - 1]?.completed, 2);

  // Confirma emissão em tempo real dos logs de início, cada item e conclusão
  assert.deepEqual(
    logs.map((entry) => entry.stage),
    ['start', 'item-synced', 'item-synced', 'complete']
  );
});

test('applyPendingOpsToPois overlays offline inserts, updates and deletes over remote snapshot', () => {
  const remote: POI[] = [
    makePoi({ id: 'a', title: 'Remoto A', createdAt: 10 }),
    makePoi({ id: 'b', title: 'Remoto B', createdAt: 20 }),
  ];
  const ops: PendingOp[] = [
    { opId: '1', type: 'update', id: 'a', updates: { title: 'Remoto A (Editado)' }, ts: 1 },
    { opId: '2', type: 'delete', id: 'b', ts: 2 },
    { opId: '3', type: 'insert', poi: makePoi({ id: 'c', title: 'Novo C', createdAt: 30 }), ts: 3 },
  ];

  const merged = applyPendingOpsToPois(remote, ops);
  assert.deepEqual(
    merged.map((p) => [p.id, p.title]),
    [
      ['a', 'Remoto A (Editado)'],
      ['c', 'Novo C'],
    ]
  );
});

test('OfflineQueueController flushes queued IndexedDB items in a single batch call and deletes confirmed IDs atomically', async () => {
  const records = new Map<string, PendingOp>();
  let deleteManyCalls = 0;
  let deletedBatchIds: string[] = [];

  const adapter: QueueStorageAdapter = {
    async getAll() {
      return Array.from(records.values()).sort((a, b) => a.ts - b.ts);
    },
    async replaceAll(ops) {
      records.clear();
      ops.forEach((op) => records.set(op.opId, op));
    },
    async deleteById(opId) {
      records.delete(opId);
    },
    async deleteManyByIds(opIds) {
      deleteManyCalls += 1;
      deletedBatchIds = [...opIds];
      opIds.forEach((id) => records.delete(id));
    },
    async clear() {
      records.clear();
    },
  };

  const controller = new OfflineQueueController(adapter);
  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'batch-1', title: 'Represa 1' }) });
  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'batch-2', title: 'Represa 2' }) });
  await controller.enqueueAsync({ type: 'delete', id: 'batch-3', baseRevision: 1 });
  assert.equal(records.size, 3);

  let batchCalls = 0;
  let capturedOpsCount = 0;
  const syncStates: OfflineSyncState[] = [];
  const logs: SyncLogEntry[] = [];
  const unsub = controller.subscribeSyncState((s) => syncStates.push(s));

  const res = await controller.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: true }),
    flushBatch: async (ops) => {
      batchCalls += 1;
      capturedOpsCount = ops.length;
      return {
        ok: true,
        succeededOpIds: ops.map((op) => op.opId),
        conflicts: [],
        failedOpIds: [],
        requestCount: 2,
        error: null,
      };
    },
    insert: async () => {
      throw new Error('Sequential insert must not be called when flushBatch is active');
    },
    update: async () => {
      throw new Error('Sequential update must not be called when flushBatch is active');
    },
    remove: async () => {
      throw new Error('Sequential remove must not be called when flushBatch is active');
    },
    onLog: (entry) => logs.push(entry),
  });
  unsub();

  assert.equal(batchCalls, 1);
  assert.equal(capturedOpsCount, 3);
  assert.equal(deleteManyCalls, 1);
  assert.equal(deletedBatchIds.length, 3);
  assert.equal(records.size, 0);
  assert.equal(res.ok, true);
  assert.equal(res.flushed, 3);
  assert.equal(res.remaining, 0);
  assert.equal(res.requestCount, 2);
  assert.equal(res.batchMode, true);
  assert.equal(syncStates[0]?.batchMode, true);
  assert.deepEqual(
    logs.map((l) => l.stage),
    ['start', 'complete']
  );
});

test('OfflineQueueController batch flush isolates conflicts and preserves failed ops in IndexedDB', async () => {
  const { adapter, records } = createMemoryIdbAdapter();
  const controller = new OfflineQueueController(adapter);

  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'ok-1', title: 'OK 1' }) });
  await controller.enqueueAsync({ type: 'update', id: 'conflict-1', updates: { title: 'Editado' }, baseRevision: 1 });
  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'fail-1', title: 'Falhou 1' }) });

  const conflictsHandled: string[] = [];
  const res = await controller.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: true }),
    flushBatch: async (ops) => ({
      ok: false,
      succeededOpIds: [ops[0].opId],
      conflicts: [{ op: ops[1], remotePoi: makePoi({ id: 'conflict-1', revision: 3 }), reason: 'revision-mismatch' }],
      failedOpIds: [ops[2].opId],
      requestCount: 2,
      error: 'Falha parcial no lote',
    }),
    insert: async () => ({ ok: true, error: null }),
    update: async () => ({ ok: true, error: null }),
    remove: async () => ({ ok: true, error: null }),
    onConflict: (op) => conflictsHandled.push(op.id ?? ''),
  });

  assert.equal(res.ok, false);
  assert.equal(res.flushed, 1);
  assert.equal(res.remaining, 1);
  assert.deepEqual(conflictsHandled, ['conflict-1']);
  assert.equal(records.size, 1);
  assert.equal(Array.from(records.values())[0]?.poi?.id, 'fail-1');
});

test('computeExponentialBackoffMs scales exponentially and respects maxDelayMs cap', () => {
  const opts = { baseDelayMs: 1000, multiplier: 2, maxDelayMs: 6000, jitterRatio: 0 };
  assert.equal(computeExponentialBackoffMs(1, opts), 1000);
  assert.equal(computeExponentialBackoffMs(2, opts), 2000);
  assert.equal(computeExponentialBackoffMs(3, opts), 4000);
  assert.equal(computeExponentialBackoffMs(4, opts), 6000);
  assert.equal(computeExponentialBackoffMs(5, opts), 6000);
});

test('OfflineQueueController batch sync uses exponential backoff to recover from intermittent failures without discarding queue', async () => {
  const { adapter, records } = createMemoryIdbAdapter();
  const controller = new OfflineQueueController(adapter);

  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'retry-1', title: 'Ponto Retry 1' }) });
  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'retry-2', title: 'Ponto Retry 2' }) });

  const recordedDelays: number[] = [];
  const logs: SyncLogEntry[] = [];
  let attempt = 0;

  const res = await controller.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: true }),
    batchRetry: {
      maxAttempts: 4,
      baseDelayMs: 1000,
      multiplier: 2,
      jitterRatio: 0,
      sleep: async (ms) => {
        recordedDelays.push(ms);
        // Garante que durante cada espera de retry nenhum item foi descartado do IndexedDB
        assert.equal(records.size, 2);
      },
      isOnline: () => true,
    },
    flushBatch: async (ops) => {
      attempt += 1;
      if (attempt < 3) {
        return {
          ok: false,
          succeededOpIds: [],
          conflicts: [],
          failedOpIds: ops.map((o) => o.opId),
          requestCount: 1,
          error: `503 falha intermitente #${attempt}`,
        };
      }
      return {
        ok: true,
        succeededOpIds: ops.map((o) => o.opId),
        conflicts: [],
        failedOpIds: [],
        requestCount: 1,
        error: null,
      };
    },
    insert: async () => ({ ok: true, error: null }),
    update: async () => ({ ok: true, error: null }),
    remove: async () => ({ ok: true, error: null }),
    onLog: (entry) => logs.push(entry),
  });

  assert.equal(res.ok, true);
  assert.equal(res.flushed, 2);
  assert.equal(res.remaining, 0);
  assert.equal(res.attempts, 3);
  assert.deepEqual(recordedDelays, [1000, 2000]);
  assert.equal(records.size, 0);
  assert.deepEqual(
    logs.map((l) => l.stage),
    ['start', 'retry', 'retry', 'complete']
  );
});

test('OfflineQueueController preserves all IndexedDB items when every exponential retry attempt fails', async () => {
  const { adapter, records } = createMemoryIdbAdapter();
  const controller = new OfflineQueueController(adapter);

  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'keep-1', title: 'Preservar 1' }) });
  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'keep-2', title: 'Preservar 2' }) });

  const delays: number[] = [];
  const res = await controller.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: true }),
    batchRetry: {
      maxAttempts: 3,
      baseDelayMs: 500,
      multiplier: 2,
      jitterRatio: 0,
      sleep: async (ms) => { delays.push(ms); },
      isOnline: () => true,
    },
    flushBatch: async () => {
      throw new Error('Network timeout');
    },
    insert: async () => ({ ok: true, error: null }),
    update: async () => ({ ok: true, error: null }),
    remove: async () => ({ ok: true, error: null }),
  });

  assert.equal(res.ok, false);
  assert.equal(res.flushed, 0);
  assert.equal(res.remaining, 2);
  assert.equal(res.attempts, 3);
  assert.deepEqual(delays, [500, 1000]);
  assert.equal(records.size, 2);
});

test('OfflineQueueController automatically pauses sync on unstable latency and keeps IndexedDB intact', async () => {
  const { adapter, records } = createMemoryIdbAdapter();
  const controller = new OfflineQueueController(adapter);

  await controller.enqueueAsync({ type: 'insert', poi: makePoi({ id: 'pause-1', title: 'Pausado 1' }) });

  let batchCalled = false;
  const states: OfflineSyncState[] = [];
  const unsub = controller.subscribeSyncState((s) => states.push(s));

  const res = await controller.flush({
    isEnabled: () => true,
    ping: async () => ({ reachable: true }),
    batchRetry: {
      shouldPauseForLatency: () => ({
        pause: true,
        reason: 'Latência instável em 3G (2400 ms)',
      }),
    },
    flushBatch: async () => {
      batchCalled = true;
      return { ok: true, succeededOpIds: [], conflicts: [], failedOpIds: [], requestCount: 1, error: null };
    },
    insert: async () => ({ ok: true, error: null }),
    update: async () => ({ ok: true, error: null }),
    remove: async () => ({ ok: true, error: null }),
  });
  unsub();

  assert.equal(batchCalled, false);
  assert.equal(res.ok, false);
  assert.equal(res.pausedForLatency, true);
  assert.equal(res.reason, 'paused-unstable-latency');
  assert.equal(records.size, 1);
  assert.equal(states[states.length - 1]?.pausedForLatency, true);
  assert.match(states[states.length - 1]?.pauseReason || '', /2400 ms/);
});


