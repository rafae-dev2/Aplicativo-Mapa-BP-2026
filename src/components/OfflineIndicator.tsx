import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import {
  getOfflineSyncState,
  initOfflineQueue,
  pendingCount as getPendingCount,
  subscribeOfflineQueue,
  subscribeOfflineSyncState,
  type OfflineSyncState,
} from '@/lib/offlineQueue';
import {
  networkQualityMonitor,
  type NetworkQualityState,
  type NetworkTransition,
} from '@/lib/networkQualityMonitor';

/**
 * Monitora o estado de conectividade do navegador (navigator.onLine + eventos online/offline).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * OfflineIndicator — Notificação discreta no cabeçalho que monitora navigator.onLine,
 * qualidade da conexão (ex.: troca 4G → Wi-Fi / latência instável) e o estado em
 * tempo real da fila IndexedDB:
 *  1. Sem rede: exibe "Modo Offline Ativo" (+ contador de pendências no IndexedDB).
 *  2. Latência instável com pendências: avisa que a sincronização foi pausada
 *     automaticamente preservando os itens no IndexedDB, com opção "Tentar".
 *  3. Enviando fila IndexedDB em lote (ou retry exponencial): exibe ícone animado + "Sincronizando...".
 *  4. Pós-envio: exibe confirmação breve de alterações sincronizadas.
 *  5. Transição de rede (ex.: 4G → Wi-Fi): notificação sutil temporária.
 */
export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState<number>(() => getPendingCount());
  const [syncState, setSyncState] = useState<OfflineSyncState>(() => getOfflineSyncState());
  const [netQuality, setNetQuality] = useState<NetworkQualityState>(() => networkQualityMonitor.getState());
  const [justSyncedCount, setJustSyncedCount] = useState<number>(0);
  const [recentTransition, setRecentTransition] = useState<NetworkTransition | null>(null);

  useEffect(() => {
    let active = true;
    void initOfflineQueue().then((ops) => {
      if (active) setQueuedCount(ops.length);
    });
    const unsubQueue = subscribeOfflineQueue((ops) => {
      if (active) setQueuedCount(ops.length);
    });
    const unsubSync = subscribeOfflineSyncState((nextState) => {
      if (active) setSyncState(nextState);
    });

    let transitionTimer: number | null = null;
    const unsubNet = networkQualityMonitor.subscribe((nextQuality) => {
      if (!active) return;
      setNetQuality(nextQuality);
      if (
        nextQuality.online &&
        !nextQuality.shouldPauseSync &&
        nextQuality.lastTransition &&
        nextQuality.lastTransition.fromLabel !== nextQuality.lastTransition.toLabel &&
        nextQuality.lastTransition.fromLabel !== 'Offline'
      ) {
        setRecentTransition(nextQuality.lastTransition);
        if (transitionTimer) window.clearTimeout(transitionTimer);
        transitionTimer = window.setTimeout(() => setRecentTransition(null), 3600);
      }
    });

    let syncedTimer: number | null = null;
    const handleSynced = (event: Event) => {
      const detail = (event as CustomEvent<{ flushed?: number }>).detail;
      const flushed = Number(detail?.flushed || 0);
      if (flushed > 0) {
        setJustSyncedCount(flushed);
        if (syncedTimer) window.clearTimeout(syncedTimer);
        syncedTimer = window.setTimeout(() => setJustSyncedCount(0), 3800);
      }
    };

    window.addEventListener('bp-offline-queue-synced', handleSynced);
    return () => {
      active = false;
      unsubQueue();
      unsubSync();
      unsubNet();
      window.removeEventListener('bp-offline-queue-synced', handleSynced);
      if (syncedTimer) window.clearTimeout(syncedTimer);
      if (transitionTimer) window.clearTimeout(transitionTimer);
    };
  }, []);

  const handleForceRetry = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bp-force-sync-now', { detail: { ignoreLatencyPause: true } })
      );
    }
  };

  // Estado 1: Offline — prioridade máxima quando a rede estiver indisponível
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="header-offline-indicator"
        title={
          queuedCount > 0
            ? `Modo Offline Ativo — ${queuedCount} ${queuedCount === 1 ? 'item na fila IndexedDB aguardando conexão' : 'itens na fila IndexedDB aguardando conexão'}`
            : 'Modo Offline Ativo — operando com mapas e dados salvos no aparelho'
        }
        className="fixed left-1/2 top-[56px] -translate-x-1/2 md:static md:top-auto md:left-auto md:translate-x-0 z-50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 md:py-1 text-[10.5px] md:text-[11px] font-semibold tracking-tight whitespace-nowrap select-none"
        style={{
          background: 'rgba(38, 26, 8, 0.92)',
          border: '1px solid rgba(251, 191, 36, 0.5)',
          color: '#fde68a',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"
        />
        <WifiOff size={13} strokeWidth={2.35} className="shrink-0" aria-hidden="true" />
        <span>Modo Offline Ativo</span>
        {queuedCount > 0 && (
          <span
            data-testid="header-offline-pending-count"
            className="ml-0.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold"
            style={{
              background: 'rgba(251, 191, 36, 0.22)',
              color: '#fef3c7',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {queuedCount}
          </span>
        )}
      </div>
    );
  }

  // Estado 2: Online, mas sincronização pausada automaticamente por latência instável
  const isPausedForLatency =
    (syncState.pausedForLatency && queuedCount > 0) ||
    (netQuality.shouldPauseSync && queuedCount > 0 && !syncState.syncing);

  if (isPausedForLatency) {
    const pauseTooltip = `${syncState.pauseReason || netQuality.pauseReason || 'Latência instável detectada'} (${queuedCount} ${queuedCount === 1 ? 'item preservado' : 'itens preservados'} no IndexedDB).`;

    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="header-sync-paused-indicator"
        title={pauseTooltip}
        className="fixed left-1/2 top-[56px] -translate-x-1/2 md:static md:top-auto md:left-auto md:translate-x-0 z-50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 md:py-1 text-[10.5px] md:text-[11px] font-semibold tracking-tight whitespace-nowrap select-none"
        style={{
          background: 'rgba(54, 24, 9, 0.94)',
          border: '1px solid rgba(251, 146, 60, 0.55)',
          color: '#fed7aa',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <AlertTriangle size={13} strokeWidth={2.4} className="shrink-0 text-orange-400" aria-hidden="true" />
        <span>Sync pausado</span>
        <span
          data-testid="header-sync-paused-reason"
          className="rounded-full px-1.5 py-[1px] text-[10px] font-bold"
          style={{
            background: 'rgba(251, 146, 60, 0.22)',
            color: '#ffedd5',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          latência · {queuedCount}
        </span>
        <button
          type="button"
          onClick={handleForceRetry}
          data-testid="header-sync-retry-now"
          aria-label="Tentar sincronizar agora"
          className="ml-0.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold cursor-pointer transition-colors hover:bg-orange-400/30"
          style={{
            background: 'rgba(255, 237, 213, 0.14)',
            color: '#fff7ed',
          }}
        >
          Tentar
        </button>
      </div>
    );
  }

  // Estado 3: Online + enviando itens persistidos no IndexedDB para o servidor (lote ou retry exponencial)
  if (syncState.syncing) {
    const isRetrying = Boolean(syncState.retryAttempt && syncState.retryAttempt > 1);
    const progressLabel = isRetrying
      ? `retry ${syncState.retryAttempt}/${syncState.maxRetryAttempts || 4}`
      : syncState.total > 1
        ? syncState.batchMode
          ? `lote · ${syncState.total}`
          : `${Math.min(syncState.completed + 1, syncState.total)}/${syncState.total}`
        : null;

    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="header-syncing-indicator"
        title={
          isRetrying
            ? `Reenviando lote do IndexedDB (tentativa ${syncState.retryAttempt} de ${syncState.maxRetryAttempts || 4} com backoff exponencial)`
            : syncState.batchMode
              ? `Sincronizando lote único com ${syncState.total} ${syncState.total === 1 ? 'item' : 'itens'} do IndexedDB com o servidor`
              : syncState.currentTitle
                ? `Sincronizando ${syncState.currentTitle} do IndexedDB com o servidor`
                : 'Sincronizando alterações salvas no IndexedDB com o servidor'
        }
        className="fixed left-1/2 top-[56px] -translate-x-1/2 md:static md:top-auto md:left-auto md:translate-x-0 z-50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 md:py-1 text-[10.5px] md:text-[11px] font-semibold tracking-tight whitespace-nowrap select-none"
        style={{
          background: 'rgba(12, 34, 52, 0.92)',
          border: '1px solid rgba(56, 189, 248, 0.5)',
          color: '#bae6fd',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <RefreshCw
          size={13}
          strokeWidth={2.4}
          data-testid="header-syncing-icon"
          className="animate-spin shrink-0 text-sky-300"
          aria-hidden="true"
        />
        <span>Sincronizando...</span>
        {progressLabel && (
          <span
            data-testid="header-syncing-progress"
            className="ml-0.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold"
            style={{
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#e0f2fe',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {progressLabel}
          </span>
        )}
      </div>
    );
  }

  // Estado 4: Confirmação breve logo após concluir o envio do IndexedDB
  if (justSyncedCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="header-sync-confirmed"
        className="fixed left-1/2 top-[56px] -translate-x-1/2 md:static md:top-auto md:left-auto md:translate-x-0 z-50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 md:py-1 text-[10.5px] md:text-[11px] font-semibold tracking-tight whitespace-nowrap select-none"
        style={{
          background: 'rgba(16, 42, 30, 0.92)',
          border: '1px solid rgba(74, 222, 128, 0.48)',
          color: '#86efac',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <CheckCircle2 size={13} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
        <span>
          {justSyncedCount === 1
            ? '1 alteração sincronizada'
            : `${justSyncedCount} alterações sincronizadas`}
        </span>
      </div>
    );
  }

  // Estado 5: Aviso breve e discreto de troca de conexão (ex.: 4G → Wi-Fi)
  if (recentTransition) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="header-network-transition"
        className="fixed left-1/2 top-[56px] -translate-x-1/2 md:static md:top-auto md:left-auto md:translate-x-0 z-50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 md:py-1 text-[10.5px] md:text-[11px] font-semibold tracking-tight whitespace-nowrap select-none"
        style={{
          background: 'rgba(15, 29, 46, 0.92)',
          border: '1px solid rgba(148, 163, 184, 0.42)',
          color: '#e2e8f0',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.26)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <Wifi size={13} strokeWidth={2.3} className="shrink-0 text-emerald-300" aria-hidden="true" />
        <span>
          Rede: {recentTransition.fromLabel} → {recentTransition.toLabel}
        </span>
      </div>
    );
  }

  return null;
}
