/**
 * poiService — Camada de acesso ao Supabase para as ocorrencias (POIs).
 *
 * Todas as marcacoes (pegador de agua / represa, alertas de perigo, incendio,
 * marcacoes gerais, etc.) sao gravadas na tabela `pois` do Supabase e lidas
 * por todos em TEMPO REAL via realtime subscriptions.
 *
 * App interno: sem seguranca (RLS desativado). Veja SUPABASE_SETUP.md.
 */

import type { POI, TransportTrip } from '@/components/POIManager';
import type { POIConflict, ConflictResolution } from './conflictStore';
import { supabase, POIS_TABLE, SUPABASE_ENABLED } from './supabaseClient';

const RETRY_DELAYS_MS = [350, 900];
const DEVICE_ID_KEY = 'mapas-pois-device-id-v1';
export const POI_CONFLICTS_TABLE = 'poi_conflicts';

type SupabaseResult<T> = { data: T | null; error: any };

export interface PoiConflictPayload {
  remotePoi?: POI;
  reason: string;
}

export interface PoiWriteResult {
  ok: boolean;
  error: string | null;
  conflict?: PoiConflictPayload;
}

interface RemoteConflictRow {
  id: string;
  poi_id: string;
  kind: POIConflict['kind'];
  created_at: string;
  local_poi: POI | null;
  remote_poi: POI | null;
  base_poi: POI | null;
  local_updates: Partial<POI> | null;
  base_revision: number | null;
  remote_revision: number | null;
  operation_id: string | null;
  reason: string;
  resolved_at: string | null;
  resolution: ConflictResolution | null;
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return 'device-session';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: any): boolean {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  if (status === 408 || status === 409 || status === 429 || status >= 500) return true;
  return /network|fetch|timeout|timed out|aborted|abort|connection|temporar|gateway|unavailable/i.test(
    String(error?.message || error || '')
  );
}

/**
 * Executa uma operação do PostgREST com retry apenas para falhas transitórias.
 * Erros de esquema/permissão/validação retornam imediatamente e não são ocultados.
 */
async function withRetry<T>(operation: () => PromiseLike<SupabaseResult<T>>): Promise<SupabaseResult<T>> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error || !isRetryableError(result.error) || attempt === RETRY_DELAYS_MS.length) {
        return result;
      }
      lastError = result.error;
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length || !isRetryableError(error)) {
        return { data: null, error };
      }
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return { data: null, error: lastError || new Error('Falha ao comunicar com o Supabase') };
}

export interface RemotePoiRow {
  id: string;
  lat: number;
  lng: number;
  title: string | null;
  description: string | null;
  category: string | null;
  message: string | null;
  photo: string | null;
  fundo: string | null;
  talhao: string | null;
  implemento_agr: string | null;
  type: string | null;
  created_at: string | null;
  revision: number | null;
  updated_at: string | null;
  updated_by: string | null;
  transport_material: string | null;
  transport_formula?: string | null;
  transport_quantity: number | null;
  transport_unit: 'toneladas' | 'bigbags' | null;
  transport_trips: TransportTrip[] | null;
}

/**
 * Algumas instalações antigas ainda não receberam a migration de transport_formula.
 * Nessa situação, não podemos transformar uma gravação válida de Adubo em "offline".
 * O fallback codifica a fórmula no próprio transport_material, que já existe no schema;
 * a leitura decodifica o valor novamente para o modelo normal do aplicativo.
 */
function isMissingTransportFormulaColumn(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return (code === '42703' || code === 'PGRST204')
    && /transport_formula|column|schema cache/i.test(message);
}

function encodeLegacyTransportMaterial(material?: string | null, formula?: string | null): string | null {
  const normalizedMaterial = material || null;
  const normalizedFormula = formula?.trim();
  if (normalizedMaterial !== 'adubo' || !normalizedFormula) return normalizedMaterial;
  return `${normalizedMaterial}|formula=${encodeURIComponent(normalizedFormula)}`;
}

function decodeLegacyTransportMaterial(raw?: string | null): { material?: string; formula?: string } {
  const value = raw || '';
  const match = value.match(/^(.+?)\|formula=(.*)$/i);
  if (!match) return { material: value || undefined };
  let formula = match[2];
  try { formula = decodeURIComponent(formula); } catch { /* mantém o valor bruto */ }
  return { material: match[1] || undefined, formula: formula || undefined };
}

function mapPoiToLegacyRow(poi: POI): Record<string, unknown> {
  const row = mapPoiToRow(poi) as unknown as Record<string, unknown>;
  row.transport_material = poi.category === 'represa'
    ? (poi.waterAvailable === false ? WATER_UNAVAILABLE_SENTINEL : null)
    : encodeLegacyTransportMaterial(poi.transportMaterial, poi.transportFormula);
  delete row.transport_formula;
  return row;
}

// Sentinela gravada na coluna `transport_material` (não usada por represas) para
// indicar que a represa está baixa/sem água. Assim o estado sincroniza entre
// aparelhos via Supabase sem exigir uma nova coluna no banco.
const WATER_UNAVAILABLE_SENTINEL = 'water_unavailable';

function transportMaterialColumn(poi: POI): string | null {
  if (poi.category === 'represa') {
    return poi.waterAvailable === false ? WATER_UNAVAILABLE_SENTINEL : null;
  }
  return poi.transportMaterial ?? null;
}

export function mapRowToPoi(row: RemotePoiRow): POI {
  const category = row.category ?? 'marcacao';
  const isRepresa = category === 'represa';
  const legacyTransport = decodeLegacyTransportMaterial(row.transport_material);
  return {
    id: row.id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    title: row.title ?? '',
    description: row.description ?? '',
    category,
    message: row.message ?? undefined,
    photo: row.photo ?? undefined,
    fundo: row.fundo ?? undefined,
    talhao: row.talhao ?? undefined,
    implementoAgr: row.implemento_agr ?? undefined,
    type: (row.type as POI['type']) ?? 'custom',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    revision: Number(row.revision || 1),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
    updatedBy: row.updated_by ?? undefined,
    transportMaterial: isRepresa ? undefined : legacyTransport.material,
    transportFormula: isRepresa ? undefined : (row.transport_formula ?? legacyTransport.formula),
    transportQuantity: row.transport_quantity == null ? undefined : Number(row.transport_quantity),
    transportUnit: row.transport_unit ?? undefined,
    transportTrips: Array.isArray(row.transport_trips) ? row.transport_trips : undefined,
    waterAvailable: isRepresa ? row.transport_material !== WATER_UNAVAILABLE_SENTINEL : undefined,
  };
}

export function mapPoiToRow(poi: POI): RemotePoiRow {
  return {
    id: poi.id,
    lat: poi.lat,
    lng: poi.lng,
    title: poi.title ?? null,
    description: poi.description ?? null,
    category: poi.category ?? 'marcacao',
    message: poi.message ?? null,
    photo: (poi as any).photo ?? null,
    fundo: poi.fundo ?? null,
    talhao: poi.talhao ?? null,
    implemento_agr: poi.implementoAgr ?? null,
    type: poi.type ?? 'custom',
    created_at: new Date(poi.createdAt || Date.now()).toISOString(),
    revision: Number(poi.revision || 1),
    updated_at: new Date(poi.updatedAt || Date.now()).toISOString(),
    updated_by: poi.updatedBy || getDeviceId(),
    transport_material: transportMaterialColumn(poi),
    ...(poi.transportFormula && poi.category !== 'represa' ? { transport_formula: poi.transportFormula } : {}),
    transport_quantity: poi.transportQuantity ?? null,
    transport_unit: poi.transportUnit ?? null,
    transport_trips: poi.transportTrips ?? [],
  };
}

function mapRowToConflict(row: RemoteConflictRow): POIConflict {
  return {
    conflictId: row.id,
    poiId: row.poi_id,
    kind: row.kind,
    createdAt: new Date(row.created_at).getTime(),
    localPoi: row.local_poi ?? undefined,
    remotePoi: row.remote_poi ?? undefined,
    basePoi: row.base_poi ?? undefined,
    localUpdates: row.local_updates ?? undefined,
    baseRevision: row.base_revision ?? undefined,
    remoteRevision: row.remote_revision ?? undefined,
    operationId: row.operation_id ?? undefined,
    reason: row.reason,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
    resolution: row.resolution ?? undefined,
  };
}

export async function upsertRemoteConflict(conflict: POIConflict): Promise<{ ok: boolean; error: string | null }> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'Supabase nao configurado' };
  const payload = {
    id: conflict.conflictId,
    poi_id: conflict.poiId,
    kind: conflict.kind,
    created_at: new Date(conflict.createdAt).toISOString(),
    local_poi: conflict.localPoi ?? null,
    remote_poi: conflict.remotePoi ?? null,
    base_poi: conflict.basePoi ?? null,
    local_updates: conflict.localUpdates ?? null,
    base_revision: conflict.baseRevision ?? null,
    remote_revision: conflict.remoteRevision ?? null,
    operation_id: conflict.operationId ?? null,
    reason: conflict.reason,
    resolved_at: null,
    resolution: null,
  };
  const { error } = await withRetry<null>(() => supabase
    .from(POI_CONFLICTS_TABLE)
    .upsert(payload, { onConflict: 'id' }));
  return error
    ? { ok: false, error: error.message }
    : { ok: true, error: null };
}

export async function fetchOpenRemoteConflicts(): Promise<{ conflicts: POIConflict[]; error: string | null }> {
  if (!SUPABASE_ENABLED) return { conflicts: [], error: 'Supabase nao configurado' };
  const { data, error } = await withRetry<RemoteConflictRow[]>(() => supabase
    .from(POI_CONFLICTS_TABLE)
    .select('*')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(100));
  if (error) return { conflicts: [], error: error.message };
  return { conflicts: (data || []).map((row) => mapRowToConflict(row)), error: null };
}

export async function resolveRemoteConflict(conflictId: string, resolution: ConflictResolution): Promise<{ ok: boolean; error: string | null }> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'Supabase nao configurado' };
  const { error } = await withRetry<null>(() => supabase
    .from(POI_CONFLICTS_TABLE)
    .update({ resolved_at: new Date().toISOString(), resolution })
    .eq('id', conflictId)
    .is('resolved_at', null));
  return error
    ? { ok: false, error: error.message }
    : { ok: true, error: null };
}

/**
 * pingSupabase — Verifica rapidamente se o banco esta acessivel e se a tabela
 * `pois` existe. Usado pela fila offline para decidir se pode sincronizar.
 * - reachable=false  => sem internet OU tabela ainda nao criada (nao da pra sincronizar)
 * - tableExists=false => internet ok, mas falta rodar o SQL de setup
 */
export async function pingSupabase(): Promise<{ reachable: boolean; tableExists: boolean; reason?: string }> {
  if (!SUPABASE_ENABLED) return { reachable: false, tableExists: false, reason: 'disabled' };
  try {
    const { error } = await withRetry<unknown[]>(() => supabase
      .from(POIS_TABLE)
      .select('id', { head: true, count: 'exact' })
      .limit(1));
    if (!error) return { reachable: true, tableExists: true };
    // PGRST205 = tabela nao existe; ainda ha internet, mas falta o setup
    const code = (error as any).code || '';
    if (code === 'PGRST205' || /schema cache|does not exist/i.test(error.message)) {
      return { reachable: false, tableExists: false, reason: 'table-missing' };
    }
    return { reachable: false, tableExists: false, reason: error.message };
  } catch (err: any) {
    return { reachable: false, tableExists: false, reason: err?.message || 'network' };
  }
}

/** Busca todas as ocorrencias gravadas no banco. */
export async function fetchAllPois(): Promise<{ pois: POI[]; error: string | null }> {
  if (!SUPABASE_ENABLED) return { pois: [], error: 'Supabase nao configurado' };
  const { data, error } = await withRetry<RemotePoiRow[]>(() => supabase
    .from(POIS_TABLE)
    .select('*')
    .order('created_at', { ascending: true }));

  if (error) {
    console.warn('[poiService] fetchAllPois erro:', error.message);
    return { pois: [], error: error.message };
  }
  return { pois: (data || []).map((r) => mapRowToPoi(r as RemotePoiRow)), error: null };
}

export async function fetchPoiById(id: string): Promise<{ poi?: POI; error: string | null }> {
  if (!SUPABASE_ENABLED) return { error: 'Supabase nao configurado' };
  const { data, error } = await withRetry<RemotePoiRow[]>(() => supabase
    .from(POIS_TABLE)
    .select('*')
    .eq('id', id)
    .limit(1));
  if (error) return { error: error.message };
  return { poi: data?.[0] ? mapRowToPoi(data[0]) : undefined, error: null };
}

/** Insere sem upsert: um id já existente vira conflito, nunca sobrescrita silenciosa. */
export async function insertPoi(poi: POI): Promise<PoiWriteResult> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'Supabase nao configurado' };
  let result = await withRetry<RemotePoiRow[]>(() => supabase
    .from(POIS_TABLE)
    .insert(mapPoiToRow(poi))
    .select('*'));
  // Compatibilidade com instalações que ainda não executaram a migration:
  // grava o Adubo online usando o campo textual já existente, sem enfileirar como offline.
  if (result.error && isMissingTransportFormulaColumn(result.error)) {
    result = await withRetry<RemotePoiRow[]>(() => supabase
      .from(POIS_TABLE)
      .insert(mapPoiToLegacyRow(poi))
      .select('*'));
  }
  const { data, error } = result;
  if (error) {
    const remote = await fetchPoiById(poi.id);
    if (remote.poi) {
      return {
        ok: false,
        error: 'ID já existe no banco; a nova versão foi preservada neste aparelho.',
        conflict: { remotePoi: remote.poi, reason: 'Inserção com um ID já existente.' },
      };
    }
    console.warn('[poiService] insertPoi erro:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: Boolean(data), error: null };
}

/** Insere um lote sem sobrescrever IDs existentes; conflitos param o lote. */
export async function upsertPois(pois: POI[]): Promise<{ ok: boolean; error: string | null }> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'Supabase nao configurado' };
  for (const poi of pois) {
    const result = await insertPoi(poi);
    if (!result.ok) return { ok: false, error: result.error || 'Conflito no lote' };
  }
  return { ok: true, error: null };
}

/** Remove uma ocorrencia do banco. */
export async function deletePoiById(id: string, baseRevision?: number, localPoi?: POI): Promise<PoiWriteResult> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'Supabase nao configurado' };
  const remoteBefore = await fetchPoiById(id);
  if (remoteBefore.error) return { ok: false, error: remoteBefore.error };
  if (!remoteBefore.poi) return { ok: true, error: null };
  const expectedRevision = baseRevision ?? localPoi?.revision;
  if (expectedRevision === undefined || remoteBefore.poi.revision !== expectedRevision) {
    return {
      ok: false,
      error: 'A marcação foi alterada em outro aparelho; ela não foi excluída.',
      conflict: {
        remotePoi: remoteBefore.poi,
        reason: 'A revisão remota mudou antes da exclusão.',
      },
    };
  }
  const { data, error } = await withRetry<Array<{ id: string }>>(() => supabase
    .from(POIS_TABLE)
    .delete()
    .eq('id', id)
    .eq('revision', expectedRevision)
    .select('id'));
  if (error) {
    console.warn('[poiService] deletePoiById erro:', error.message);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    const latest = await fetchPoiById(id);
    return {
      ok: false,
      error: 'A exclusão concorrente foi detectada; nenhuma versão foi perdida.',
      conflict: { remotePoi: latest.poi, reason: 'A revisão mudou durante a exclusão.' },
    };
  }
  return { ok: true, error: null };
}

/** Atualiza campos de uma ocorrencia existente. */
export async function updatePoiById(
  id: string,
  updates: Partial<POI>,
  baseRevision?: number,
  localPoi?: POI,
): Promise<PoiWriteResult> {
  if (!SUPABASE_ENABLED) return { ok: false, error: 'Supabase nao configurado' };
  const patch: Partial<RemotePoiRow> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.message !== undefined) patch.message = updates.message ?? null;
  if ((updates as any).photo !== undefined) patch.photo = (updates as any).photo ?? null;
  if (updates.fundo !== undefined) patch.fundo = updates.fundo ?? null;
  if (updates.talhao !== undefined) patch.talhao = updates.talhao ?? null;
  if (updates.implementoAgr !== undefined) patch.implemento_agr = updates.implementoAgr ?? null;
  if (updates.transportMaterial !== undefined) patch.transport_material = updates.transportMaterial ?? null;
  if ((updates as any).waterAvailable !== undefined) {
    // Represa: grava/limpa a sentinela de "represa baixa" na coluna reutilizada.
    patch.transport_material = (updates as any).waterAvailable === false ? WATER_UNAVAILABLE_SENTINEL : null;
  }
  if (updates.transportFormula !== undefined) patch.transport_formula = updates.transportFormula || null;
  if (updates.transportQuantity !== undefined) patch.transport_quantity = updates.transportQuantity ?? null;
  if (updates.transportUnit !== undefined) patch.transport_unit = updates.transportUnit ?? null;
  if (updates.transportTrips !== undefined) patch.transport_trips = updates.transportTrips ?? [];

  if (Object.keys(patch).length === 0) return { ok: true, error: null };

  const remoteBefore = await fetchPoiById(id);
  if (remoteBefore.error) return { ok: false, error: remoteBefore.error };
  if (!remoteBefore.poi) return { ok: false, error: 'A marcação não existe mais no banco.' };
  const expectedRevision = baseRevision ?? localPoi?.revision;
  if (expectedRevision === undefined || remoteBefore.poi.revision !== expectedRevision) {
    return {
      ok: false,
      error: 'A marcação foi alterada em outro aparelho; nenhuma versão foi sobrescrita.',
      conflict: {
        remotePoi: remoteBefore.poi,
        reason: 'A revisão remota mudou antes da atualização.',
      },
    };
  }

  const nextRevision = remoteBefore.poi.revision + 1;
  const nextPatch = { ...patch, revision: nextRevision, updated_at: new Date().toISOString(), updated_by: getDeviceId() };
  let writeResult = await withRetry<RemotePoiRow[]>(() => supabase
    .from(POIS_TABLE)
    .update(nextPatch)
    .eq('id', id)
    .eq('revision', expectedRevision)
    .select('*'));
  // Mesmo fallback para edições posteriores: a fórmula permanece sincronizável
  // entre aparelhos antigos por meio do transport_material legado.
  if (writeResult.error && isMissingTransportFormulaColumn(writeResult.error)) {
    const legacyPatch: Record<string, unknown> = { ...nextPatch };
    delete legacyPatch.transport_formula;
    if (updates.transportFormula !== undefined || updates.transportMaterial !== undefined) {
      const legacyMaterial = updates.transportMaterial !== undefined
        ? updates.transportMaterial
        : remoteBefore.poi.transportMaterial;
      const legacyFormula = updates.transportFormula !== undefined
        ? updates.transportFormula
        : remoteBefore.poi.transportFormula;
      legacyPatch.transport_material = encodeLegacyTransportMaterial(legacyMaterial, legacyFormula);
    }
    writeResult = await withRetry<RemotePoiRow[]>(() => supabase
      .from(POIS_TABLE)
      .update(legacyPatch)
      .eq('id', id)
      .eq('revision', expectedRevision)
      .select('*'));
  }
  const { data, error } = writeResult;
  if (error) {
    console.warn('[poiService] updatePoiById erro:', error.message);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    const latest = await fetchPoiById(id);
    return {
      ok: false,
      error: 'A atualização concorrente foi detectada; a versão local foi preservada.',
      conflict: {
        remotePoi: latest.poi,
        reason: 'A revisão mudou durante a gravação.',
      },
    };
  }
  return { ok: true, error: null };
}

export interface PoiSubscriptionHandlers {
  onInsert?: (poi: POI) => void;
  onUpdate?: (poi: POI) => void;
  onDelete?: (id: string) => void;
  onStatus?: (status: string, error?: unknown) => void;
}

export interface PoiConflictSubscriptionHandlers {
  onUpsert?: (conflict: POIConflict) => void;
  onResolved?: (conflictId: string) => void;
  onDelete?: (conflictId: string) => void;
}

export function subscribeToConflictChanges(handlers: PoiConflictSubscriptionHandlers): () => void {
  if (!SUPABASE_ENABLED) return () => {};
  const channel = supabase
    .channel(`poi-conflicts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: POI_CONFLICTS_TABLE }, (payload) => {
      handlers.onUpsert?.(mapRowToConflict(payload.new as RemoteConflictRow));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: POI_CONFLICTS_TABLE }, (payload) => {
      const row = payload.new as RemoteConflictRow;
      if (row.resolved_at) handlers.onResolved?.(row.id);
      else handlers.onUpsert?.(mapRowToConflict(row));
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: POI_CONFLICTS_TABLE }, (payload) => {
      const row = payload.old as Partial<RemoteConflictRow>;
      if (row?.id) handlers.onDelete?.(row.id);
    })
    .subscribe();
  return () => {
    try { void supabase.removeChannel(channel); } catch { /* noop */ }
  };
}

/**
 * Assina mudancas em tempo real na tabela de ocorrencias.
 * A assinatura e recriada com backoff quando a rede cai, enquanto o fallback
 * periodico do POIManager garante convergencia mesmo se algum evento for perdido.
 */
/**
 * Assinatura realtime de POIs.
 *
 * Retorna um "handle" — uma função que quando chamada como `handle()` cancela
 * a assinatura, e também tem um método `reconnect()` para forçar reconexão
 * imediata (usado ao voltar internet, sem esperar o backoff exponencial).
 */
export function subscribeToPois(handlers: PoiSubscriptionHandlers): (() => void) & { reconnect: () => void } {
  const noop = Object.assign(() => {}, { reconnect: () => {} });
  if (!SUPABASE_ENABLED) return noop;

  let channel: any = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let reconnectAttempt = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(30_000, 1_500 * (2 ** Math.min(reconnectAttempt, 4)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;
    channel = supabase
      .channel(`pois-realtime-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: POIS_TABLE },
        (payload) => handlers.onInsert?.(mapRowToPoi(payload.new as RemotePoiRow))
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: POIS_TABLE },
        (payload) => handlers.onUpdate?.(mapRowToPoi(payload.new as RemotePoiRow))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: POIS_TABLE },
        (payload) => {
          const oldRow = payload.old as Partial<RemotePoiRow>;
          if (oldRow?.id) handlers.onDelete?.(oldRow.id);
        }
      )
      .subscribe((status: string, error?: unknown) => {
        handlers.onStatus?.(status, error);
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const failedChannel = channel;
          channel = null;
          if (failedChannel) void supabase.removeChannel(failedChannel);
          scheduleReconnect();
        }
      });
  };

  const forceReconnect = () => {
    if (stopped) return;
    // Cancela timer pendente e derruba o canal atual para reconectar já.
    clearReconnectTimer();
    reconnectAttempt = 0;
    const oldChannel = channel;
    channel = null;
    if (oldChannel) {
      try { void supabase.removeChannel(oldChannel); } catch { /* noop */ }
    }
    connect();
  };

  connect();

  const unsubscribe = () => {
    stopped = true;
    clearReconnectTimer();
    if (channel) {
      try {
        void supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
      channel = null;
    }
  };

  return Object.assign(unsubscribe, { reconnect: forceReconnect });
}
