import type { POI } from '@/components/POIManager';
import type { PendingOp } from './offlineQueue';

const CONFLICTS_KEY = 'mapas-pois-conflicts-v1';
const CONFLICT_HISTORY_KEY = 'mapas-pois-conflict-history-v1';

export type ConflictKind = 'insert' | 'update' | 'delete';

export interface POIConflict {
  conflictId: string;
  poiId: string;
  kind: ConflictKind;
  createdAt: number;
  localPoi?: POI;
  remotePoi?: POI;
  basePoi?: POI;
  localUpdates?: Partial<POI>;
  baseRevision?: number;
  remoteRevision?: number;
  operationId?: string;
  reason: string;
  resolvedAt?: number;
  resolution?: ConflictResolution;
}

export type ConflictResolution = 'keep-local' | 'keep-remote' | 'merge';

function createConflictId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fallback abaixo */ }
  return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeConflict(value: unknown): POIConflict | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<POIConflict>;
  if (!candidate.poiId || !candidate.kind || !candidate.createdAt) return null;
  return {
    conflictId: candidate.conflictId || createConflictId(),
    poiId: candidate.poiId,
    kind: candidate.kind,
    createdAt: candidate.createdAt,
    localPoi: candidate.localPoi,
    remotePoi: candidate.remotePoi,
    basePoi: candidate.basePoi,
    localUpdates: candidate.localUpdates,
    baseRevision: candidate.baseRevision,
    remoteRevision: candidate.remoteRevision,
    operationId: candidate.operationId,
    reason: candidate.reason || 'A marcação foi alterada em outro aparelho.',
    resolvedAt: candidate.resolvedAt,
    resolution: candidate.resolution,
  };
}

export function loadConflicts(): POIConflict[] {
  try {
    const raw = localStorage.getItem(CONFLICTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeConflict).filter((item): item is POIConflict => Boolean(item));
  } catch {
    return [];
  }
}

function saveConflicts(conflicts: POIConflict[]): void {
  try {
    localStorage.setItem(CONFLICTS_KEY, JSON.stringify(conflicts));
  } catch {
    // Se a cota estiver cheia, mantemos o conflito na memória desta sessão.
  }
}

export function upsertConflict(conflict: POIConflict): POIConflict[] {
  const conflicts = loadConflicts();
  const index = conflicts.findIndex((item) => item.conflictId === conflict.conflictId);
  if (index >= 0) conflicts[index] = { ...conflicts[index], ...conflict };
  else conflicts.unshift(conflict);
  saveConflicts(conflicts.slice(0, 100));
  return conflicts;
}

export function addConflict(input: Omit<POIConflict, 'conflictId' | 'createdAt'>): POIConflict {
  const conflict: POIConflict = {
    ...input,
    conflictId: createConflictId(),
    createdAt: Date.now(),
  };
  const conflicts = loadConflicts();
  // O mesmo op pode gerar mais de um retry; mantém apenas uma cópia do conflito.
  const withoutDuplicate = conflicts.filter((item) => item.operationId !== conflict.operationId || !conflict.operationId);
  withoutDuplicate.unshift(conflict);
  saveConflicts(withoutDuplicate.slice(0, 100));
  return conflict;
}

export function removeConflict(conflictId: string): POIConflict[] {
  const next = loadConflicts().filter((item) => item.conflictId !== conflictId);
  saveConflicts(next);
  return next;
}

export function replaceConflict(conflict: POIConflict): POIConflict[] {
  const next = loadConflicts().map((item) => item.conflictId === conflict.conflictId ? conflict : item);
  saveConflicts(next);
  return next;
}

export function archiveConflict(conflict: POIConflict, resolution: ConflictResolution): void {
  try {
    const raw = localStorage.getItem(CONFLICT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(parsed) ? parsed : [];
    history.unshift({ ...conflict, resolvedAt: Date.now(), resolution });
    localStorage.setItem(CONFLICT_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  } catch {
    // A resolução continua válida mesmo se o navegador estiver sem cota.
  }
}

export function loadConflictHistory(): POIConflict[] {
  try {
    const raw = localStorage.getItem(CONFLICT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeConflict).filter((item): item is POIConflict => Boolean(item)) : [];
  } catch {
    return [];
  }
}

export function conflictFromPendingOp(
  op: PendingOp,
  remotePoi: POI | undefined,
  reason: string,
): POIConflict {
  return {
    conflictId: createConflictId(),
    poiId: op.poi?.id || op.id || 'desconhecido',
    kind: op.type,
    createdAt: Date.now(),
    localPoi: op.poi,
    remotePoi,
    basePoi: op.basePoi,
    localUpdates: op.updates,
    baseRevision: op.baseRevision,
    remoteRevision: remotePoi?.revision,
    operationId: op.opId,
    reason,
  };
}

function mergeTransportTrips(localTrips: POI['transportTrips'], remoteTrips: POI['transportTrips']): POI['transportTrips'] {
  const merged = new Map<string, NonNullable<POI['transportTrips']>[number]>();
  [...(remoteTrips || []), ...(localTrips || [])].forEach((trip) => {
    if (!trip || !trip.id || !Number.isFinite(Number(trip.weight)) || Number(trip.weight) <= 0) return;
    // A versão local vence somente quando o mesmo ID já existe; IDs diferentes
    // representam tickets/viagens distintos e nunca devem ser descartados.
    merged.set(trip.id, trip);
  });
  return Array.from(merged.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export function mergeConflictVersions(conflict: POIConflict): POI | undefined {
  const local = conflict.localPoi;
  const remote = conflict.remotePoi;
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;

  const base = conflict.basePoi;
  const fields: Array<keyof POI> = [
    'lat', 'lng', 'title', 'description', 'category', 'message', 'photo',
    'fundo', 'talhao', 'implementoAgr', 'type', 'transportMaterial',
    'transportQuantity', 'transportFormula', 'transportUnit',
  ];
  const merged = { ...remote } as POI;
  merged.transportTrips = mergeTransportTrips(local.transportTrips, remote.transportTrips);

  fields.forEach((field) => {
    const localValue = local[field];
    const remoteValue = remote[field];
    const baseValue = base?.[field];
    if (base && localValue === baseValue) return;
    if (!base || remoteValue === baseValue || localValue === remoteValue) {
      (merged as any)[field] = localValue;
    }
    // Se os dois aparelhos alteraram o mesmo campo, o remoto continua como
    // valor ativo e a versão local segue preservada no conflito armazenado.
  });
  return merged;
}
