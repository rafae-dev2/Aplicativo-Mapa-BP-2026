/**
 * POIManager — Gerenciador de Ocorrencias com Glass Liquid + Supabase (tempo real)
 *
 * Novidades:
 *  - Categorias: "Pegador de Agua (Represa)" 🌊 e "Perigo" ⚠️
 *  - Upload de FOTO com compressao automatica (economiza espaco no banco)
 *  - Sincronizacao em TEMPO REAL via Supabase: todos veem as marcacoes ao vivo
 *  - App interno (sem seguranca / RLS desativado)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, MapPin, Plus, Search, X, ChevronDown, ChevronUp, Navigation, Camera, Image as ImageIcon, Loader2, Wifi, WifiOff, AlertTriangle, RotateCcw, Bell, BellOff, Check } from 'lucide-react';
import { SUPABASE_ENABLED } from '@/lib/supabaseClient';
import {
  fetchAllPois,
  fetchOpenRemoteConflicts,
  getDeviceId,
  resolveRemoteConflict,
  subscribeToConflictChanges,
  subscribeToPois,
} from '@/lib/poiService';
import {
  enqueue as enqueueOp,
  flushQueue,
  pendingCount as getPendingCount,
  mergeRemoteWithPending,
} from '@/lib/offlineQueue';
import { compressImage, estimateDataUrlBytes, formatBytes } from '@/lib/imageCompression';
import { archiveConflict, loadConflicts, mergeConflictVersions, removeConflict, upsertConflict } from '@/lib/conflictStore';
import { enableCriticalNotifications, getNotificationPermission, isCriticalCategory, notifyCriticalPoi, type NotificationPermissionState } from '@/lib/notifications';
import type { POIConflict, ConflictResolution } from '@/lib/conflictStore';
import { PoiCategoryIcon } from './PoiMarkerIcon';
import { formatTonsInput, parseTons } from '@/lib/transportFormat';

export interface POI {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
  category: string;
  createdAt: number;
  /** Revisão monotônica usada para controle otimista de concorrência. */
  revision?: number;
  updatedAt?: number;
  updatedBy?: string;
  fundo?: string;
  talhao?: string;
  type: 'default' | 'custom';
  message?: string;
  text?: string;
  implementoAgr?: string;
  photo?: string; // foto comprimida (data URL base64)
  /** Dados operacionais de transporte; opcionais para manter compatibilidade com POIs antigos. */
  transportMaterial?: string;
  /** Quantidade total planejada para este ponto, na unidade escolhida. */
  transportQuantity?: number;
  /** Fórmula opcional do fertilizante, por exemplo 18-04-18. */
  transportFormula?: string;
  transportUnit?: TransportUnit;
  /** Viagens individuais, identificadas por ID para mesclagem entre aparelhos. */
  transportTrips?: TransportTrip[];
  /** Pegador de água (represa): indica se há água disponível para pegar.
   *  false = represa baixa (mostra o caminhão com X no mapa). Padrão: true. */
  waterAvailable?: boolean;
}

export interface TransportTrip {
  id: string;
  ticket?: string;
  fleet?: string;
  weight: number;
  unit: TransportUnit;
  createdAt: number;
  notes?: string;
}

type SyncMode = 'online' | 'offline' | 'syncing';

interface POIManagerContextType {
  pois: POI[];
  setPois: (pois: POI[]) => void;
  addPOI: (poi: Omit<POI, 'id' | 'createdAt'>) => POI;
  deletePOI: (id: string) => void;
  updatePOI: (id: string, poi: Partial<POI>) => void;
  importSharedPois: (pois: POI[]) => void;
  syncMode: SyncMode;
  pendingCount: number;
  forceSync: () => void;
  conflicts: POIConflict[];
  resolveConflict: (conflictId: string, resolution: ConflictResolution) => void;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  selectedCoords: { lat: number; lng: number } | null;
  setSelectedCoords: (coords: { lat: number; lng: number } | null) => void;
  selectedFundo?: string;
  setSelectedFundo: (fundo: string | undefined) => void;
  selectedTalhao?: string;
  setSelectedTalhao: (talhao: string | undefined) => void;
  popupData: any;
  setPopupData: (data: any) => void;
  onLocateCoordinates?: (lat: number, lng: number) => void;
  setOnLocateCoordinates?: (callback: (lat: number, lng: number) => void) => void;
}

export const POIManagerContext = React.createContext<POIManagerContextType | undefined>(undefined);

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
  } catch { /* noop */ }
  return `poi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const TOMBSTONE_STORAGE_KEY = 'mapas-pois-deleted-v1';
const RECENT_MUTATION_STORAGE_KEY = 'mapas-pois-recent-mutations-v1';
const TOMBSTONE_TTL_MS = 5 * 60 * 1000;
const RECENT_MUTATION_TTL_MS = 2 * 60 * 1000;

type LocalMutation = { kind: 'upsert' | 'delete'; at: number; poi?: POI };

function loadPersistedTombstones(): Map<string, number> {
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Array<[string, number]>;
    const now = Date.now();
    return new Map(parsed.filter(([, timestamp]) => now - timestamp <= TOMBSTONE_TTL_MS));
  } catch {
    return new Map();
  }
}

function persistTombstones(tombstones: Map<string, number>): void {
  try {
    localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(Array.from(tombstones.entries())));
  } catch {
    /* quota indisponível: a proteção em memória continua ativa */
  }
}

function loadRecentMutations(): Map<string, LocalMutation> {
  try {
    const raw = localStorage.getItem(RECENT_MUTATION_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Array<[string, LocalMutation]>;
    const now = Date.now();
    return new Map(parsed.filter(([, mutation]) => now - mutation.at <= RECENT_MUTATION_TTL_MS));
  } catch {
    return new Map();
  }
}

function persistRecentMutations(mutations: Map<string, LocalMutation>): void {
  try {
    localStorage.setItem(RECENT_MUTATION_STORAGE_KEY, JSON.stringify(Array.from(mutations.entries())));
  } catch {
    /* quota indisponível: a proteção em memória continua ativa */
  }
}

export function POIManagerProvider({ children }: { children: React.ReactNode }) {
  const [pois, setPoisState] = useState<POI[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedFundo, setSelectedFundo] = useState<string | undefined>(undefined);
  const [selectedTalhao, setSelectedTalhao] = useState<string | undefined>(undefined);
  const [popupData, setPopupData] = useState<any>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>(SUPABASE_ENABLED ? 'syncing' : 'offline');
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingCount());
  const [conflicts, setConflicts] = useState<POIConflict[]>(() => loadConflicts());
  const [onLocateCoordinates, setOnLocateCoordinates] = useState<((lat: number, lng: number) => void) | undefined>(undefined);
  const popupRef = useRef<any>(null);
  popupRef.current = popupData;
  const poisRef = useRef<POI[]>(pois);
  poisRef.current = pois;
  const conflictsRef = useRef<POIConflict[]>(conflicts);
  conflictsRef.current = conflicts;

  // Controle de concorrência da sincronização.
  // Evita que duas chamadas de syncNow rodem ao mesmo tempo (o que causava
  // "fantasmas": um fetch antigo reintroduzia um POI recém-excluído). Se uma
  // sync já está rodando, marcamos para rodar mais uma vez ao final (coalesce).
  const syncingRef = useRef(false);
  const resyncQueuedRef = useRef(false);

  // Tombstones (lápides) de exclusão: guarda os ids recém-excluídos por um curto
  // período. Serve para ignorar eventos de realtime atrasados (INSERT/UPDATE que
  // chegam DEPOIS do delete) e atrasos de replicação no fetch, que faziam a
  // marcação "voltar" logo após ser excluída.
  const deletedIdsRef = useRef<Map<string, number>>(loadPersistedTombstones());
  const isTombstoned = useCallback((id: string) => {
    const ts = deletedIdsRef.current.get(id);
    if (ts === undefined) return false;
    if (Date.now() - ts > TOMBSTONE_TTL_MS) {
      deletedIdsRef.current.delete(id);
      persistTombstones(deletedIdsRef.current);
      return false;
    }
    return true;
  }, []);
  const filterTombstoned = useCallback((list: POI[]) => {
    // Poda entradas antigas para não crescer indefinidamente
    const now = Date.now();
    deletedIdsRef.current.forEach((ts, id) => {
      if (now - ts > TOMBSTONE_TTL_MS) deletedIdsRef.current.delete(id);
    });
    persistTombstones(deletedIdsRef.current);
    if (deletedIdsRef.current.size === 0) return list;
    return list.filter((p) => !deletedIdsRef.current.has(p.id));
  }, []);

  // Protege uma janela curta após cada mutação local. O upsert do PostgREST
  // pode confirmar antes de o SELECT/realtime refletir a mesma linha; sem essa
  // janela, o fetch imediatamente seguinte apagava uma marcação nova. Para
  // exclusões, a proteção impede que a réplica atrasada a faça reaparecer.
  const recentMutationsRef = useRef<Map<string, LocalMutation>>(loadRecentMutations());

  const pruneRecentMutations = () => {
    const now = Date.now();
    recentMutationsRef.current.forEach((mutation, id) => {
      if (now - mutation.at > RECENT_MUTATION_TTL_MS) recentMutationsRef.current.delete(id);
    });
    persistRecentMutations(recentMutationsRef.current);
  };

  const hasRecentLocalMutation = useCallback((id: string) => {
    const mutation = recentMutationsRef.current.get(id);
    if (!mutation) return false;
    if (Date.now() - mutation.at > RECENT_MUTATION_TTL_MS) {
      recentMutationsRef.current.delete(id);
      persistRecentMutations(recentMutationsRef.current);
      return false;
    }
    return true;
  }, []);

  const reconcileRemoteSnapshot = useCallback((remote: POI[]) => {
    pruneRecentMutations();
    const map = new Map(remote.map((poi) => [poi.id, poi]));
    recentMutationsRef.current.forEach((mutation, id) => {
      if (mutation.kind === 'delete') map.delete(id);
      else if (mutation.poi) map.set(id, mutation.poi);
    });
    const merged = mergeRemoteWithPending(Array.from(map.values()));
    const conflictMap = new Map(merged.map((poi) => [poi.id, poi]));
    loadConflicts().forEach((conflict) => {
      if (conflict.kind === 'delete') {
        if (conflict.localPoi) conflictMap.set(conflict.poiId, conflict.localPoi);
        else conflictMap.delete(conflict.poiId);
      } else if (conflict.localPoi) {
        conflictMap.set(conflict.poiId, conflict.localPoi);
      }
    });
    return filterTombstoned(Array.from(conflictMap.values()));
  }, [filterTombstoned]);

  // Aplica eventos realtime sem sobrescrever uma operação local que ainda está
  // na fila. Isso evita que um snapshot antigo de outro aparelho faça uma
  // edição/criação otimista "sumir" antes do próximo flush.
  const applyRealtimePoi = useCallback((poi: POI) => {
    if (isTombstoned(poi.id) || hasRecentLocalMutation(poi.id)) return;
    if (conflictsRef.current.some((conflict) => conflict.poiId === poi.id)) return;
    setPoisState((prev) => {
      const next = prev.some((p) => p.id === poi.id)
        ? prev.map((p) => (p.id === poi.id ? { ...p, ...poi } : p))
        : [...prev, poi];
      return filterTombstoned(mergeRemoteWithPending(next));
    });
  }, [filterTombstoned, hasRecentLocalMutation, isTombstoned]);

  // Cache local (offline) — carrega imediatamente para uso sem internet
  useEffect(() => {
    const saved = localStorage.getItem('mapas-pois');
    if (saved) {
      try { setPoisState(mergeRemoteWithPending(JSON.parse(saved))); }
      catch (e) { console.error('Erro ao carregar POIs locais:', e); }
    }
  }, []);

  // Persistir cache local (fonte offline)
  useEffect(() => {
    try { localStorage.setItem('mapas-pois', JSON.stringify(pois)); } catch { /* quota */ }
  }, [pois]);

  // Sincroniza: (1) envia a fila offline, (2) recarrega do banco (fonte da verdade),
  // (3) mescla com pendencias que ainda nao subiram. Chamado no load, ao reconectar,
  // apos cada mutacao e periodicamente enquanto houver pendencias.
  const syncNow = useCallback(async () => {
    if (!SUPABASE_ENABLED) { setSyncMode('offline'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncMode('offline');
      setPendingCount(getPendingCount());
      return;
    }
    // Se já existe uma sincronização em andamento, apenas agenda uma nova
    // rodada ao final (coalesce). Isso serializa as chamadas e elimina a
    // condição de corrida em que um snapshot antigo do banco sobrescrevia
    // uma exclusão/adição mais recente feita localmente.
    if (syncingRef.current) { resyncQueuedRef.current = true; return; }
    syncingRef.current = true;
    setSyncMode('syncing');
    try {
      do {
        resyncQueuedRef.current = false;
        const flushResult = await flushQueue();
        setConflicts(loadConflicts());
        const flushSucceeded = flushResult.ok || flushResult.reason === 'busy' || flushResult.reason === 'conflict';
        if (!flushResult.ok && flushResult.reason !== 'busy') {
          // A fila permanece intacta para nova tentativa, mas não deixamos a
          // UI fingir que está sincronizando sem parar quando há erro real.
          console.warn('[POIManager] Fila mantida para nova tentativa:', flushResult.reason);
          setSyncMode('offline');
        }
        const { pois: remote, error } = await fetchAllPois();
        const remoteConflicts = await fetchOpenRemoteConflicts();
        if (!remoteConflicts.error) {
          remoteConflicts.conflicts.forEach((conflict) => upsertConflict(conflict));
          setConflicts(loadConflicts());
        }
        const remaining = getPendingCount();
        setPendingCount(remaining);
        if (error) {
          setSyncMode('offline'); // sem internet OU tabela ainda nao criada
        } else {
          // mergeRemoteWithPending aplica as operações pendentes (inclusive
          // exclusões) por cima do estado remoto, então um item excluído que
          // ainda não subiu nunca "volta". O filterTombstoned protege contra
          // atraso de replicação (o banco ainda devolver um item já excluído).
          setPoisState(reconcileRemoteSnapshot(remote));
          setSyncMode(!flushSucceeded ? 'offline' : remaining > 0 ? 'syncing' : 'online');
        }
      } while (resyncQueuedRef.current);
    } finally {
      syncingRef.current = false;
    }
  }, [reconcileRemoteSnapshot]);

  // Conflitos também são compartilhados em tempo real. Se outro aparelho
  // resolver o incidente, este painel desaparece sem apagar o histórico local.
  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    const unsub = subscribeToConflictChanges({
      onUpsert: (conflict) => setConflicts(upsertConflict(conflict)),
      onResolved: (conflictId) => setConflicts(removeConflict(conflictId)),
      onDelete: (conflictId) => setConflicts(removeConflict(conflictId)),
    });
    return () => unsub();
  }, []);

  // Realtime: todos veem as marcacoes ao vivo (insert/update/delete)
  const realtimeReconnectRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    const unsub = subscribeToPois({
      onInsert: applyRealtimePoi,
      onUpdate: applyRealtimePoi,
      onStatus: (status, error) => {
        if (status === 'SUBSCRIBED') {
          setSyncMode(getPendingCount() > 0 ? 'syncing' : 'online');
          void syncNow();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[POIManager] Realtime indisponível; usando reconciliação automática:', error);
          setSyncMode('offline');
        }
      },
      onDelete: (id) => {
        if (conflictsRef.current.some((conflict) => conflict.poiId === id && conflict.localPoi)) return;
        // Marca como excluído para evitar que um evento/fetch atrasado o traga de volta
        deletedIdsRef.current.set(id, Date.now());
        persistTombstones(deletedIdsRef.current);
        setPoisState((prev) => prev.filter((p) => p.id !== id));
        if (popupRef.current && popupRef.current.poiId === id) setPopupData(null);
      },
    });
    realtimeReconnectRef.current = unsub.reconnect;
    return () => {
      realtimeReconnectRef.current = () => {};
      unsub();
    };
  }, [applyRealtimePoi, isTombstoned, syncNow]);

  // Load inicial + reconexao automatica + retry periodico. O realtime e o
  // caminho principal; esta reconciliação captura eventos perdidos e garante
  // convergência mesmo após suspensão do navegador ou troca de rede.
  useEffect(() => {
    void syncNow();
    const onOnline = () => {
      // Ao voltar a internet: reconectamos o canal realtime IMEDIATAMENTE
      // (sem esperar o backoff exponencial) e disparamos um syncNow para
      // buscar eventuais mudanças perdidas enquanto estávamos offline.
      try { realtimeReconnectRef.current?.(); } catch { /* noop */ }
      void syncNow();
    };
    const onOffline = () => { setSyncMode('offline'); setPendingCount(getPendingCount()); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        try { realtimeReconnectRef.current?.(); } catch { /* noop */ }
        void syncNow();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) void syncNow();
    }, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [syncNow]);

  const addPOI = (poi: Omit<POI, 'id' | 'createdAt'>): POI => {
    const now = Date.now();
    const newPOI: POI = { ...poi, id: genId(), createdAt: now, revision: 1, updatedAt: now, updatedBy: getDeviceId() };
    recentMutationsRef.current.set(newPOI.id, { kind: 'upsert', at: Date.now(), poi: newPOI });
    persistRecentMutations(recentMutationsRef.current);
    // Garante que um id novo nunca fique marcado como excluído (defensivo)
    deletedIdsRef.current.delete(newPOI.id);
    persistTombstones(deletedIdsRef.current);
    setPoisState((prev) => (prev.some((p) => p.id === newPOI.id) ? prev : [...prev, newPOI]));
    setShowModal(false);
    setSelectedCoords(null);
    enqueueOp({ type: 'insert', poi: newPOI });
    setPendingCount(getPendingCount());
    void syncNow();
    return newPOI;
  };

  const deletePOI = (id: string) => {
    // Lápide e mutação local: impedem que realtime/fetch atrasados tragam a marcação de volta.
    deletedIdsRef.current.set(id, Date.now());
    persistTombstones(deletedIdsRef.current);
    recentMutationsRef.current.set(id, { kind: 'delete', at: Date.now() });
    persistRecentMutations(recentMutationsRef.current);
    if (popupData && popupData.poiId === id) setPopupData(null);
    setPoisState((prev) => prev.filter((p) => p.id !== id));
    const previous = poisRef.current.find((poi) => poi.id === id);
    enqueueOp({ type: 'delete', id, basePoi: previous, baseRevision: previous?.revision });
    setPendingCount(getPendingCount());
    void syncNow();
  };

  const updatePOI = (id: string, updates: Partial<POI>) => {
    const full = poisRef.current.find((p) => p.id === id);
    const merged = full ? {
      ...full,
      ...updates,
      revision: (full.revision || 1) + 1,
      updatedAt: Date.now(),
      updatedBy: getDeviceId(),
    } : undefined;
    if (merged) {
      recentMutationsRef.current.set(id, { kind: 'upsert', at: Date.now(), poi: merged });
      persistRecentMutations(recentMutationsRef.current);
    }
    setPoisState((prev) => prev.map((p) => (p.id === id ? {
      ...p,
      ...updates,
      revision: merged?.revision ?? p.revision,
      updatedAt: merged?.updatedAt,
      updatedBy: merged?.updatedBy,
    } : p)));
    enqueueOp({ type: 'update', id, updates, poi: merged, basePoi: full, baseRevision: full?.revision });
    setPendingCount(getPendingCount());
    void syncNow();
  };

  const resolveConflict = (conflictId: string, resolution: ConflictResolution) => {
    const conflict = conflictsRef.current.find((item) => item.conflictId === conflictId);
    if (!conflict) return;

    const remote = conflict.remotePoi;
    const now = Date.now();

    if (resolution === 'keep-remote') {
      deletedIdsRef.current.delete(conflict.poiId);
      recentMutationsRef.current.delete(conflict.poiId);
      persistTombstones(deletedIdsRef.current);
      persistRecentMutations(recentMutationsRef.current);
      setPoisState((previous) => remote
        ? [...previous.filter((poi) => poi.id !== conflict.poiId), remote]
        : previous.filter((poi) => poi.id !== conflict.poiId));
    } else if (conflict.kind === 'delete') {
      // A versão local é a ausência do POI. Reenvia a exclusão contra a revisão
      // remota mais recente sem sobrescrever uma nova edição posterior.
      deletedIdsRef.current.set(conflict.poiId, now);
      persistTombstones(deletedIdsRef.current);
      recentMutationsRef.current.set(conflict.poiId, { kind: 'delete', at: now });
      persistRecentMutations(recentMutationsRef.current);
      setPoisState((previous) => previous.filter((poi) => poi.id !== conflict.poiId));
      if (remote) enqueueOp({ type: 'delete', id: conflict.poiId, basePoi: remote, baseRevision: remote.revision });
    } else {
      const selected = resolution === 'merge' ? mergeConflictVersions(conflict) : conflict.localPoi;
      if (!selected) return;
      const next: POI = {
        ...selected,
        id: conflict.poiId,
        revision: (remote?.revision || selected.revision || 1) + 1,
        updatedAt: now,
        updatedBy: getDeviceId(),
      };
      deletedIdsRef.current.delete(conflict.poiId);
      persistTombstones(deletedIdsRef.current);
      recentMutationsRef.current.set(conflict.poiId, { kind: 'upsert', at: now, poi: next });
      persistRecentMutations(recentMutationsRef.current);
      setPoisState((previous) => [...previous.filter((poi) => poi.id !== conflict.poiId), next]);
      if (remote) {
        enqueueOp({ type: 'update', id: conflict.poiId, poi: next, updates: next, basePoi: remote, baseRevision: remote.revision });
      } else {
        enqueueOp({ type: 'insert', poi: next });
      }
    }

    archiveConflict(conflict, resolution);
    setConflicts(removeConflict(conflictId));
    setPendingCount(getPendingCount());
    void syncNow().then(async () => {
      const samePoiStillHasConflict = loadConflicts().some((item) => item.poiId === conflict.poiId);
      if (resolution === 'keep-remote' || (!samePoiStillHasConflict && getPendingCount() === 0)) {
        await resolveRemoteConflict(conflictId, resolution);
      }
    });
  };

  // Importa POIs vindos de link compartilhado (nao sobrescreve os que ja existem)
  const importSharedPois = (incoming: POI[]) => {
    if (!incoming || incoming.length === 0) return;
    setPoisState((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      incoming.forEach((p) => { if (!map.has(p.id)) map.set(p.id, p); });
      return Array.from(map.values());
    });
    incoming.forEach((p) => enqueueOp({ type: 'insert', poi: p }));
    setPendingCount(getPendingCount());
    void syncNow();
  };

  const setPois = (next: POI[]) => setPoisState(next);

  return (
    <POIManagerContext.Provider value={{
      pois, setPois, addPOI, deletePOI, updatePOI, importSharedPois, syncMode,
      pendingCount, forceSync: syncNow, conflicts, resolveConflict,
      showModal, setShowModal,
      selectedCoords, setSelectedCoords,
      selectedFundo, setSelectedFundo,
      selectedTalhao, setSelectedTalhao,
      popupData, setPopupData,
      onLocateCoordinates, setOnLocateCoordinates,
    }}>
      {children}
    </POIManagerContext.Provider>
  );
}

export function usePOIManager() {
  const context = React.useContext(POIManagerContext);
  if (!context) throw new Error('usePOIManager deve ser usado dentro de POIManagerProvider');
  return context;
}

// ── Definição de categorias ────────────────────────────────────────────────────
export const CATEGORY_MAP: Record<string, { title: string; emoji: string; color: string; group: string; image?: string }> = {
  represa:    { title: 'PEGADOR DE ÁGUA (REPRESA)', emoji: '🌊', color: '#0ea5e9', group: 'Água', image: '🌊' },
  marcacao:   { title: 'MARCAÇÃO',              emoji: '📍', color: '#ADFF2F', group: 'Geral', image: '📍' },
  poco:       { title: 'POÇO DE ÁGUA',          emoji: '💧', color: '#60a5fa', group: 'Água', image: '💧' },
  bomba:      { title: 'BOMBA HIDRÁULICA',       emoji: '⚙️', color: '#94a3b8', group: 'Geral', image: '⚙️' },
  outro:      { title: 'PONTO DE INTERESSE',     emoji: '📌', color: '#f59e0b', group: 'Geral', image: '📌' },
  irrigacao:  { title: 'PONTO DE IRRIGAÇÃO',     emoji: '💦', color: '#38bdf8', group: 'Água', image: '💦' },
  irrigar:    { title: 'IRRIGAR PROGRAMADO',     emoji: '🚰', color: '#0ea5e9', group: 'Água', image: '🚰' },
  eucalipto:  { title: 'ÁREA DE EUCALIPTO',      emoji: '🌲', color: '#22c55e', group: 'Agricultura', image: '🌲' },
  soja:       { title: 'ÁREA DE SOJA',           emoji: '🌿', color: '#84cc16', group: 'Agricultura', image: '🌿' },
  dessecada:  { title: 'ÁREA DESSECADA',         emoji: '🟤', color: '#a16207', group: 'Agricultura', image: '🟤' },
  adubo:      { title: 'PONTO DE ADUBO',         emoji: '🌱', color: '#4ade80', group: 'Agricultura', image: '🌱' },
  tubulacao:  { title: 'TUBULAÇÃO',              emoji: '🔧', color: '#fb923c', group: 'Infraestrutura', image: '🔧' },
  implemento: { title: 'IMPLEMENTO AGRÍCOLA',    emoji: '🚜', color: '#f59e0b', group: 'Infraestrutura', image: '🚜' },
  transporte_insumo: { title: 'TRANSPORTE DE INSUMO', emoji: '🚚', color: '#f97316', group: 'Logística', image: '🚚' },
  perigo:     { title: 'PERIGO',                 emoji: '⚠️', color: '#ef4444', group: 'Alertas', image: '⚠️' },
  incendio:   { title: 'ALERTA DE INCÊNDIO',     emoji: '🔥', color: '#ef4444', group: 'Alertas', image: '🔥' },
  queimada:   { title: 'ÁREA QUEIMADA',          emoji: '💨', color: '#f97316', group: 'Alertas', image: '💨' },
};

export const TRANSPORT_MATERIALS = [
  { value: 'insumos', label: 'Insumos (outros)', unit: 'toneladas' as const, units: ['toneladas'] as const },
  { value: 'torta', label: 'Torta', unit: 'toneladas' as const, units: ['toneladas'] as const },
  { value: 'esterco', label: 'Esterco', unit: 'toneladas' as const, units: ['toneladas'] as const },
  { value: 'calcario', label: 'Calcário', unit: 'toneladas' as const, units: ['toneladas'] as const },
  { value: 'gesso', label: 'Gesso', unit: 'toneladas' as const, units: ['toneladas'] as const },
  { value: 'composto', label: 'Composto', unit: 'toneladas' as const, units: ['toneladas'] as const },
  { value: 'adubo', label: 'Adubo', unit: 'toneladas' as const, units: ['toneladas', 'bigbags'] as const },
  { value: 'reativo_bigbag', label: 'Reativo', unit: 'bigbags' as const, units: ['toneladas', 'bigbags'] as const },
] as const;

export type TransportMaterial = typeof TRANSPORT_MATERIALS[number]['value'];
export type TransportUnit = 'toneladas' | 'bigbags';

export const getTransportUnits = (value?: string): readonly TransportUnit[] =>
  (TRANSPORT_MATERIALS.find((material) => material.value === value)?.units || ['toneladas']) as readonly TransportUnit[];

export const getTransportMaterial = (value?: string) =>
  TRANSPORT_MATERIALS.find((material) => material.value === value);

export const usesTransportMunck = (material?: string): boolean =>
  material === 'reativo_bigbag' || material === 'adubo';

// Categorias tratadas como ALERTA (marcador pulsante forte)
export const ALERT_CATEGORIES = ['perigo', 'incendio', 'queimada'];

interface POIManagerProps {
  onLocateCoordinates?: (lat: number, lng: number) => void;
  hidden?: boolean;
}

// Por enquanto, a LISTA de marcações no painel fica OCULTA (a pedido do usuário).
// Os marcadores continuam aparecendo no MAPA; editar/excluir é feito tocando no
// marcador do mapa. Para voltar a mostrar a lista, troque para `true`.
const SHOW_POI_LIST = false;

export default function POIManager({ onLocateCoordinates, hidden = false }: POIManagerProps = {}) {
  const {
    pois, addPOI, deletePOI, showModal, setShowModal,
    selectedCoords, setSelectedCoords,
    selectedFundo, selectedTalhao,
    setSelectedFundo, setSelectedTalhao,
    setOnLocateCoordinates, syncMode, pendingCount, forceSync,
    conflicts, resolveConflict,
  } = usePOIManager();

  useEffect(() => {
    if (onLocateCoordinates) setOnLocateCoordinates(onLocateCoordinates);
  }, [onLocateCoordinates, setOnLocateCoordinates]);

  const [title, setTitle]           = useState('');
  const [category, setCategory]     = useState('represa');
  const [transportMaterial, setTransportMaterial] = useState<TransportMaterial>('torta');
  const [transportUnit, setTransportUnit] = useState<TransportUnit>('toneladas');
  const [transportQuantity, setTransportQuantity] = useState('');
  const [transportFormula, setTransportFormula] = useState('');
  const [transportSearch, setTransportSearch] = useState('');
  const [transportError, setTransportError] = useState('');
  const [waterAvailable, setWaterAvailable] = useState(true);
  const [message, setMessage]       = useState('');
  const [implementoAgr, setImplementoAgr] = useState('');
  const [photo, setPhoto]           = useState('');
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [showCoordSearch, setShowCoordSearch] = useState(false);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [modalMounted, setModalMounted] = useState(showModal);
  const [searchFilter, setSearchFilter] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  // Trava anti duplo-envio: evita que um toque duplo (comum no celular) crie
  // duas marcações iguais em sequência.
  const [submitting, setSubmitting] = useState(false);
  const [fireAlert, setFireAlert] = useState<POI | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const previousPoisRef = useRef<Map<string, POI> | null>(null);
  const fireAlertReadyRef = useRef(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    setTransportError('');
    const prevDefault = CATEGORY_MAP[category]?.title || '';
    const currentTransportLabel = getTransportMaterial(transportMaterial)?.label || '';
    const transportDefault = CATEGORY_MAP.transporte_insumo.title;
    const hasTransportDefaultTitle = category === 'transporte_insumo'
      && (title === transportDefault || title === currentTransportLabel || title.startsWith(`${transportDefault} —`));
    if (!title || title === prevDefault || title.startsWith(prevDefault) || hasTransportDefaultTitle) {
      setTitle(newCat === 'transporte_insumo'
        ? (getTransportMaterial(transportMaterial)?.label || 'Torta')
        : (CATEGORY_MAP[newCat]?.title || ''));
    }
  };

  const handleTransportMaterialChange = (value: string) => {
    const next = TRANSPORT_MATERIALS.find((material) => material.value === value);
    if (!next) return;
    setTransportMaterial(next.value);
    setTransportUnit(next.unit);
    if (next.value !== 'adubo') setTransportFormula('');
    setTransportError('');
    const transportPrefix = CATEGORY_MAP.transporte_insumo.title;
    const currentTransportLabel = getTransportMaterial(transportMaterial)?.label || '';
    const hasGeneratedTransportTitle = !title
      || title === transportPrefix
      || title === currentTransportLabel
      || title.startsWith(`${transportPrefix} —`);
    if (hasGeneratedTransportTitle) {
      setTitle(next.label);
    }
  };

  const handleEnableNotifications = async () => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationMessage('');
    try {
      const result = await enableCriticalNotifications();
      setNotificationPermission(result.permission);
      setNotificationMessage(result.message);
    } finally {
      setNotificationBusy(false);
    }
  };

  const normalizedCategorySearch = categorySearch.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filteredCategoryOptions = Object.entries(CATEGORY_MAP).filter(([value, info]) => {
    if (!normalizedCategorySearch) return true;
    const haystack = `${value} ${info.title} ${info.group} ${info.emoji}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return haystack.includes(normalizedCategorySearch);
  });

  const filteredTransportMaterials = TRANSPORT_MATERIALS.filter((material) => {
    const query = transportSearch.trim().toLocaleLowerCase('pt-BR');
    const normalizedLabel = material.label.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const aliases = material.value === 'esterco' ? ['esterno'] : [];
    return !query || normalizedLabel.includes(normalizedQuery) || aliases.some((alias) => alias.includes(normalizedQuery));
  });

    // Exibe um alerta operacional quando uma nova ocorrência crítica chega pelo
    // realtime, é criada neste aparelho ou muda de outra categoria para incêndio/perigo.
  useEffect(() => {
    const current = new Map(pois.map((poi) => [poi.id, poi]));
    const previous = previousPoisRef.current;

    // Aguarda a primeira reconciliação quando o cache começa vazio para não
    // transformar a carga inicial em vários alertas. Depois disso, todo novo
    // incêndio é tratado como evento operacional.
    if (previous === null) {
      if (syncMode === 'syncing' && pois.length === 0) return;
      previousPoisRef.current = current;
      fireAlertReadyRef.current = true;
      return;
    }

    if (fireAlertReadyRef.current) {
      const newCritical = pois.find((poi) => {
        const before = previous.get(poi.id);
        return isCriticalCategory(poi.category) && (!before || before.category !== poi.category);
      });
      if (newCritical) {
        setFireAlert(newCritical);
        void notifyCriticalPoi(newCritical);
      }
    }

    previousPoisRef.current = current;
    if (fireAlert && !current.has(fireAlert.id)) setFireAlert(null);
  }, [pois, syncMode, fireAlert]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    setPhotoProcessing(true);
    try {
      const compressed = await compressImage(file, { maxDimension: 1000, targetBytes: 90 * 1024 });
      setPhoto(compressed);
    } catch (err) {
      console.error('Erro ao comprimir foto:', err);
      alert('Não foi possível processar a foto. Tente outra imagem.');
    } finally {
      setPhotoProcessing(false);
    }
  };

  useEffect(() => {
    const handleOpenPoiModal = (event: any) => {
      const { lng, lat, fundo, talhao, isUnmarkedArea, category: initialCategory, title: initialTitle, message: initialMessage } = event.detail;
      setSelectedCoords({ lng, lat });
      setSelectedFundo(fundo);
      setSelectedTalhao(talhao);
      setCategory(CATEGORY_MAP[initialCategory] ? initialCategory : 'represa');
      setTransportMaterial('torta');
      setTransportUnit('toneladas');
      setTransportQuantity('');
      setTransportFormula('');
      setTransportSearch('');
      setTransportError('');
      setWaterAvailable(true);
      setCategorySearch('');
      setTitle(typeof initialTitle === 'string' ? initialTitle : '');
      setMessage(typeof initialMessage === 'string' ? initialMessage : '');
      setPhoto('');
      setImplementoAgr('');
      void isUnmarkedArea;
      setShowModal(true);
    };
    window.addEventListener('openPoiModal', handleOpenPoiModal);
    return () => window.removeEventListener('openPoiModal', handleOpenPoiModal);
  }, [setSelectedCoords, setShowModal, setSelectedFundo, setSelectedTalhao]);

  // Mantém o modal montado durante a saída para que o fechamento animado não seja cortado.
  useEffect(() => {
    if (showModal) {
      setModalMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setModalMounted(false), 300);
    return () => window.clearTimeout(timeout);
  }, [showModal]);

  // Fechamento acessível do modal de nova marcação, inclusive pelo teclado.
  useEffect(() => {
    if (!showModal) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showModal, setShowModal]);

  const handleSearchCoordinates = () => {
    setCoordError('');
    const parts = coordInput.trim().split(',').map((p: string) => p.trim());
    if (parts.length !== 2) { setCoordError('Use: latitude, longitude (ex: -21.48, -51.04)'); return; }
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) { setCoordError('Coordenadas inválidas.'); return; }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { setCoordError('Coordenadas fora do intervalo.'); return; }
    setSelectedCoords({ lat, lng });
    setCoordInput('');
    setShowCoordSearch(false);
    setCategory('represa');
    setTransportMaterial('torta');
    setTransportUnit('toneladas');
    setTransportQuantity('');
    setTransportFormula('');
    setTransportSearch('');
    setTransportError('');
    setWaterAvailable(true);
    setCategorySearch('');
    setTitle(CATEGORY_MAP.represa.title);
    setShowModal(true);
    if (onLocateCoordinates) onLocateCoordinates(lat, lng);
  };

  const resetForm = () => {
    setTitle(''); setCategory('represa'); setMessage('');
    setTransportMaterial('torta'); setTransportUnit('toneladas'); setTransportQuantity(''); setTransportFormula(''); setTransportSearch(''); setTransportError('');
    setWaterAvailable(true);
    setCategorySearch('');
    setImplementoAgr(''); setPhoto('');
  };

  const handleAddPOI = () => {
    if (submitting) return; // evita duplo toque criando 2 marcações
    if (!selectedCoords) {
      alert('Por favor, selecione um local no mapa');
      return;
    }
    const isTransport = category === 'transporte_insumo';
    const selectedMaterial = getTransportMaterial(transportMaterial);
    let parsedTransportQuantity: number | undefined;
    if (isTransport) {
      parsedTransportQuantity = transportUnit === 'bigbags'
        ? Number(String(transportQuantity).replace(',', '.'))
        : parseTons(transportQuantity);
      if (!selectedMaterial) {
        setTransportError('Escolha um insumo para este transporte.');
        return;
      }
      if (!Number.isFinite(parsedTransportQuantity) || parsedTransportQuantity <= 0) {
        setTransportError(`Informe uma quantidade válida em ${transportUnit === 'bigbags' ? 'BigBags' : 'toneladas'}.`);
        return;
      }
      if (transportUnit === 'bigbags' && !Number.isInteger(parsedTransportQuantity)) {
        setTransportError('A quantidade em BigBags deve ser um número inteiro.');
        return;
      }
    }
    setSubmitting(true);
    const catInfo = CATEGORY_MAP[category] || CATEGORY_MAP.marcacao;
    const finalTitle = category === 'implemento' && implementoAgr.trim()
      ? implementoAgr.trim()
      : (title.trim() || catInfo.title);

    const createdPoi = addPOI({
      lat: selectedCoords.lat, lng: selectedCoords.lng,
      title: finalTitle,
      // Mantido no payload por compatibilidade com registros antigos do banco;
      // a nova interface não solicita mais esse campo.
      description: '',
      category, type: 'custom',
      message: message.trim() || undefined,
      photo: photo || undefined,
      implementoAgr: category === 'implemento' ? implementoAgr.trim() || undefined : undefined,
      transportMaterial: isTransport ? transportMaterial : undefined,
      transportQuantity: isTransport ? parsedTransportQuantity : undefined,
      transportFormula: isTransport && transportMaterial === 'adubo' ? transportFormula.trim() || undefined : undefined,
      transportUnit: isTransport ? transportUnit : undefined,
      transportTrips: isTransport ? [] : undefined,
      waterAvailable: category === 'represa' ? waterAvailable : undefined,
      fundo: selectedFundo, talhao: selectedTalhao,
    });
    if (isCriticalCategory(createdPoi.category)) setFireAlert(createdPoi);

    resetForm();
    // Libera a trava após o modal fechar (curto período)
    setTimeout(() => setSubmitting(false), 800);
  };

  const filteredPois = pois.filter(p =>
    !searchFilter ||
    p.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (p.fundo && p.fundo.includes(searchFilter)) ||
    (p.talhao && p.talhao.includes(searchFilter))
  );

  const isAlert = ALERT_CATEGORIES.includes(category);
  const photoBytes = photo ? estimateDataUrlBytes(photo) : 0;

  return (
    <>
      {/* ── Alerta operacional de incêndio ── */}
      {fireAlert && (
        <div
          role="alert"
          data-testid="fire-alert-banner"
          style={{
            position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', left: '50%',
            transform: 'translateX(-50%)', width: 'min(92vw, 430px)', zIndex: 10002,
            padding: 12, borderRadius: 18, color: 'white',
            background: 'linear-gradient(135deg, rgba(126, 22, 22, 0.97), rgba(45, 10, 16, 0.97))',
            border: '1px solid rgba(255, 143, 86, 0.72)',
            boxShadow: '0 18px 46px rgba(80, 5, 5, 0.52), 0 0 28px rgba(255, 64, 30, 0.3)',
            backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 13, background: 'linear-gradient(145deg, #ff7a45, #b91c1c)',
              border: '1px solid #ffd166', boxShadow: '0 0 20px rgba(255, 72, 32, 0.7)',
            }}>
              <PoiCategoryIcon category="incendio" size={23} color="#fff8ed" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#ffd166' }}>
                ALERTA DE INCÊNDIO
              </div>
              <div style={{ marginTop: 2, fontSize: 15, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fireAlert.title || 'Novo foco identificado'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,245,238,0.78)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                {fireAlert.lat.toFixed(6)}, {fireAlert.lng.toFixed(6)}
                {(fireAlert.fundo || fireAlert.talhao) && ` · F${fireAlert.fundo || 'N/A'} T${fireAlert.talhao || 'N/A'}`}
              </div>
            </div>
            <button
              onClick={() => setFireAlert(null)}
              aria-label="Fechar alerta de incêndio"
              style={{
                width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.18)',
                color: 'rgba(255,255,255,0.78)', cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
          <button
            onClick={() => {
              onLocateCoordinates?.(fireAlert.lat, fireAlert.lng);
              setFireAlert(null);
            }}
            style={{
              width: '100%', marginTop: 10, padding: '9px 12px', borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              border: '1px solid rgba(255,209,102,0.55)', background: 'rgba(255,209,102,0.14)',
              color: '#fff1c2', fontSize: 12, fontWeight: 900, cursor: 'pointer',
            }}
          >
            <Navigation size={14} /> Ver localização no mapa
          </button>
        </div>
      )}

      {/* ── Conflitos entre aparelhos ── */}
      {!hidden && conflicts.length > 0 && (
        <div
          role="region"
          aria-label="Conflitos de sincronização"
          data-testid="poi-conflicts-panel"
          style={{
            position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', right: 14,
            width: 'min(94vw, 390px)', maxHeight: 'min(70vh, 520px)', overflowY: 'auto',
            zIndex: 10001, padding: 14, borderRadius: 18, color: 'white',
            background: 'linear-gradient(145deg, rgba(20,31,46,0.98), rgba(9,17,29,0.98))',
            border: '1px solid rgba(251,191,36,0.48)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.5), 0 0 26px rgba(251,191,36,0.12)',
            backdropFilter: 'blur(28px) saturate(160%)', WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <AlertTriangle size={17} color="#fbbf24" />
            <strong style={{ fontSize: 14, flex: 1 }}>Conflitos protegidos</strong>
            <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 900 }}>{conflicts.length}</span>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.64)' }}>
            Dois aparelhos alteraram dados ao mesmo tempo. Nenhuma versão foi apagada; escolha como resolver cada item.
          </p>
          {conflicts.slice(0, 8).map((conflict) => {
            const local = conflict.localPoi || conflict.basePoi;
            const remote = conflict.remotePoi;
            const label = local?.title || remote?.title || 'Marcação sem título';
            return (
              <div key={conflict.conflictId} style={{
                marginTop: 8, padding: 10, borderRadius: 13,
                background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.52)' }}>
                  {conflict.kind === 'delete' ? 'Exclusão em conflito' : 'Edição em conflito'} · remoto v{remote?.revision || '?'}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => resolveConflict(conflict.conflictId, 'keep-local')}
                    style={{ flex: 1, minWidth: 108, padding: '7px 8px', borderRadius: 9, border: '1px solid rgba(173,255,47,0.45)', background: 'rgba(173,255,47,0.12)', color: '#d9ff9a', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                  >
                    <RotateCcw size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Manter este aparelho
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveConflict(conflict.conflictId, 'keep-remote')}
                    style={{ flex: 1, minWidth: 108, padding: '7px 8px', borderRadius: 9, border: '1px solid rgba(96,165,250,0.45)', background: 'rgba(96,165,250,0.12)', color: '#bfdbfe', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                  >
                    Usar versão remota
                  </button>
                  {conflict.kind !== 'delete' && local && remote && (
                    <button
                      type="button"
                      onClick={() => resolveConflict(conflict.conflictId, 'merge')}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 9, border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(251,191,36,0.12)', color: '#fde68a', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Mesclar campos diferentes
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {conflicts.length > 8 && (
            <p style={{ margin: '10px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              Resolva os primeiros itens para visualizar os demais.
            </p>
          )}
        </div>
      )}

      {/* ── Busca por Coordenadas ── */}
      {!hidden && showCoordSearch && (
        <div className="glass-liquid-strong" style={{
          position: 'absolute', bottom: 380, left: 16, zIndex: 1200,
          background: 'var(--bp-glass-bg-strong)',
          backdropFilter: 'blur(32px) saturate(185%)',
          WebkitBackdropFilter: 'blur(32px) saturate(185%)',
          border: '1px solid var(--bp-glass-border-accent)', borderRadius: 18,
          padding: 16, width: 280, boxShadow: 'var(--bp-glass-shadow)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Navigation size={16} color="#ADFF2F" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Buscar por Coordenadas</span>
            <button onClick={() => { setShowCoordSearch(false); setCoordInput(''); setCoordError(''); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
          <input
            type="text"
            placeholder="Ex: -21.48, -51.04"
            value={coordInput}
            onChange={(e) => { setCoordInput(e.target.value); setCoordError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchCoordinates()}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
          {coordError && (
            <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{coordError}</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleSearchCoordinates} style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: 'rgba(173,255,47,0.15)', border: '1px solid rgba(173,255,47,0.4)',
              color: '#ADFF2F', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>Buscar</button>
            <button onClick={() => { setShowCoordSearch(false); setCoordInput(''); setCoordError(''); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer',
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Lista de POIs (painel lateral) ── */}
      <div className="glass-liquid-strong bp-poi-live-card" style={{
        position: 'absolute', bottom: 80, left: 16, zIndex: 10,
        display: hidden ? 'none' : undefined,
        background: 'var(--bp-live-panel-bg)',
        backdropFilter: 'blur(32px) saturate(185%)',
        WebkitBackdropFilter: 'blur(32px) saturate(185%)',
        border: '1px solid var(--bp-glass-border-accent)', borderRadius: 18,
        overflow: 'hidden', boxShadow: 'var(--bp-glass-shadow)',
        color: 'var(--bp-panel-text)',
        fontFamily: 'var(--bp-font-ui)',
        width: 240, transition: 'all 0.3s',
      }}>
        {/* Header */}
        <div
          className="bp-poi-live-header"
          onClick={() => setIsMinimized(!isMinimized)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', cursor: 'pointer',
            borderBottom: isMinimized ? 'none' : '1px solid var(--bp-glass-border)',
          }}
        >
          <div className="bp-poi-live-icon glass-liquid-button" style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(173,255,47,0.12)', border: '1px solid rgba(173,255,47,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={14} color="#ADFF2F" />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--bp-heading)', flex: 1 }}>
            Marcações
          </span>
          <span
            className="bp-poi-sync-status"
            onClick={(e) => { e.stopPropagation(); forceSync?.(); }}
            title={
              syncMode === 'online' ? 'Sincronizando em tempo real — clique para atualizar'
              : syncMode === 'syncing' ? `Sincronizando${pendingCount ? ` (${pendingCount} pendente${pendingCount > 1 ? 's' : ''})` : ''}...`
              : `Offline — salvo neste aparelho${pendingCount ? ` (${pendingCount} aguardando envio)` : ''}. Clique para tentar sincronizar`
            }
            style={{
              display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
              fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 20,
              background: syncMode === 'online' ? 'rgba(74,222,128,0.15)' : syncMode === 'syncing' ? 'rgba(96,165,250,0.15)' : 'rgba(251,146,60,0.15)',
              color: syncMode === 'online' ? '#4ade80' : syncMode === 'syncing' ? '#60a5fa' : '#fb923c',
              border: `1px solid ${syncMode === 'online' ? 'rgba(74,222,128,0.3)' : syncMode === 'syncing' ? 'rgba(96,165,250,0.3)' : 'rgba(251,146,60,0.3)'}`,
            }}>
            {syncMode === 'online' ? <Wifi size={9} /> : syncMode === 'syncing' ? <Loader2 size={9} className="bp-spin" /> : <WifiOff size={9} />}
            {syncMode === 'online' ? 'AO VIVO' : syncMode === 'syncing' ? 'SINC...' : 'OFFLINE'}
            {pendingCount > 0 && syncMode !== 'online' ? ` ${pendingCount}` : ''}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 20,
            background: 'rgba(173,255,47,0.15)', color: '#ADFF2F',
            border: '1px solid rgba(173,255,47,0.3)',
          }} className="bp-poi-count-badge glass-liquid-button" data-testid="poi-count">{pois.length}</span>
          {isMinimized
            ? <ChevronUp size={14} color="var(--bp-control-muted)" />
            : <ChevronDown size={14} color="var(--bp-control-muted)" />}
        </div>

        {!isMinimized && (
          <div style={{ padding: '8px 10px 10px' }}>
            {/* Busca */}
            {SHOW_POI_LIST && pois.length > 3 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '6px 10px', marginBottom: 8,
              }}>
                <Search size={12} color="rgba(255,255,255,0.35)" />
                <input
                  type="text"
                  placeholder="Filtrar..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'rgba(255,255,255,0.7)', fontSize: 12,
                  }}
                />
              </div>
            )}

            {/* Lista (oculta por enquanto) OU dica de interação */}
            {SHOW_POI_LIST ? (
              <div style={{ maxHeight: 200, overflowY: 'auto' }} className="modal-scroll">
                {filteredPois.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '12px 0' }}>
                    {pois.length === 0 ? 'Clique no mapa para adicionar' : 'Nenhum resultado'}
                  </p>
                ) : (
                  filteredPois.map(poi => {
                    const catInfo = CATEGORY_MAP[poi.category] || CATEGORY_MAP.marcacao;
                    return (
                      <div key={poi.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 8px', borderRadius: 10, marginBottom: 4,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                      }}>
                        <PoiCategoryIcon category={poi.category} size={17} color={catInfo.color} transportMaterial={poi.transportMaterial} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{poi.title}</p>
                          {(poi.fundo || poi.talhao) && (
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                              F{poi.fundo} · T{poi.talhao}
                            </p>
                          )}
                        </div>
                        {poi.photo && (
                          <Camera size={12} color="rgba(96,165,250,0.8)" style={{ flexShrink: 0 }} />
                        )}
                        <button
                          onClick={() => deletePOI(poi.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                        >
                          <Trash2 size={13} color="rgba(239,68,68,0.6)" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center', padding: '10px 6px', lineHeight: 1.5 }}>
                Toque em um marcador no mapa para <b style={{ color: 'rgba(255,255,255,0.7)' }}>editar</b> ou <b style={{ color: 'rgba(255,255,255,0.7)' }}>excluir</b>.
              </p>
            )}

            {/* Alertas de incêndio/perigo em todos os aparelhos autorizados */}
            {notificationPermission !== 'granted' ? (
              <button
                type="button"
                data-testid="enable-critical-notifications"
                onClick={(event) => { event.stopPropagation(); void handleEnableNotifications(); }}
                disabled={notificationBusy}
                style={{
                  width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: notificationPermission === 'denied' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                  border: `1px solid ${notificationPermission === 'denied' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`,
                  color: notificationPermission === 'denied' ? '#b91c1c' : '#a16207',
                  fontWeight: 800, fontSize: 11, cursor: notificationBusy ? 'wait' : 'pointer',
                }}
              >
                {notificationPermission === 'denied' ? <BellOff size={13} /> : <Bell size={13} />}
                {notificationBusy ? 'Habilitando alertas...' : notificationPermission === 'denied' ? 'Notificações bloqueadas' : 'Habilitar alertas de incêndio'}
              </button>
            ) : (
              <div
                data-testid="critical-notifications-enabled"
                style={{
                  marginTop: 8, padding: '7px 10px', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'rgba(22,90,114,0.10)', border: '1px solid rgba(22,90,114,0.22)',
                  color: 'var(--bp-accent)', fontWeight: 800, fontSize: 10,
                }}
              >
                <Bell size={12} /> Alertas críticos habilitados neste aparelho
              </div>
            )}
            {notificationMessage && (
              <div role="status" style={{ padding: '5px 6px 0', color: 'var(--bp-panel-muted)', textAlign: 'center', fontSize: 9.5, lineHeight: 1.3 }}>
                {notificationMessage}
              </div>
            )}

            {/* Botão busca por coords */}
            <button
              onClick={() => setShowCoordSearch(true)}
              style={{
                width: '100%', marginTop: 8, padding: '7px 0',
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
                color: '#60a5fa', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              <Navigation size={13} />
              Buscar por Coordenadas
            </button>
          </div>
        )}
      </div>

      {/* ── Modal de Adição de POI ── */}
      {modalMounted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Adicionar nova marcação"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowModal(false);
          }}
          className={`bp-poi-modal-overlay ${showModal ? '' : 'is-closing'}`}
          style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(circle at 50% 20%, rgba(173,255,47,0.10), transparent 38%), rgba(0,0,0,0.62)',
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'max(12px, env(safe-area-inset-top)) 10px max(12px, env(safe-area-inset-bottom))',
          boxSizing: 'border-box', fontFamily: 'var(--bp-font-ui)',
        }}>
          <div
            className={`glass-liquid-strong modal-scroll bp-poi-create-modal bp-modal-surface ${showModal ? '' : 'is-closing'}`}
            onClick={(event) => event.stopPropagation()}
            style={{
            width: 'min(92vw, 420px)', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto',
            margin: 'auto', background: 'var(--bp-create-modal-bg)',
            backdropFilter: 'blur(32px) saturate(185%)',
            WebkitBackdropFilter: 'blur(32px) saturate(185%)',
            border: '1px solid var(--bp-glass-border-accent)',
            borderRadius: 24,
            boxShadow: 'var(--bp-glass-shadow)',
            animation: 'slideUpModal 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            {/* Header do modal */}
            <div style={{
              padding: '12px 16px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: `${CATEGORY_MAP[category]?.color || '#ADFF2F'}20`,
                border: `1px solid ${CATEGORY_MAP[category]?.color || '#ADFF2F'}50`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                <PoiCategoryIcon category={category} size={22} color={CATEGORY_MAP[category]?.color || '#b7ff4a'} transportMaterial={transportMaterial} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(173,255,47,0.7)', textTransform: 'uppercase' }}>
                  {isAlert ? 'Novo Alerta' : 'Nova Marcação'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: 'white' }}>
                  {CATEGORY_MAP[category]?.title || 'Adicionar POI'}
                </div>
              </div>
              <button
                onClick={() => { setShowModal(false); }}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.6)', flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Conteúdo do modal */}
            <div className="bp-poi-create-modal-content" style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Coordenadas */}
              {selectedCoords && (
                <div style={{
                  background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
                  borderRadius: 12, padding: '8px 12px',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <MapPin size={14} color="#60a5fa" />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                    {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}
                  </span>
                  {(selectedFundo || selectedTalhao) && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                      color: '#ADFF2F', background: 'rgba(173,255,47,0.1)',
                      border: '1px solid rgba(173,255,47,0.25)', borderRadius: 8, padding: '2px 8px',
                    }}>
                      F{selectedFundo} · T{selectedTalhao}
                    </span>
                  )}
                </div>
              )}

              {category === 'incendio' && selectedCoords && (
                <div
                  data-testid="fire-location-preview"
                  className="bp-fire-location-preview"
                  style={{
                    padding: '10px 12px', borderRadius: 13,
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.17), rgba(249,115,22,0.08))',
                    border: '1px solid rgba(255,126,72,0.48)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="bp-fire-location-heading" style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#ffd166', fontSize: 10, fontWeight: 950, letterSpacing: '0.1em' }}>
                    <PoiCategoryIcon category="incendio" size={15} color="#ffd166" className="bp-fire-location-icon" />
                    LOCALIZAÇÃO DO ALERTA
                  </div>
                  <div className="bp-fire-location-description" style={{ marginTop: 5, color: 'rgba(255,245,238,0.78)', fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                    O foco será exibido no mapa neste ponto: {selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}
                  </div>
                </div>
              )}

              {/* Categoria pesquisável */}
              <div className="bp-category-picker" data-testid="category-picker">
                <label htmlFor="poi-category-search" style={{ fontSize: 11, fontWeight: 700, color: 'var(--bp-panel-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Categoria
                </label>
                <div className="bp-category-search-box">
                  <Search size={14} aria-hidden="true" />
                  <input
                    id="poi-category-search"
                    data-testid="category-search"
                    type="search"
                    placeholder="Pesquisar categoria..."
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    autoComplete="off"
                  />
                  {categorySearch && (
                    <button type="button" onClick={() => setCategorySearch('')} aria-label="Limpar busca de categoria">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="bp-category-selected" aria-live="polite">
                  <span className="bp-category-selected-kicker">Selecionada</span>
                  <strong>{CATEGORY_MAP[category]?.emoji} {CATEGORY_MAP[category]?.title || 'Marcação'}</strong>
                </div>
                <div className="bp-category-options" role="listbox" aria-label="Categorias de marcação">
                  {filteredCategoryOptions.length === 0 ? (
                    <div className="bp-category-empty">Nenhuma categoria encontrada.</div>
                  ) : filteredCategoryOptions.map(([value, info]) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={category === value}
                      key={value}
                      className={`bp-category-option${category === value ? ' is-selected' : ''}`}
                      onClick={() => { handleCategoryChange(value); setCategorySearch(''); }}
                      style={{ '--category-color': info.color } as React.CSSProperties}
                    >
                      <span className="bp-category-option-icon">{info.emoji}</span>
                      <span className="bp-category-option-copy">
                        <strong>{info.title}</strong>
                        <small>{info.group}</small>
                      </span>
                      {category === value && <Check size={14} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pegador de água (represa): disponibilidade de água */}
              {category === 'represa' && (
                <div className="bp-water-card" data-testid="water-availability-fields">
                  <div className="bp-water-card-head">
                    <img
                      src={waterAvailable ? '/poi-water-truck-blue.png' : '/poi-water-truck-x.png'}
                      alt=""
                      aria-hidden="true"
                      className="bp-water-card-icon"
                    />
                    <div className="bp-water-card-copy">
                      <div className="bp-water-card-kicker">Pegador de água</div>
                      <div className="bp-water-card-title">
                        {waterAvailable ? 'Represa com água disponível' : 'Represa baixa — sem água'}
                      </div>
                    </div>
                  </div>
                  <div className="bp-water-toggle-row" role="radiogroup" aria-label="Disponibilidade de água na represa">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={waterAvailable}
                      data-testid="water-available-yes"
                      className={`bp-water-toggle-btn is-available ${waterAvailable ? 'is-selected' : ''}`}
                      onClick={() => setWaterAvailable(true)}
                    >
                      <Check size={15} aria-hidden="true" /> Disponível
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!waterAvailable}
                      data-testid="water-available-no"
                      className={`bp-water-toggle-btn is-unavailable ${!waterAvailable ? 'is-selected' : ''}`}
                      onClick={() => setWaterAvailable(false)}
                    >
                      <X size={15} aria-hidden="true" /> Represa baixa
                    </button>
                  </div>
                  <div className="bp-water-card-help">
                    {waterAvailable
                      ? 'O caminhão pode pegar água neste ponto.'
                      : 'A represa está baixa: o marcador mostrará o caminhão com um X (não dá para pegar água).'}
                  </div>
                </div>
              )}

              {/* Transporte de insumo para caminhão caçamba */}
              {category === 'transporte_insumo' && (
                <div className="bp-transport-card" data-testid="transport-fields">
                  <div className="bp-transport-card-heading">
                    <div>
                      <div className="bp-transport-kicker">Carga operacional</div>
                      <div className="bp-transport-title">{usesTransportMunck(transportMaterial) ? 'Caminhão Munck' : 'Caminhão Caçamba'}</div>
                    </div>
                    <span className="bp-transport-unit-badge">
                      {transportUnit === 'bigbags' ? 'BigBag' : 'Toneladas'}
                    </span>
                  </div>

                  <label className="bp-transport-label" htmlFor="transport-material-search">Insumo</label>
                  <div className="bp-transport-search">
                    <Search size={14} aria-hidden="true" />
                    <input
                      id="transport-material-search"
                      data-testid="transport-material-search"
                      type="search"
                      placeholder="Pesquisar insumo, adubo, calcário..."
                      value={transportSearch}
                      onChange={(e) => setTransportSearch(e.target.value)}
                      autoComplete="off"
                    />
                    {transportSearch && (
                      <button type="button" onClick={() => setTransportSearch('')} aria-label="Limpar busca de insumo">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="bp-transport-material-list" role="listbox" aria-label="Insumos disponíveis">
                    {filteredTransportMaterials.length > 0 ? filteredTransportMaterials.map((material) => (
                      <button
                        type="button"
                        key={material.value}
                        role="option"
                        aria-selected={transportMaterial === material.value}
                        data-testid={`transport-material-${material.value}`}
                        className={transportMaterial === material.value ? 'is-selected' : ''}
                        onClick={() => handleTransportMaterialChange(material.value)}
                      >
                        <span className="bp-transport-material-icon">{material.unit === 'bigbags' ? '▣' : '●'}</span>
                        <span>{material.label}</span>
                        <small>{material.units.length > 1 ? 't / Bag' : material.unit === 'bigbags' ? 'BigBags' : 't'}</small>
                      </button>
                    )) : (
                      <div className="bp-transport-empty">Nenhum insumo encontrado.</div>
                    )}
                  </div>

                  {(transportMaterial === 'reativo_bigbag' || transportMaterial === 'adubo') && (
                    <div className="bp-transport-unit-choice" role="radiogroup" aria-label={`Unidade do ${transportMaterial === 'adubo' ? 'Adubo' : 'Reativo'}`}>

                      <span className="bp-transport-label">Controlar {transportMaterial === 'adubo' ? 'Adubo' : 'Reativo'} por</span>
                      <div className="bp-transport-unit-options">
                        {getTransportUnits(transportMaterial).map((unit) => (
                          <button
                            type="button"
                            key={unit}
                            role="radio"
                            aria-checked={transportUnit === unit}
                            data-testid={`transport-unit-${unit}`}
                            className={transportUnit === unit ? 'is-selected' : ''}
                            onClick={() => {
                              setTransportUnit(unit);
                              setTransportQuantity((prev) => {
                                if (!prev) return prev;
                                if (unit === 'bigbags') return String(parseTons(prev) || '').replace('NaN', '');
                                return formatTonsInput(prev);
                              });
                              setTransportError('');
                            }}
                          >
                            {unit === 'bigbags' ? 'BigBags' : 'Peso (t)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="bp-transport-label" htmlFor="transport-quantity">
                    Quantidade total planejada para este ponto
                  </label>
                  <div className="bp-transport-quantity-wrap">
                    <input
                      id="transport-quantity"
                      data-testid="transport-quantity"
                      type={transportUnit === 'bigbags' ? 'number' : 'text'}
                      min="0"
                      step={transportUnit === 'bigbags' ? 1 : 0.01}
                      inputMode={transportUnit === 'bigbags' ? 'numeric' : 'decimal'}
                      placeholder={transportUnit === 'bigbags' ? 'Ex: 24' : 'Ex: 22.300 ou 18,50'}
                      value={transportQuantity}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setTransportQuantity(transportUnit === 'bigbags' ? raw : formatTonsInput(raw));
                        setTransportError('');
                      }}
                    />
                    <span>{transportUnit === 'bigbags' ? 'BigBags' : 'toneladas'}</span>
                  </div>
                  {transportError && <div className="bp-transport-error" role="alert">{transportError}</div>}
                  {transportMaterial === 'adubo' && (
                    <label className="bp-transport-formula-field" htmlFor="transport-formula">
                      Fórmula do Adubo <span className="bp-transport-label-hint">opcional</span>
                      <input
                        id="transport-formula"
                        data-testid="transport-formula"
                        type="text"
                        value={transportFormula}
                        onChange={(e) => setTransportFormula(e.target.value)}
                        placeholder="Ex.: 18-04-18"
                        autoComplete="off"
                        maxLength={40}
                      />
                      <small>Informe a composição para identificar a carga no ponto.</small>
                    </label>
                  )}
                  <div className="bp-transport-help">
                    {transportUnit === 'bigbags'
                      ? 'O Reativo será controlado em BigBags inteiros.'
                      : transportMaterial === 'reativo_bigbag'
                        ? 'O Reativo será controlado por peso em toneladas.'
                        : transportMaterial === 'adubo'
                          ? 'O Adubo será controlado em toneladas; a fórmula fica visível no resumo.'
                          : 'Informe o peso total da carga em toneladas.'}
                  </div>
                </div>
              )}

              {/* Nome do implemento agrícola */}
              {category === 'implemento' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,158,11,0.85)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Nome Implemento Agr.
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Trator, Plantadeira, Pulverizador..."
                    value={implementoAgr}
                    onChange={(e) => setImplementoAgr(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 12,
                      background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
                      color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* ── FOTO (com compressão automática) ── */}
              <div style={{
                borderRadius: 14,
                border: `1px dashed ${photo ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.18)'}`,
                background: photo ? 'rgba(96,165,250,0.06)' : 'rgba(255,255,255,0.03)',
                padding: 12,
              }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(96,165,250,0.9)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Camera size={13} /> Foto do local
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    — comprimida para economizar espaço
                  </span>
                </label>

                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />

                {photoProcessing ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                    <Loader2 size={16} className="bp-spin" /> Comprimindo foto...
                  </div>
                ) : photo ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <img src={photo} alt="Prévia" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                        Foto pronta
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        {formatBytes(photoBytes)} · será visível a todos
                      </div>
                    </div>
                    <button onClick={() => setPhoto('')} style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                      color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} title="Remover foto">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => cameraInputRef.current?.click()} style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'rgba(96,165,250,0.14)', border: '1px solid rgba(96,165,250,0.3)',
                      color: '#60a5fa', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}>
                      <Camera size={15} /> Tirar Foto
                    </button>
                    <button onClick={() => galleryInputRef.current?.click()} style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}>
                      <ImageIcon size={15} /> Galeria
                    </button>
                  </div>
                )}
              </div>

              {/* Título */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Título
                </label>
                <input
                  type="text"
                  placeholder="Ex: Pegador de água da represa norte"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Mensagem customizada */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(139,92,246,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Mensagem Especial <span style={{ color: 'rgba(139,92,246,0.5)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— opcional para compartilhar junto</span>
                </label>
                <textarea
                  placeholder="Mensagem especial opcional para este POI..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
                    color: 'white', fontSize: 13, outline: 'none', resize: 'none',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 14,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddPOI}
                  disabled={photoProcessing || submitting}
                  data-testid="submit-poi-btn"
                  style={{
                    flex: 2, padding: '12px 0', borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(173,255,47,0.2), rgba(173,255,47,0.1))',
                    border: '1px solid rgba(173,255,47,0.4)',
                    color: '#ADFF2F', fontWeight: 800, fontSize: 14,
                    cursor: (photoProcessing || submitting) ? 'not-allowed' : 'pointer', opacity: (photoProcessing || submitting) ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Plus size={16} />
                  {isAlert ? 'Publicar Alerta' : 'Adicionar Marcação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
