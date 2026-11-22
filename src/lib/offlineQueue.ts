/**
 * offlineQueue — Fila de operacoes offline-first para as ocorrencias (POIs).
 *
 * Objetivo: o app precisa funcionar 100% sem internet no campo. Toda criacao /
 * edicao / exclusao de POI e SEMPRE gravada primeiro numa fila local
 * (localStorage). Quando a internet volta, a fila e "descarregada" (flush) na
 * ordem correta para o Supabase e, ao final, recarregamos o banco para que
 * todos os aparelhos convirjam para o mesmo estado.
 *
 * Idempotencia:
 *  - insert/update viram UPSERT (onConflict = id), entao reenviar nao duplica.
 *  - delete e por id.
 */

import type { POI } from '@/components/POIManager';
import {
  insertPoi,
  updatePoiById,
  deletePoiById,
  pingSupabase,
  upsertRemoteConflict,
} from './poiService';
import { SUPABASE_ENABLED } from './supabaseClient';
import { addConflict, conflictFromPendingOp } from './conflictStore';

const QUEUE_KEY = 'mapas-pois-pending-v1';

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

function newOpId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadQueue(): PendingOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(ops: PendingOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch (err) {
    // Quota estourada: tenta remover fotos das operacoes mais antigas para caber
    try {
      const slim = ops.map((op) =>
        op.poi && op.poi.photo
          ? { ...op, poi: { ...op.poi, photo: undefined } }
          : op
      );
      localStorage.setItem(QUEUE_KEY, JSON.stringify(slim));
      console.warn('[offlineQueue] Quota cheia — fotos pendentes removidas do cache local.');
    } catch {
      console.error('[offlineQueue] Falha ao salvar fila offline:', err);
    }
  }
}

export function pendingCount(): number {
  return loadQueue().length;
}

/** Enfileira uma operacao. Colapsa operacoes redundantes do mesmo POI. */
export function enqueue(op: Omit<PendingOp, 'opId' | 'ts'>): PendingOp[] {
  const queue = loadQueue();
  const targetId = op.poi?.id ?? op.id;

  if (op.type === 'insert' && targetId) {
    // Remove qualquer op anterior desse id (novo insert manda)
    const filtered = queue.filter((q) => (q.poi?.id ?? q.id) !== targetId);
    filtered.push({ ...op, opId: newOpId(), ts: Date.now() });
    saveQueue(filtered);
    return filtered;
  }

  if (op.type === 'update' && targetId) {
    // Se ja existe um insert pendente desse id, mescla o patch no insert
    const insertIdx = queue.findIndex(
      (q) => q.type === 'insert' && (q.poi?.id ?? q.id) === targetId
    );
    if (insertIdx >= 0 && queue[insertIdx].poi) {
      queue[insertIdx] = {
        ...queue[insertIdx],
        poi: { ...(queue[insertIdx].poi as POI), ...(op.updates || {}) } as POI,
      };
      saveQueue(queue);
      return queue;
    }
    // Colapsa updates consecutivos do mesmo id
    const updIdx = queue.findIndex(
      (q) => q.type === 'update' && (q.poi?.id ?? q.id) === targetId
    );
    if (updIdx >= 0) {
      queue[updIdx] = {
        ...queue[updIdx],
        poi: op.poi ?? queue[updIdx].poi,
        updates: { ...(queue[updIdx].updates || {}), ...(op.updates || {}) },
        basePoi: queue[updIdx].basePoi ?? op.basePoi,
        baseRevision: queue[updIdx].baseRevision ?? op.baseRevision,
        ts: Date.now(),
      };
      saveQueue(queue);
      return queue;
    }
    queue.push({ ...op, opId: newOpId(), ts: Date.now() });
    saveQueue(queue);
    return queue;
  }

  if (op.type === 'delete' && targetId) {
    // Nunca cancele o delete quando um insert pode estar em voo. Se o insert
    // já tiver sido enviado por outro ciclo, cancelar aqui faria o registro
    // nascer no banco e reaparecer no próximo fetch/realtime. Substituímos as
    // operações pendentes por `delete`; excluir uma linha inexistente é
    // idempotente e, se o insert terminar depois, o delete será processado na
    // sequência correta.
    const filtered = queue.filter((q) => (q.poi?.id ?? q.id) !== targetId);
    filtered.push({ ...op, type: 'delete', id: targetId, opId: newOpId(), ts: Date.now() });
    saveQueue(filtered);
    return filtered;
  }

  queue.push({ ...op, opId: newOpId(), ts: Date.now() });
  saveQueue(queue);
  return queue;
}

export interface FlushResult {
  ok: boolean;
  flushed: number;
  remaining: number;
  reason?: string;
}

let flushing = false;

/**
 * Descarrega a fila no Supabase, em ordem. Para no primeiro erro de rede
 * (mantendo o restante para a proxima tentativa).
 */
export async function flushQueue(): Promise<FlushResult> {
  if (!SUPABASE_ENABLED) return { ok: false, flushed: 0, remaining: pendingCount(), reason: 'supabase-disabled' };
  if (flushing) return { ok: false, flushed: 0, remaining: pendingCount(), reason: 'busy' };

  let queue = loadQueue();
  if (queue.length === 0) return { ok: true, flushed: 0, remaining: 0 };

  // Confirma que o banco esta acessivel (e a tabela existe) antes de tentar
  const ping = await pingSupabase();
  if (!ping.reachable) {
    return { ok: false, flushed: 0, remaining: queue.length, reason: ping.reason || 'unreachable' };
  }

  flushing = true;
  let flushed = 0;
  try {
    // Processa uma copia estavel; remove do storage a cada sucesso
    for (const op of [...queue]) {
      try {
        let result: { ok: boolean; error: string | null } = { ok: true, error: null };
        let writeConflict: { remotePoi?: POI; reason: string } | undefined;
        if (op.type === 'insert' && op.poi) {
          result = await insertPoi(op.poi);
        } else if (op.type === 'update') {
          if (op.id && op.updates) result = await updatePoiById(op.id, op.updates, op.baseRevision, op.basePoi);
          else if (op.poi) result = await updatePoiById(op.poi.id, op.poi, op.baseRevision, op.basePoi);
        } else if (op.type === 'delete' && op.id) {
          result = await deletePoiById(op.id, op.baseRevision, op.basePoi);
        }
        writeConflict = (result as any).conflict;
        if (!result.ok) {
          if (writeConflict) {
            const conflict = addConflict(conflictFromPendingOp(op, writeConflict.remotePoi, writeConflict.reason));
            // O cache local é a primeira garantia; o registro remoto permite
            // recuperar o conflito em outro aparelho.
            void upsertRemoteConflict(conflict).catch((error) => {
              console.warn('[offlineQueue] Conflito mantido localmente; falha ao publicar no banco:', error);
            });
            // Conflito resolvível não deve ser reenviado infinitamente.
            queue = loadQueue().filter((q) => q.opId !== op.opId);
            saveQueue(queue);
            return { ok: false, flushed, remaining: queue.length, reason: 'conflict' };
          }
          throw new Error(result.error || 'Operação rejeitada pelo banco');
        }
        // sucesso confirmado -> remove essa op da fila persistida
        queue = loadQueue().filter((q) => q.opId !== op.opId);
        saveQueue(queue);
        flushed++;
      } catch (err) {
        console.warn('[offlineQueue] Falha ao enviar op — mantendo na fila:', err);
        return { ok: false, flushed, remaining: loadQueue().length, reason: 'op-failed' };
      }
    }
    return { ok: true, flushed, remaining: loadQueue().length };
  } finally {
    flushing = false;
  }
}

/**
 * Mescla a lista remota (fonte da verdade) com as operacoes ainda pendentes,
 * para o usuario nunca "perder de vista" o que criou offline.
 */
export function mergeRemoteWithPending(remote: POI[]): POI[] {
  const queue = loadQueue();
  const map = new Map<string, POI>();
  remote.forEach((p) => map.set(p.id, p));

  // aplica pendentes por cima
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

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* noop */
  }
}
