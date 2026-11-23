/**
 * offlineQueue — Fila de persistência offline-first em IndexedDB para POIs.
 *
 * Toda criação, edição ou exclusão de ponto de interesse feita offline (ou
 * antes da confirmação da rede) é gravada imediatamente no IndexedDB
 * (`mapas-pois-offline-queue-db` / store `pending_ops`). Ao detectar o retorno
 * da conexão (`online`), a fila é sincronizada automaticamente na ordem
 * cronológica com o Supabase, removendo cada item confirmado do IndexedDB.
 *
 * Características:
 *  - Persistência robusta em IndexedDB (suporta fotos comprimidas sem estourar
 *    o limite de ~5 MB do localStorage).
 *  - Migração automática de pendências legadas do localStorage.
 *  - Estado observável de sincronização em tempo real (`subscribeOfflineSyncState`)
 *    para feedback visual ("Sincronizando...") no cabeçalho.
 *  - Log visual estruturado no console do desenvolvedor para depuração em tempo real.
 */

import type { POI } from '@/components/POIManager';
import {
  insertPoi,
  updatePoiById,
  deletePoiById,
  pingSupabase,
  syncPendingOpsBatch,
  upsertRemoteConflict,
  type BatchSyncResult,
} from './poiService';
import { SUPABASE_ENABLED } from './supabaseClient';
import { addConflict, conflictFromPendingOp } from './conflictStore';
import { networkQualityMonitor } from './networkQualityMonitor';

const LEGACY_QUEUE_KEY = 'mapas-pois-pending-v1';
export const OFFLINE_QUEUE_DB_NAME = 'mapas-pois-offline-queue-db';
export const OFFLINE_QUEUE_DB_VERSION = 1;
export const PENDING_OPS_STORE = 'pending_ops';
export const POIS_SNAPSHOT_STORE = 'pois_snapshot';
const POIS_SNAPSHOT_KEY = 'latest';

export type PendingType = 'insert' | 'update' | 'delete';

export interface PendingOp {
  opId: string;
  type: PendingType;
  ts: number;
  // insert/update carregam o POI completo (para upsert idempotente)
  poi?: POI;
  // update carrega tambem o patch (campos alterados)
  updates?: Partial<POI>;
  // delete carrega o id e a versão que o usuário confirmou localmente
  id?: string;
  // Snapshot usado para comparar a versão remota antes de atualizar/excluir.
  basePoi?: POI;
  baseRevision?: number;
}

export interface FlushResult {
  ok: boolean;
  flushed: number;
  remaining: number;
  requestCount?: number;
  attempts?: number;
  batchMode?: boolean;
  pausedForLatency?: boolean;
  pauseReason?: string;
  reason?: string;
}

export interface OfflineSyncState {
  syncing: boolean;
  total: number;
  completed: number;
  remaining: number;
  batchMode?: boolean;
  pausedForLatency?: boolean;
  pauseReason?: string;
  retryAttempt?: number;
  maxRetryAttempts?: number;
  nextRetryMs?: number;
  currentOpType?: PendingType;
  currentTitle?: string;
}

export interface BatchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitterRatio?: number;
  sleep?: (ms: number) => Promise<void>;
  randomFn?: () => number;
  isOnline?: () => boolean;
  shouldPauseForLatency?: () => { pause: boolean; reason?: string };
}

export interface QueueStorageAdapter {
  getAll(): Promise<PendingOp[]>;
  replaceAll(ops: PendingOp[]): Promise<void>;
  deleteById(opId: string): Promise<void>;
  deleteManyByIds?(opIds: string[]): Promise<void>;
  clear(): Promise<void>;
}

export type SyncLogStage =
  | 'enqueued'
  | 'start'
  | 'retry'
  | 'paused'
  | 'item-synced'
  | 'item-conflict'
  | 'item-error'
  | 'complete';

export interface SyncLogEntry {
  stage: SyncLogStage;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Calcula o atraso de backoff exponencial para uma tentativa de retry (1-indexed),
 * limitado a `maxDelayMs` e com jitter opcional para evitar tempestades de reconexão.
 */
export function computeExponentialBackoffMs(
  attempt: number,
  options: Pick<BatchRetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'multiplier' | 'jitterRatio' | 'randomFn'> = {}
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 1000);
  const multiplier = Math.max(1.2, options.multiplier ?? 2);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 30_000);
  const jitterRatio = Math.min(0.5, Math.max(0, options.jitterRatio ?? 0.2));
  const randomFn = options.randomFn ?? Math.random;

  const rawDelay = Math.min(maxDelayMs, Math.round(baseDelayMs * Math.pow(multiplier, safeAttempt - 1)));
  if (jitterRatio === 0) return rawDelay;

  const jitterSpan = rawDelay * jitterRatio;
  const jitterOffset = (randomFn() * 2 - 1) * jitterSpan;
  return Math.max(50, Math.min(maxDelayMs, Math.round(rawDelay + jitterOffset)));
}

function formatLogTime(): string {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return '';
  }
}

/**
 * Emite log visual colorido e estruturado no console do desenvolvedor
 * acompanhando em tempo real o ciclo de persistência e sincronização do IndexedDB.
 */
export function logOfflineSyncEvent(entry: SyncLogEntry): void {
  const time = formatLogTime();
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  if (!isBrowser) return;

  const badgeColors: Record<SyncLogStage, string> = {
    enqueued: 'background:#78350f;color:#fef3c7;font-weight:700;padding:2px 6px;border-radius:4px;',
    start: 'background:#0c4a6e;color:#bae6fd;font-weight:700;padding:2px 6px;border-radius:4px;',
    retry: 'background:#713f12;color:#fef08a;font-weight:700;padding:2px 6px;border-radius:4px;',
    paused: 'background:#7c2d12;color:#fed7aa;font-weight:700;padding:2px 6px;border-radius:4px;',
    'item-synced': 'background:#14532d;color:#bbf7d0;font-weight:700;padding:2px 6px;border-radius:4px;',
    'item-conflict': 'background:#7c2d12;color:#fed7aa;font-weight:700;padding:2px 6px;border-radius:4px;',
    'item-error': 'background:#7f1d1d;color:#fecaca;font-weight:700;padding:2px 6px;border-radius:4px;',
    complete: 'background:#166534;color:#dcfce7;font-weight:700;padding:2px 6px;border-radius:4px;',
  };

  const label = `[OfflineSync · IndexedDB ${time}]`;
  const logger =
    entry.stage === 'item-error' || entry.stage === 'item-conflict' || entry.stage === 'paused' || entry.stage === 'retry'
      ? console.warn
      : console.info;

  logger(
    `%c${label}%c ${entry.message}`,
    badgeColors[entry.stage],
    'color:inherit;font-weight:600;',
    entry.details
  );
}

function newOpId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function describeOpTarget(op: Pick<PendingOp, 'type' | 'poi' | 'id' | 'updates'>): {
  poiId: string;
  title: string;
} {
  const poiId = op.poi?.id ?? op.id ?? 'desconhecido';
  const title = op.poi?.title ?? (typeof op.updates?.title === 'string' ? op.updates.title : '') ?? '';
  return { poiId, title: title || poiId };
}

// ── Lógica pura de fila (testável em Node sem browser) ───────────────────────

/** Colapsa uma nova operação na fila existente, preservando a ordem cronológica. */
export function coalescePendingOp(
  queue: readonly PendingOp[],
  op: Omit<PendingOp, 'opId' | 'ts'>,
  now = Date.now(),
  opIdFactory: () => string = newOpId
): PendingOp[] {
  const next = [...queue];
  const targetId = op.poi?.id ?? op.id;

  if (op.type === 'insert' && targetId) {
    const filtered = next.filter((q) => (q.poi?.id ?? q.id) !== targetId);
    filtered.push({ ...op, opId: opIdFactory(), ts: now });
    return filtered;
  }

  if (op.type === 'update' && targetId) {
    const insertIdx = next.findIndex(
      (q) => q.type === 'insert' && (q.poi?.id ?? q.id) === targetId
    );
    if (insertIdx >= 0 && next[insertIdx].poi) {
      next[insertIdx] = {
        ...next[insertIdx],
        poi: { ...(next[insertIdx].poi as POI), ...(op.updates || {}) } as POI,
      };
      return next;
    }

    const updIdx = next.findIndex(
      (q) => q.type === 'update' && (q.poi?.id ?? q.id) === targetId
    );
    if (updIdx >= 0) {
      next[updIdx] = {
        ...next[updIdx],
        poi: op.poi ?? next[updIdx].poi,
        updates: { ...(next[updIdx].updates || {}), ...(op.updates || {}) },
        basePoi: next[updIdx].basePoi ?? op.basePoi,
        baseRevision: next[updIdx].baseRevision ?? op.baseRevision,
        ts: now,
      };
      return next;
    }

    next.push({ ...op, opId: opIdFactory(), ts: now });
    return next;
  }

  if (op.type === 'delete' && targetId) {
    const filtered = next.filter((q) => (q.poi?.id ?? q.id) !== targetId);
    filtered.push({ ...op, type: 'delete', id: targetId, opId: opIdFactory(), ts: now });
    return filtered;
  }

  next.push({ ...op, opId: opIdFactory(), ts: now });
  return next;
}

/** Aplica as operações pendentes por cima de uma lista remota de POIs. */
export function applyPendingOpsToPois(remote: readonly POI[], queue: readonly PendingOp[]): POI[] {
  const map = new Map<string, POI>();
  remote.forEach((p) => map.set(p.id, p));

  for (const op of queue) {
    if ((op.type === 'insert' || op.type === 'update') && op.poi) {
      const existing = map.get(op.poi.id);
      map.set(op.poi.id, existing ? { ...existing, ...op.poi } : op.poi);
    } else if (op.type === 'update' && op.id && op.updates) {
      const existing = map.get(op.id);
      if (existing) map.set(op.id, { ...existing, ...op.updates });
    } else if (op.type === 'delete' && op.id) {
      map.delete(op.id);
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export interface FlushExecutors {
  isEnabled: () => boolean;
  ping: () => Promise<{ reachable: boolean; reason?: string }>;
  flushBatch?: (ops: PendingOp[]) => Promise<BatchSyncResult>;
  batchRetry?: BatchRetryOptions;
  insert: (poi: POI) => Promise<{ ok: boolean; error: string | null; conflict?: { remotePoi?: POI; reason: string } }>;
  update: (
    id: string,
    updates: Partial<POI>,
    baseRevision?: number,
    basePoi?: POI
  ) => Promise<{ ok: boolean; error: string | null; conflict?: { remotePoi?: POI; reason: string } }>;
  remove: (
    id: string,
    baseRevision?: number,
    basePoi?: POI
  ) => Promise<{ ok: boolean; error: string | null; conflict?: { remotePoi?: POI; reason: string } }>;
  onConflict?: (op: PendingOp, conflict: { remotePoi?: POI; reason: string }) => void;
  onSynced?: (result: FlushResult) => void;
  onLog?: (entry: SyncLogEntry) => void;
}

const INITIAL_SYNC_STATE: OfflineSyncState = {
  syncing: false,
  total: 0,
  completed: 0,
  remaining: 0,
};

/**
 * Controlador de fila desacoplado de IndexedDB/Supabase para permitir testes
 * determinísticos em Node e reutilização direta no navegador.
 */
export class OfflineQueueController {
  private cache: PendingOp[] = [];
  private hydrated = false;
  private initPromise: Promise<PendingOp[]> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private flushing = false;
  private syncState: OfflineSyncState = { ...INITIAL_SYNC_STATE };
  private listeners = new Set<(ops: PendingOp[]) => void>();
  private syncStateListeners = new Set<(state: OfflineSyncState) => void>();

  constructor(
    private readonly storage: QueueStorageAdapter,
    private readonly legacyLoader?: () => PendingOp[],
    private readonly legacyClearer?: () => void
  ) {}

  private notify(): void {
    const snapshot = [...this.cache];
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        /* noop */
      }
    });
  }

  private setSyncState(next: OfflineSyncState): void {
    this.syncState = next;
    const copy = { ...next };
    this.syncStateListeners.forEach((listener) => {
      try {
        listener(copy);
      } catch {
        /* noop */
      }
    });
  }

  private schedulePersist(task: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain
      .then(task)
      .catch((err) => {
        console.warn('[offlineQueue] Falha ao persistir fila no IndexedDB:', err);
      });
    return this.writeChain;
  }

  subscribe(listener: (ops: PendingOp[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeSyncState(listener: (state: OfflineSyncState) => void): () => void {
    this.syncStateListeners.add(listener);
    return () => {
      this.syncStateListeners.delete(listener);
    };
  }

  getSyncState(): OfflineSyncState {
    return { ...this.syncState };
  }

  async init(): Promise<PendingOp[]> {
    if (this.hydrated) {
      await this.writeChain;
      return [...this.cache];
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const stored = await this.storage.getAll().catch(() => [] as PendingOp[]);
        const legacy = this.legacyLoader ? this.legacyLoader() : [];

        const byId = new Map<string, PendingOp>();
        for (const op of [...stored, ...legacy, ...this.cache]) {
          byId.set(op.opId, op);
        }
        const merged = Array.from(byId.values()).sort((a, b) => a.ts - b.ts);
        this.cache = merged;
        this.hydrated = true;

        if (legacy.length > 0 || merged.length !== stored.length) {
          await this.schedulePersist(() => this.storage.replaceAll([...this.cache]));
          this.legacyClearer?.();
        }

        this.notify();
        return [...this.cache];
      })();
    }
    return this.initPromise;
  }

  loadSync(): PendingOp[] {
    return [...this.cache];
  }

  async loadAsync(): Promise<PendingOp[]> {
    await this.init();
    await this.writeChain;
    return [...this.cache];
  }

  pendingCount(): number {
    return this.cache.length;
  }

  enqueue(op: Omit<PendingOp, 'opId' | 'ts'>): PendingOp[] {
    const next = coalescePendingOp(this.cache, op);
    this.cache = next;
    this.notify();
    void this.schedulePersist(() => this.storage.replaceAll([...this.cache]));

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const target = describeOpTarget(op);
      logOfflineSyncEvent({
        stage: 'enqueued',
        message: `Operação ${op.type.toUpperCase()} salva no IndexedDB (aguardando conexão)`,
        details: {
          type: op.type,
          poiId: target.poiId,
          title: target.title,
          pendingInIndexedDB: next.length,
        },
      });
    }

    return [...next];
  }

  async enqueueAsync(op: Omit<PendingOp, 'opId' | 'ts'>): Promise<PendingOp[]> {
    await this.init();
    const next = this.enqueue(op);
    await this.writeChain;
    return next;
  }

  async flush(executors: FlushExecutors): Promise<FlushResult> {
    await this.init();
    await this.writeChain;

    if (!executors.isEnabled()) {
      return { ok: false, flushed: 0, remaining: this.cache.length, reason: 'supabase-disabled' };
    }
    if (this.flushing) {
      return { ok: false, flushed: 0, remaining: this.cache.length, reason: 'busy' };
    }
    if (this.cache.length === 0) {
      return { ok: true, flushed: 0, remaining: 0 };
    }

    const total = this.cache.length;
    const emitLog = executors.onLog ?? logOfflineSyncEvent;
    const useBatch = typeof executors.flushBatch === 'function';
    const retryOpts = executors.batchRetry ?? {};
    const maxAttempts = Math.max(1, retryOpts.maxAttempts ?? 4);
    const sleepFn =
      retryOpts.sleep ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const isOnlineFn =
      retryOpts.isOnline ??
      (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

    // Verifica latência instável ANTES de iniciar envio para pausar automaticamente preservando o IndexedDB
    const prePause = retryOpts.shouldPauseForLatency?.();
    if (prePause?.pause) {
      const reason = prePause.reason || 'Latência instável detectada — sincronização pausada automaticamente';
      this.setSyncState({
        syncing: false,
        total,
        completed: 0,
        remaining: this.cache.length,
        batchMode: useBatch,
        pausedForLatency: true,
        pauseReason: reason,
      });
      emitLog({
        stage: 'paused',
        message: `Sincronização pausada automaticamente (${total} ${total === 1 ? 'item preservado' : 'itens preservados'} no IndexedDB): ${reason}`,
        details: {
          remainingInIndexedDB: this.cache.length,
          reason,
        },
      });
      return {
        ok: false,
        flushed: 0,
        remaining: this.cache.length,
        requestCount: 0,
        attempts: 0,
        batchMode: useBatch,
        pausedForLatency: true,
        pauseReason: reason,
        reason: 'paused-unstable-latency',
      };
    }

    this.flushing = true;
    this.setSyncState({
      syncing: true,
      total,
      completed: 0,
      remaining: total,
      batchMode: useBatch,
      pausedForLatency: false,
      retryAttempt: 1,
      maxRetryAttempts: useBatch ? maxAttempts : 1,
    });

    const startedAt = Date.now();
    let flushed = 0;
    let pausedForLatency = false;
    let pauseReason: string | undefined;

    try {
      const ping = await executors.ping();
      if (!ping.reachable) {
        emitLog({
          stage: 'item-error',
          message: `Backend indisponível — ${total} ${total === 1 ? 'item mantido' : 'itens mantidos'} no IndexedDB`,
          details: { reason: ping.reason || 'unreachable', remaining: this.cache.length },
        });
        return { ok: false, flushed: 0, remaining: this.cache.length, requestCount: 0, attempts: 0, batchMode: useBatch, reason: ping.reason || 'unreachable' };
      }

      const snapshot = [...this.cache];
      emitLog({
        stage: 'start',
        message: useBatch
          ? `Enviando lote único (batch) com ${snapshot.length} ${snapshot.length === 1 ? 'item' : 'itens'} do IndexedDB ao backend`
          : `Iniciando sincronização de ${snapshot.length} ${snapshot.length === 1 ? 'item' : 'itens'} do IndexedDB com o backend`,
        details: {
          batchMode: useBatch,
          total: snapshot.length,
          maxRetryAttempts: useBatch ? maxAttempts : 1,
          queue: snapshot.map((item) => ({
            opId: item.opId,
            type: item.type,
            ...describeOpTarget(item),
          })),
        },
      });

      if (useBatch && executors.flushBatch) {
        const opById = new Map(snapshot.map((item) => [item.opId, item]));
        let pendingBatch = [...snapshot];
        const allSucceededIds: string[] = [];
        let totalRequests = 0;
        let totalConflicts = 0;
        let attemptsUsed = 0;
        let lastError: string | null = null;

        for (let attempt = 1; attempt <= maxAttempts && pendingBatch.length > 0; attempt += 1) {
          attemptsUsed = attempt;
          this.setSyncState({
            syncing: true,
            total: snapshot.length,
            completed: flushed,
            remaining: this.cache.length,
            batchMode: true,
            pausedForLatency: false,
            retryAttempt: attempt,
            maxRetryAttempts: maxAttempts,
          });

          let batchResult: BatchSyncResult;
          try {
            batchResult = await executors.flushBatch(pendingBatch);
          } catch (err) {
            batchResult = {
              ok: false,
              succeededOpIds: [],
              conflicts: [],
              failedOpIds: pendingBatch.map((op) => op.opId),
              requestCount: 1,
              error: err instanceof Error ? err.message : String(err),
            };
          }

          totalRequests += batchResult.requestCount;
          if (batchResult.error) lastError = batchResult.error;

          for (const conflict of batchResult.conflicts) {
            const originalOp = opById.get(conflict.op.opId);
            if (!originalOp) continue;
            totalConflicts += 1;
            const target = describeOpTarget(originalOp);
            executors.onConflict?.(originalOp, {
              remotePoi: conflict.remotePoi,
              reason: conflict.reason,
            });
            emitLog({
              stage: 'item-conflict',
              message: `Conflito detectado no lote (${originalOp.type.toUpperCase()} · ${target.title}) — registrado para resolução`,
              details: {
                opId: originalOp.opId,
                type: originalOp.type,
                poiId: target.poiId,
                reason: conflict.reason,
                attempt,
              },
            });
          }

          const removableIds = new Set<string>([
            ...batchResult.succeededOpIds,
            ...batchResult.conflicts.map((item) => item.op.opId),
          ]);

          if (removableIds.size > 0) {
            this.cache = this.cache.filter((q) => !removableIds.has(q.opId));
            this.notify();
            const idsToDelete = Array.from(removableIds);
            if (typeof this.storage.deleteManyByIds === 'function') {
              await this.schedulePersist(() => this.storage.deleteManyByIds!(idsToDelete));
            } else {
              await this.schedulePersist(() => this.storage.replaceAll([...this.cache]));
            }
          }

          allSucceededIds.push(...batchResult.succeededOpIds);
          flushed = allSucceededIds.length;

          // Apenas itens que realmente falharam permanecem para a próxima tentativa exponencial;
          // NENHUM item com falha é descartado do IndexedDB.
          const failedIdSet = new Set(batchResult.failedOpIds);
          pendingBatch = pendingBatch.filter((op) => failedIdSet.has(op.opId));

          this.setSyncState({
            syncing: true,
            total: snapshot.length,
            completed: flushed,
            remaining: this.cache.length,
            batchMode: true,
            pausedForLatency: false,
            retryAttempt: attempt,
            maxRetryAttempts: maxAttempts,
          });

          if (pendingBatch.length === 0) break;

          // Ainda há itens com falha intermitente: agenda retry exponencial se houver tentativas
          if (attempt < maxAttempts) {
            if (!isOnlineFn()) {
              emitLog({
                stage: 'item-error',
                message: `Conexão perdida durante o envio — ${pendingBatch.length} ${pendingBatch.length === 1 ? 'item preservado' : 'itens preservados'} no IndexedDB`,
                details: { attempt, remainingInIndexedDB: this.cache.length },
              });
              break;
            }

            const midPause = retryOpts.shouldPauseForLatency?.();
            if (midPause?.pause) {
              pausedForLatency = true;
              pauseReason = midPause.reason || 'Latência instável detectada durante retry — sincronização pausada';
              emitLog({
                stage: 'paused',
                message: `Retry pausado por latência instável — ${pendingBatch.length} ${pendingBatch.length === 1 ? 'item preservado' : 'itens preservados'} no IndexedDB`,
                details: { attempt, reason: pauseReason, remainingInIndexedDB: this.cache.length },
              });
              break;
            }

            const delayMs = computeExponentialBackoffMs(attempt, retryOpts);
            this.setSyncState({
              syncing: true,
              total: snapshot.length,
              completed: flushed,
              remaining: this.cache.length,
              batchMode: true,
              pausedForLatency: false,
              retryAttempt: attempt + 1,
              maxRetryAttempts: maxAttempts,
              nextRetryMs: delayMs,
            });
            emitLog({
              stage: 'retry',
              message: `Tentativa ${attempt}/${maxAttempts} falhou (${lastError || 'falha intermitente'}) — ${pendingBatch.length} ${pendingBatch.length === 1 ? 'item preservado' : 'itens preservados'} no IndexedDB; nova tentativa exponencial em ${delayMs}ms`,
              details: {
                attempt,
                nextAttempt: attempt + 1,
                maxAttempts,
                delayMs,
                failedCount: pendingBatch.length,
                remainingInIndexedDB: this.cache.length,
                error: lastError,
              },
            });

            await sleepFn(delayMs);

            if (!isOnlineFn()) break;
            const postSleepPause = retryOpts.shouldPauseForLatency?.();
            if (postSleepPause?.pause) {
              pausedForLatency = true;
              pauseReason = postSleepPause.reason || 'Latência instável detectada — sincronização pausada automaticamente';
              break;
            }
          }
        }

        const totalDurationMs = Date.now() - startedAt;
        const syncedItems = allSucceededIds
          .map((id) => opById.get(id))
          .filter((item): item is PendingOp => Boolean(item))
          .map((item) => ({ opId: item.opId, type: item.type, ...describeOpTarget(item) }));

        if (flushed > 0) {
          const reqLabel = totalRequests === 1 ? '1 requisição' : `${totalRequests} requisições`;
          emitLog({
            stage: 'complete',
            message: `✔ Lote sincronizado em ${reqLabel} (${attemptsUsed} ${attemptsUsed === 1 ? 'tentativa' : 'tentativas'}): ${flushed} ${flushed === 1 ? 'item enviado' : 'itens enviados'} e removidos do IndexedDB`,
            details: {
              batchMode: true,
              flushed,
              requestCount: totalRequests,
              attempts: attemptsUsed,
              conflicts: totalConflicts,
              remainingInIndexedDB: this.cache.length,
              totalDurationMs,
              syncedItems,
            },
          });
        }

        if (pendingBatch.length > 0 || totalConflicts > 0) {
          if (pendingBatch.length > 0 && !pausedForLatency) {
            emitLog({
              stage: 'item-error',
              message: `Falha após ${attemptsUsed} ${attemptsUsed === 1 ? 'tentativa' : 'tentativas'} — ${pendingBatch.length} ${pendingBatch.length === 1 ? 'item preservado' : 'itens preservados'} intactos no IndexedDB`,
              details: {
                batchMode: true,
                flushed,
                attempts: attemptsUsed,
                failedOpIds: pendingBatch.map((op) => op.opId),
                requestCount: totalRequests,
                error: lastError,
                remainingInIndexedDB: this.cache.length,
              },
            });
          }
          const partialResult: FlushResult = {
            ok: false,
            flushed,
            remaining: this.cache.length,
            requestCount: totalRequests,
            attempts: attemptsUsed,
            batchMode: true,
            pausedForLatency,
            pauseReason,
            reason: pausedForLatency
              ? 'paused-unstable-latency'
              : totalConflicts > 0 && pendingBatch.length === 0
                ? 'conflict'
                : 'batch-failed',
          };
          if (flushed > 0) executors.onSynced?.(partialResult);
          return partialResult;
        }

        const finalBatchResult: FlushResult = {
          ok: true,
          flushed,
          remaining: this.cache.length,
          requestCount: totalRequests,
          attempts: attemptsUsed,
          batchMode: true,
        };
        if (flushed > 0) executors.onSynced?.(finalBatchResult);
        return finalBatchResult;
      }

      for (const op of snapshot) {
        const target = describeOpTarget(op);
        const itemStartedAt = Date.now();
        this.setSyncState({
          syncing: true,
          total: snapshot.length,
          completed: flushed,
          remaining: this.cache.length,
          currentOpType: op.type,
          currentTitle: target.title,
        });

        try {
          let result: { ok: boolean; error: string | null; conflict?: { remotePoi?: POI; reason: string } } = {
            ok: true,
            error: null,
          };

          if (op.type === 'insert' && op.poi) {
            result = await executors.insert(op.poi);
          } else if (op.type === 'update') {
            if (op.id && op.updates) {
              result = await executors.update(op.id, op.updates, op.baseRevision, op.basePoi);
            } else if (op.poi) {
              result = await executors.update(op.poi.id, op.poi, op.baseRevision, op.basePoi);
            }
          } else if (op.type === 'delete' && op.id) {
            result = await executors.remove(op.id, op.baseRevision, op.basePoi);
          }

          if (!result.ok) {
            if (result.conflict) {
              executors.onConflict?.(op, result.conflict);
              this.cache = this.cache.filter((q) => q.opId !== op.opId);
              this.notify();
              await this.schedulePersist(() => this.storage.deleteById(op.opId));
              emitLog({
                stage: 'item-conflict',
                message: `Conflito detectado ao sincronizar ${op.type.toUpperCase()} (${target.title}) — registrado para resolução`,
                details: {
                  opId: op.opId,
                  type: op.type,
                  poiId: target.poiId,
                  reason: result.conflict.reason,
                  remaining: this.cache.length,
                },
              });
              return { ok: false, flushed, remaining: this.cache.length, reason: 'conflict' };
            }
            throw new Error(result.error || 'Operação rejeitada pelo banco');
          }

          this.cache = this.cache.filter((q) => q.opId !== op.opId);
          this.notify();
          await this.schedulePersist(() => this.storage.deleteById(op.opId));
          flushed += 1;

          const durationMs = Date.now() - itemStartedAt;
          this.setSyncState({
            syncing: true,
            total: snapshot.length,
            completed: flushed,
            remaining: this.cache.length,
            currentOpType: op.type,
            currentTitle: target.title,
          });

          emitLog({
            stage: 'item-synced',
            message: `✓ Item ${flushed}/${snapshot.length} sincronizado (${op.type.toUpperCase()} · ${target.title}) e removido do IndexedDB`,
            details: {
              opId: op.opId,
              type: op.type,
              poiId: target.poiId,
              title: target.title,
              durationMs,
              remainingInIndexedDB: this.cache.length,
            },
          });
        } catch (err) {
          emitLog({
            stage: 'item-error',
            message: `Falha ao sincronizar ${op.type.toUpperCase()} (${target.title}) — item preservado no IndexedDB`,
            details: {
              opId: op.opId,
              type: op.type,
              poiId: target.poiId,
              error: err instanceof Error ? err.message : String(err),
              remainingInIndexedDB: this.cache.length,
            },
          });
          return { ok: false, flushed, remaining: this.cache.length, reason: 'op-failed' };
        }
      }

      const finalResult: FlushResult = { ok: true, flushed, remaining: this.cache.length };
      if (flushed > 0) {
        emitLog({
          stage: 'complete',
          message: `✔ Sincronização concluída: ${flushed} ${flushed === 1 ? 'item enviado' : 'itens enviados'} do IndexedDB ao backend`,
          details: {
            flushed,
            remainingInIndexedDB: this.cache.length,
            totalDurationMs: Date.now() - startedAt,
          },
        });
        executors.onSynced?.(finalResult);
      }
      return finalResult;
    } finally {
      this.flushing = false;
      this.setSyncState({
        syncing: false,
        total,
        completed: flushed,
        remaining: this.cache.length,
        batchMode: useBatch,
        pausedForLatency,
        pauseReason,
      });
    }
  }

  clear(): void {
    this.cache = [];
    this.notify();
    void this.schedulePersist(() => this.storage.clear());
  }

  async clearAsync(): Promise<void> {
    this.clear();
    await this.writeChain;
  }
}

// ── Persistência IndexedDB no navegador ──────────────────────────────────────

function openOfflineQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb-unavailable'));
      return;
    }
    const req = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PENDING_OPS_STORE)) {
        const store = db.createObjectStore(PENDING_OPS_STORE, { keyPath: 'opId' });
        store.createIndex('by_ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains(POIS_SNAPSHOT_STORE)) {
        db.createObjectStore(POIS_SNAPSHOT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb-open-failed'));
  });
}

function createIndexedDBStorageAdapter(): QueueStorageAdapter {
  return {
    async getAll(): Promise<PendingOp[]> {
      const db = await openOfflineQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_OPS_STORE, 'readonly');
        const store = tx.objectStore(PENDING_OPS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = Array.isArray(req.result) ? (req.result as PendingOp[]) : [];
          items.sort((a, b) => a.ts - b.ts);
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async replaceAll(ops: PendingOp[]): Promise<void> {
      const db = await openOfflineQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_OPS_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_OPS_STORE);
        store.clear();
        for (const op of ops) {
          store.put(op);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async deleteById(opId: string): Promise<void> {
      const db = await openOfflineQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_OPS_STORE, 'readwrite');
        tx.objectStore(PENDING_OPS_STORE).delete(opId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async deleteManyByIds(opIds: string[]): Promise<void> {
      if (opIds.length === 0) return;
      const db = await openOfflineQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_OPS_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_OPS_STORE);
        for (const opId of opIds) {
          store.delete(opId);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async clear(): Promise<void> {
      const db = await openOfflineQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_OPS_STORE, 'readwrite');
        tx.objectStore(PENDING_OPS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

/** Salva snapshot completo dos POIs no IndexedDB (sem limite de 5 MB do localStorage). */
export async function savePoisSnapshotIDB(pois: POI[]): Promise<void> {
  try {
    const db = await openOfflineQueueDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(POIS_SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(POIS_SNAPSHOT_STORE).put(
        { pois, savedAt: Date.now() },
        POIS_SNAPSHOT_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop — localStorage fallback permanece ativo */
  }
}

/** Recupera snapshot de POIs salvo no IndexedDB para abertura imediata offline. */
export async function loadPoisSnapshotIDB(): Promise<POI[] | null> {
  try {
    const db = await openOfflineQueueDB();
    return await new Promise<POI[] | null>((resolve, reject) => {
      const tx = db.transaction(POIS_SNAPSHOT_STORE, 'readonly');
      const req = tx.objectStore(POIS_SNAPSHOT_STORE).get(POIS_SNAPSHOT_KEY);
      req.onsuccess = () => {
        const record = req.result as { pois?: POI[] } | undefined;
        resolve(Array.isArray(record?.pois) ? record.pois : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

function readLegacyLocalStorageQueue(): PendingOp[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLegacyLocalStorageQueue(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    }
  } catch {
    /* noop */
  }
}

// Instância singleton usada pelo app no navegador
const browserQueue = new OfflineQueueController(
  createIndexedDBStorageAdapter(),
  readLegacyLocalStorageQueue,
  clearLegacyLocalStorageQueue
);

// Dispara eventos customizados na window quando a fila ou o estado de sync muda
if (typeof window !== 'undefined') {
  browserQueue.subscribe((ops) => {
    window.dispatchEvent(
      new CustomEvent('bp-offline-queue-change', {
        detail: { count: ops.length, ops },
      })
    );
  });
  browserQueue.subscribeSyncState((state) => {
    window.dispatchEvent(
      new CustomEvent('bp-offline-queue-sync-state', {
        detail: state,
      })
    );
  });
  void browserQueue.init();
}

export function initOfflineQueue(): Promise<PendingOp[]> {
  return browserQueue.init();
}

export function loadQueue(): PendingOp[] {
  return browserQueue.loadSync();
}

export function loadQueueAsync(): Promise<PendingOp[]> {
  return browserQueue.loadAsync();
}

export function pendingCount(): number {
  return browserQueue.pendingCount();
}

export function getOfflineSyncState(): OfflineSyncState {
  return browserQueue.getSyncState();
}

export function subscribeOfflineQueue(listener: (ops: PendingOp[]) => void): () => void {
  return browserQueue.subscribe(listener);
}

export function subscribeOfflineSyncState(listener: (state: OfflineSyncState) => void): () => void {
  return browserQueue.subscribeSyncState(listener);
}

/** Enfileira uma operação no IndexedDB e atualiza o espelho em memória imediatamente. */
export function enqueue(op: Omit<PendingOp, 'opId' | 'ts'>): PendingOp[] {
  return browserQueue.enqueue(op);
}

/** Enfileira uma operação e aguarda a confirmação da gravação no IndexedDB. */
export function enqueueAsync(op: Omit<PendingOp, 'opId' | 'ts'>): Promise<PendingOp[]> {
  return browserQueue.enqueueAsync(op);
}

export interface FlushQueueOptions {
  /** Permite forçar tentativa imediata pelo usuário mesmo quando pausado por latência instável. */
  ignoreLatencyPause?: boolean;
  /** Overrides opcionais de retry exponencial. */
  retryOptions?: Partial<BatchRetryOptions>;
}

/**
 * Descarrega a fila persistida no IndexedDB para o Supabase em lote único (batch)
 * com retry exponencial automático e pausa inteligente em caso de latência instável.
 * Falhas intermitentes jamais descartam pendências armazenadas no IndexedDB.
 */
export async function flushQueue(options: FlushQueueOptions = {}): Promise<FlushResult> {
  const result = await browserQueue.flush({
    isEnabled: () => SUPABASE_ENABLED,
    ping: async () => {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const pingResult = await pingSupabase();
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      networkQualityMonitor.recordLatencySample(elapsed, pingResult.reachable);
      return pingResult;
    },
    flushBatch: syncPendingOpsBatch,
    batchRetry: {
      maxAttempts: 4,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      multiplier: 2,
      jitterRatio: 0.2,
      shouldPauseForLatency: options.ignoreLatencyPause
        ? undefined
        : () => {
            const quality = networkQualityMonitor.evaluate('manual');
            return {
              pause: quality.shouldPauseSync,
              reason: quality.pauseReason ?? undefined,
            };
          },
      ...options.retryOptions,
    },
    insert: insertPoi,
    update: updatePoiById,
    remove: deletePoiById,
    onConflict: (op, writeConflict) => {
      const conflict = addConflict(
        conflictFromPendingOp(op, writeConflict.remotePoi, writeConflict.reason)
      );
      void upsertRemoteConflict(conflict).catch((error) => {
        console.warn('[offlineQueue] Conflito mantido localmente; falha ao publicar no banco:', error);
      });
    },
    onSynced: (syncResult) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('bp-offline-queue-synced', {
            detail: syncResult,
          })
        );
      }
    },
  });

  if (!result.ok && result.reason === 'batch-failed') {
    networkQualityMonitor.recordLatencySample(2200, false);
  }
  return result;
}

/**
 * Mescla a lista remota (fonte da verdade) com as operações ainda pendentes,
 * para o usuário nunca "perder de vista" o que criou ou alterou offline.
 */
export function mergeRemoteWithPending(remote: POI[]): POI[] {
  return applyPendingOpsToPois(remote, browserQueue.loadSync());
}

export function clearQueue(): void {
  browserQueue.clear();
  clearLegacyLocalStorageQueue();
}

export async function clearQueueAsync(): Promise<void> {
  await browserQueue.clearAsync();
  clearLegacyLocalStorageQueue();
}
