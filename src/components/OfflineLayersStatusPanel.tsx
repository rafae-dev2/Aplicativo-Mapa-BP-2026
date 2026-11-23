import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  RefreshCw,
  HardDriveDownload,
  WifiOff,
  ShieldCheck,
} from 'lucide-react';
import {
  inspectOfflineLayersStatus,
  syncAllOfflineLayers,
  type OfflineLayersSummary,
  type LayerCacheState,
} from '@/lib/offlineLayersStatus';

interface OfflineLayersStatusPanelProps {
  isOpen: boolean;
}

function getLayerStatusMeta(state: LayerCacheState) {
  if (state === 'cached') {
    return {
      text: 'Em cache',
      color: '#4ade80',
      Icon: CheckCircle2,
    };
  }
  if (state === 'partial') {
    return {
      text: 'Parcial',
      color: '#fbbf24',
      Icon: AlertCircle,
    };
  }
  return {
    text: 'Pendente',
    color: '#94a3b8',
    Icon: CircleDashed,
  };
}

/**
 * Painel compacto de prontidão offline no menu lateral.
 * Mostra exatamente quais camadas de dados (IndexedDB e Cache Storage) estão
 * armazenadas para operação no campo sem internet, sem poluição visual.
 */
export default function OfflineLayersStatusPanel({ isOpen }: OfflineLayersStatusPanelProps) {
  const [summary, setSummary] = useState<OfflineLayersSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await inspectOfflineLayersStatus();
      setSummary(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();

    const handleNetChange = () => {
      void refresh();
    };
    window.addEventListener('online', handleNetChange);
    window.addEventListener('offline', handleNetChange);
    return () => {
      window.removeEventListener('online', handleNetChange);
      window.removeEventListener('offline', handleNetChange);
    };
  }, [isOpen, refresh]);

  const handleSyncAll = async () => {
    if (syncing || summary?.online === false) return;
    setSyncing(true);
    try {
      const next = await syncAllOfflineLayers();
      setSummary(next);
    } finally {
      setSyncing(false);
    }
  };

  const readinessColor = summary?.readyForField
    ? '#4ade80'
    : summary && summary.readinessPercent >= 60
      ? '#fbbf24'
      : '#f87171';

  return (
    <section
      aria-label="Status de sincronização offline das camadas"
      data-testid="sidebar-offline-layers-panel"
      className="px-4 py-3 border-b border-white/10"
    >
      {/* Cabeçalho de prontidão */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {summary && !summary.online ? (
              <WifiOff size={14} className="shrink-0 text-amber-400" aria-hidden="true" />
            ) : (
              <ShieldCheck size={14} className="shrink-0" style={{ color: readinessColor }} aria-hidden="true" />
            )}
            <h3 className="text-[13px] font-semibold text-white/95 truncate">
              {summary ? summary.headline : 'Verificando cache offline...'}
            </h3>
          </div>
          <p className="text-[11px] text-white/55 mt-0.5 leading-snug">
            {summary ? summary.subline : 'Consultando IndexedDB e Cache Storage'}
          </p>
        </div>

        <button
          type="button"
          data-testid="refresh-offline-layers-btn"
          onClick={() => void refresh()}
          disabled={loading || syncing}
          title="Reverificar camadas em cache"
          aria-label="Reverificar camadas em cache"
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 bg-white/5 text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-45"
        >
          <RefreshCw size={13} className={loading || syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Barra de progresso + métrica tabular */}
      {summary && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[11px] text-white/60 tabular-nums">
            <span>
              {summary.cachedEssentialCount}/{summary.totalEssentialCount} camadas essenciais
            </span>
            <span className="font-semibold" style={{ color: readinessColor }}>
              {summary.readinessPercent}%
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={summary.readinessPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso de camadas salvas para uso offline"
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${summary.readinessPercent}%`,
                backgroundColor: readinessColor,
              }}
            />
          </div>
        </div>
      )}

      {/* Lista limpa de camadas com divisores sutis */}
      <ul className="mt-3 divide-y divide-white/[0.07]" data-testid="offline-layers-list">
        {loading && !summary
          ? Array.from({ length: 5 }).map((_, idx) => (
              <li key={idx} className="py-2 flex items-center justify-between gap-2">
                <div className="h-3 w-36 rounded bg-white/10" />
                <div className="h-3 w-14 rounded bg-white/10" />
              </li>
            ))
          : summary?.layers.map((layer) => {
              const meta = getLayerStatusMeta(layer.state);
              const StatusIcon = meta.Icon;
              return (
                <li
                  key={layer.id}
                  data-testid={`offline-layer-${layer.id}`}
                  data-layer-state={layer.state}
                  className="py-2 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-white/90 leading-tight truncate">
                      {layer.label}
                    </div>
                    <div className="text-[11px] text-white/50 mt-0.5 leading-tight tabular-nums truncate">
                      {layer.detail}
                      <span aria-hidden="true"> · </span>
                      {layer.storage}
                    </div>
                  </div>

                  <div
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap pt-0.5"
                    style={{ color: meta.color }}
                  >
                    <StatusIcon size={12} aria-hidden="true" />
                    <span>{meta.text}</span>
                  </div>
                </li>
              );
            })}
      </ul>

      {/* Rodapé de ação e espaço ocupado */}
      {summary && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex items-center justify-between gap-2">
          <div className="text-[11px] text-white/45 tabular-nums truncate">
            {summary.estimatedUsageLabel ? `Uso local: ${summary.estimatedUsageLabel}` : 'Cache local ativo'}
          </div>

          <button
            type="button"
            data-testid="sync-offline-layers-btn"
            onClick={() => void handleSyncAll()}
            disabled={syncing || !summary.online}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              background: summary.online ? 'rgba(173, 255, 47, 0.14)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${summary.online ? 'rgba(173, 255, 47, 0.34)' : 'rgba(255, 255, 255, 0.12)'}`,
              color: summary.online ? '#d9f99d' : 'rgba(255, 255, 255, 0.45)',
            }}
          >
            <HardDriveDownload size={12} aria-hidden="true" />
            <span>
              {syncing
                ? 'Sincronizando...'
                : !summary.online
                  ? 'Sem conexão'
                  : summary.readyForField
                    ? 'Atualizar cache'
                    : 'Preparar offline'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
