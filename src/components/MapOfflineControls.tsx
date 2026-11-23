import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DownloadCloud,
  CloudOff,
  Wifi,
  WifiOff,
  X,
  Check,
  Loader2,
  MapPin,
  Trash2,
  Navigation,
  RefreshCw,
  HardDrive,
  Layers,
  Satellite,
  ShieldCheck,
} from 'lucide-react';
import { MAP_CONFIG } from '@/config/constants';
import {
  QUALITY_PRESETS,
  type OfflineBaseMode,
  type OfflineBounds,
  type OfflineCacheStats,
  type OfflineDownloadProgress,
  type OfflineQualityPreset,
  type SavedOfflineRegion,
  clearOfflineTileCaches,
  downloadOfflineRegionPack,
  formatStorageSize,
  getOfflineCacheStats,
  removeOfflineRegionRecord,
} from '@/lib/offlineMapEngine';

interface Props {
  mapRef: React.RefObject<any>;
  geojsonData?: any;
  labelsData?: any;
  farmBounds?: [[number, number], [number, number]] | null;
  poiCount?: number;
  pendingSyncCount?: number;
  onForceSync?: () => void;
  isOnline: boolean;
  offlineModeEnabled: boolean;
  onToggleOfflineMode: (enabled: boolean) => void;
  offlineBaseMode: OfflineBaseMode;
  onChangeOfflineBaseMode: (mode: OfflineBaseMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_FARM_BOUNDS: OfflineBounds = {
  west: -51.32,
  south: -21.72,
  east: -50.68,
  north: -21.18,
};

function formatDateShort(ts: number): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

export default function MapOfflineControls({
  mapRef,
  geojsonData,
  labelsData,
  farmBounds,
  poiCount = 0,
  pendingSyncCount = 0,
  onForceSync,
  isOnline,
  offlineModeEnabled,
  onToggleOfflineMode,
  offlineBaseMode,
  onChangeOfflineBaseMode,
  open,
  onOpenChange,
}: Props) {
  const [preset, setPreset] = useState<OfflineQualityPreset>('fast');
  const [stats, setStats] = useState<OfflineCacheStats | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadLabel, setDownloadLabel] = useState('');
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const farmFeatureCount = Array.isArray(geojsonData?.features) ? geojsonData.features.length : 0;
  const effectiveOffline = !isOnline || offlineModeEnabled;

  const refreshStats = useCallback(async () => {
    const next = await getOfflineCacheStats(farmFeatureCount);
    setStats(next);
  }, [farmFeatureCount]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats, open, isOnline]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !downloading) onOpenChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, downloading, onOpenChange]);

  const showFeedback = useCallback((kind: 'success' | 'warning' | 'error', text: string) => {
    setFeedback({ kind, text });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  }, []);

  const runPackDownload = useCallback(
    async (scope: 'viewport' | 'all-farms') => {
      if (downloading) return;
      if (!navigator.onLine) {
        showFeedback(
          'warning',
          'Sem conexão para baixar novos blocos. O mapa cartográfico e os dados salvos já estão ativos offline.'
        );
        return;
      }

      const map = mapRef.current?.getMap?.() ? mapRef.current.getMap() : mapRef.current;
      let bounds: OfflineBounds = DEFAULT_FARM_BOUNDS;
      let center: [number, number] = [MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat];
      let zoom: number = MAP_CONFIG.DEFAULT_ZOOM;
      let name = 'Fazendas Branco Peres (Completo)';

      if (scope === 'all-farms' && farmBounds) {
        const [[west, south], [east, north]] = farmBounds;
        bounds = { west, south, east, north };
        center = [(west + east) / 2, (south + north) / 2];
        zoom = 11.5;
      } else if (scope === 'viewport' && map?.getBounds) {
        const b = map.getBounds();
        bounds = {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        };
        const c = map.getCenter();
        center = [c.lng, c.lat];
        zoom = Math.round((map.getZoom() || 12) * 10) / 10;
        name = `Área da tela (Zoom ${zoom.toFixed(0)})`;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setDownloading(true);
      setDownloadLabel(name);
      setFeedback(null);
      setProgress({
        completed: 0,
        total: 1,
        downloaded: 0,
        cachedHits: 0,
        failed: 0,
        percent: 0,
        stage: 'preparing',
      });

      try {
        const result = await downloadOfflineRegionPack({
          name,
          bounds,
          center,
          zoom,
          preset,
          accessToken: MAP_CONFIG.MAPBOX_ACCESS_TOKEN,
          geojsonData,
          labelsData,
          signal: controller.signal,
          onProgress: (p) => setProgress(p),
        });

        await refreshStats();

        if (result.cancelled) {
          showFeedback('warning', 'Download cancelado. Os blocos já baixados foram mantidos no aparelho.');
        } else {
          const totalSaved = result.downloaded + result.cachedHits;
          showFeedback(
            'success',
            `${name} salva no aparelho (${totalSaved} blocos + ${farmFeatureCount} talhões prontos offline).`
          );
        }
      } catch {
        showFeedback('error', 'Não foi possível concluir o download agora. Verifique sua conexão e tente novamente.');
      } finally {
        abortControllerRef.current = null;
        setDownloading(false);
      }
    },
    [downloading, farmBounds, farmFeatureCount, geojsonData, labelsData, mapRef, preset, refreshStats, showFeedback]
  );

  const handleCancelDownload = () => {
    abortControllerRef.current?.abort();
  };

  const handleFlyToRegion = (region: SavedOfflineRegion) => {
    const map = mapRef.current?.getMap?.() ? mapRef.current.getMap() : mapRef.current;
    try {
      map?.flyTo?.({
        center: region.center,
        zoom: Math.max(11, Math.min(15, region.zoom || 12)),
        duration: 1200,
      });
    } catch {
      /* noop */
    }
    onOpenChange(false);
  };

  const handleDeleteRegion = async (regionId: string) => {
    removeOfflineRegionRecord(regionId);
    await refreshStats();
  };

  const handleClearTileCache = async () => {
    await clearOfflineTileCaches();
    await refreshStats();
    showFeedback('success', 'Blocos de imagem em cache removidos. Talhões e marcações locais preservados.');
  };

  const stageLabel =
    progress?.stage === 'preparing'
      ? 'Preparando pacote offline…'
      : progress?.stage === 'data'
        ? 'Salvando talhões e rótulos no aparelho…'
        : progress?.stage === 'tiles'
          ? `Salvando imagens do mapa (${progress.completed}/${progress.total})…`
          : 'Concluído';

  return (
    <>
      {/* Indicador compacto no rodapé quando Modo Offline forçado estiver ativo com rede (quando sem rede, o OfflineIndicator do cabeçalho já assume) */}
      {isOnline && offlineModeEnabled && !open && (
        <button
          type="button"
          data-testid="map-offline-badge"
          onClick={() => onOpenChange(true)}
          style={{
            position: 'fixed',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 55,
            minHeight: 38,
            maxWidth: 'calc(100vw - 110px)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            borderRadius: 999,
            background: !isOnline ? 'rgba(245, 158, 11, 0.20)' : 'var(--bp-panel-bg)',
            border: `1px solid ${!isOnline ? 'rgba(251, 191, 36, 0.55)' : 'var(--bp-accent-border)'}`,
            color: !isOnline ? '#fde68a' : 'var(--bp-accent)',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: 0.15,
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.42)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title="Abrir Central do Mapa Offline"
        >
          <WifiOff size={14} style={{ flexShrink: 0 }} />
          <span>
            {!isOnline
              ? 'Sem internet · Mapa offline ativo'
              : offlineBaseMode === 'cartographic'
                ? 'Modo offline · Cartográfico local'
                : 'Modo offline · Satélite em cache'}
          </span>
        </button>
      )}

      {/* Modal Central do Mapa Offline */}
      {open && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !downloading) onOpenChange(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9990,
            background: 'var(--bp-overlay)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 14,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Central do Mapa Offline"
            data-testid="offline-center-modal"
            className="glass-liquid-strong"
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: 'min(88dvh, 720px)',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 22,
              background: 'var(--bp-panel-bg)',
              border: '1px solid var(--bp-glass-border-accent)',
              boxShadow: 'var(--bp-glass-shadow)',
              color: 'var(--bp-panel-text)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 18px 14px',
                borderBottom: '1px solid var(--bp-glass-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  background: effectiveOffline ? 'rgba(245,158,11,0.16)' : 'var(--bp-accent-soft)',
                  border: `1px solid ${effectiveOffline ? 'rgba(251,191,36,0.42)' : 'var(--bp-accent-border)'}`,
                  color: effectiveOffline ? '#fbbf24' : 'var(--bp-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {effectiveOffline ? <CloudOff size={20} /> : <ShieldCheck size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bp-heading)', lineHeight: 1.2 }}>
                  Central do Mapa Offline
                </div>
                <div
                  data-testid="offline-connection-status"
                  style={{
                    fontSize: 12,
                    color: !isOnline ? '#fbbf24' : 'var(--bp-panel-muted)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                  <span>
                    {!isOnline
                      ? 'Sem internet · Dados locais ativos'
                      : offlineModeEnabled
                        ? 'Conectado · Modo offline ativo'
                        : 'Conectado · Pronto para salvar'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="offline-center-close"
                disabled={downloading}
                onClick={() => onOpenChange(false)}
                aria-label="Fechar Central do Mapa Offline"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bp-input-bg)',
                  border: '1px solid var(--bp-glass-border)',
                  color: 'var(--bp-panel-muted)',
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  opacity: downloading ? 0.45 : 1,
                  flexShrink: 0,
                }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ padding: '16px 18px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Real Offline Readiness Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: '10px 11px',
                    borderRadius: 13,
                    background: 'var(--bp-input-bg)',
                    border: '1px solid var(--bp-glass-border)',
                  }}
                >
                  <div style={{ fontSize: 10.5, color: 'var(--bp-panel-muted)', fontWeight: 600 }}>Talhões locais</div>
                  <div
                    data-testid="offline-stat-farms"
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--bp-heading)',
                      marginTop: 3,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {farmFeatureCount.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: 10, color: stats?.hasMapData || farmFeatureCount > 0 ? 'var(--bp-accent)' : 'var(--bp-panel-muted)', marginTop: 2 }}>
                    {stats?.hasMapData || farmFeatureCount > 0 ? 'Salvos offline' : 'Carregando'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '10px 11px',
                    borderRadius: 13,
                    background: 'var(--bp-input-bg)',
                    border: '1px solid var(--bp-glass-border)',
                  }}
                >
                  <div style={{ fontSize: 10.5, color: 'var(--bp-panel-muted)', fontWeight: 600 }}>Blocos mapa</div>
                  <div
                    data-testid="offline-stat-tiles"
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--bp-heading)',
                      marginTop: 3,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {(stats?.tileCount ?? 0).toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--bp-panel-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {stats?.estimatedUsageBytes != null
                      ? formatStorageSize(stats.estimatedUsageBytes)
                      : 'Em cache'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '10px 11px',
                    borderRadius: 13,
                    background: 'var(--bp-input-bg)',
                    border: '1px solid var(--bp-glass-border)',
                  }}
                >
                  <div style={{ fontSize: 10.5, color: 'var(--bp-panel-muted)', fontWeight: 600 }}>Marcações</div>
                  <div
                    data-testid="offline-stat-pois"
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--bp-heading)',
                      marginTop: 3,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {poiCount.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: 10, color: pendingSyncCount > 0 ? '#fbbf24' : 'var(--bp-panel-muted)', marginTop: 2 }}>
                    {pendingSyncCount > 0 ? `${pendingSyncCount} pendente${pendingSyncCount > 1 ? 's' : ''}` : 'Sincronizadas'}
                  </div>
                </div>
              </div>

              {/* Pending offline queue banner if edits are queued */}
              {pendingSyncCount > 0 && isOnline && onForceSync && (
                <button
                  type="button"
                  onClick={onForceSync}
                  style={{
                    width: '100%',
                    minHeight: 42,
                    padding: '9px 12px',
                    borderRadius: 12,
                    background: 'rgba(245,158,11,0.16)',
                    border: '1px solid rgba(251,191,36,0.4)',
                    color: '#fbbf24',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} />
                  Enviar {pendingSyncCount} alteração{pendingSyncCount > 1 ? 'ões' : ''} feita{pendingSyncCount > 1 ? 's' : ''} offline agora
                </button>
              )}

              {/* Modo Offline no Campo + Estilo Base Offline */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 15,
                  background: 'var(--bp-input-bg)',
                  border: '1px solid var(--bp-glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  data-testid="offline-mode-toggle"
                  aria-pressed={offlineModeEnabled}
                  onClick={() => onToggleOfflineMode(!offlineModeEnabled)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--bp-panel-text)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bp-heading)' }}>
                      Modo Offline no Campo
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--bp-panel-muted)', marginTop: 2, lineHeight: 1.35 }}>
                      Ativa automaticamente sem sinal ou ligue aqui para economizar dados e navegar 100% local.
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 42,
                      height: 24,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: effectiveOffline ? 'var(--bp-accent)' : 'rgba(148,163,184,0.34)',
                      position: 'relative',
                      transition: 'background 180ms ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: effectiveOffline ? 21 : 3,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: effectiveOffline ? 'var(--bp-accent-contrast)' : '#ffffff',
                        transition: 'left 180ms ease',
                      }}
                    />
                  </span>
                </button>

                {/* Base style choice for offline */}
                <div style={{ borderTop: '1px solid var(--bp-glass-border)', paddingTop: 11 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bp-panel-muted)', marginBottom: 7 }}>
                    Visualização quando estiver offline
                  </div>
                  <div
                    data-testid="offline-base-selector"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 6,
                      padding: 4,
                      borderRadius: 12,
                      background: 'rgba(0,0,0,0.18)',
                      border: '1px solid var(--bp-glass-border)',
                    }}
                  >
                    <button
                      type="button"
                      data-testid="offline-base-cartographic"
                      aria-pressed={offlineBaseMode === 'cartographic'}
                      onClick={() => onChangeOfflineBaseMode('cartographic')}
                      style={{
                        minHeight: 38,
                        padding: '7px 10px',
                        borderRadius: 9,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        background: offlineBaseMode === 'cartographic' ? 'var(--bp-accent)' : 'transparent',
                        color: offlineBaseMode === 'cartographic' ? 'var(--bp-accent-contrast)' : 'var(--bp-panel-text)',
                      }}
                    >
                      <Layers size={14} />
                      Cartográfico local
                    </button>
                    <button
                      type="button"
                      data-testid="offline-base-satellite"
                      aria-pressed={offlineBaseMode === 'cached-satellite'}
                      onClick={() => onChangeOfflineBaseMode('cached-satellite')}
                      style={{
                        minHeight: 38,
                        padding: '7px 10px',
                        borderRadius: 9,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        background: offlineBaseMode === 'cached-satellite' ? 'var(--bp-accent)' : 'transparent',
                        color: offlineBaseMode === 'cached-satellite' ? 'var(--bp-accent-contrast)' : 'var(--bp-panel-text)',
                      }}
                    >
                      <Satellite size={14} />
                      Satélite em cache
                    </button>
                  </div>
                </div>
              </div>

              {/* Download de Mapas para Uso Sem Internet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 10px' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--bp-heading)' }}>
                    Baixar satélite no aparelho
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--bp-panel-muted)' }}>
                    {QUALITY_PRESETS[preset].description}
                  </span>
                </div>

                {/* Preset segmented bar */}
                <div
                  role="group"
                  aria-label="Nível de detalhe do download"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    padding: 4,
                    borderRadius: 12,
                    background: 'var(--bp-input-bg)',
                    border: '1px solid var(--bp-glass-border)',
                  }}
                >
                  {(['fast', 'field', 'detailed'] as OfflineQualityPreset[]).map((key) => {
                    const active = preset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        data-testid={`offline-preset-${key}`}
                        disabled={downloading}
                        onClick={() => setPreset(key)}
                        style={{
                          minHeight: 36,
                          padding: '6px 8px',
                          borderRadius: 9,
                          border: 'none',
                          cursor: downloading ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 700,
                          background: active ? 'var(--bp-accent-soft)' : 'transparent',
                          color: active ? 'var(--bp-accent)' : 'var(--bp-panel-muted)',
                          outline: active ? '1px solid var(--bp-accent-border)' : 'none',
                        }}
                      >
                        {QUALITY_PRESETS[key].label}
                      </button>
                    );
                  })}
                </div>

                {/* Progress panel while downloading */}
                {downloading && progress && (
                  <div
                    data-testid="offline-download-progress"
                    style={{
                      padding: 13,
                      borderRadius: 14,
                      background: 'var(--bp-accent-soft)',
                      border: '1px solid var(--bp-accent-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Loader2 size={15} className="animate-spin" style={{ color: 'var(--bp-accent)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bp-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {downloadLabel}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--bp-accent)', fontVariantNumeric: 'tabular-nums' }}>
                        {progress.percent}%
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.22)', overflow: 'hidden' }}>
                      <div
                        data-testid="download-progress-bar"
                        style={{
                          height: '100%',
                          width: `${progress.percent}%`,
                          background: 'var(--bp-accent)',
                          transition: 'width 180ms ease',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--bp-panel-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {stageLabel}
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelDownload}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: 'rgba(239,68,68,0.16)',
                          border: '1px solid rgba(239,68,68,0.35)',
                          color: '#f87171',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline feedback (no window.alert) */}
                {feedback && (
                  <div
                    role="status"
                    data-testid="offline-feedback"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.4,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      background:
                        feedback.kind === 'success'
                          ? 'rgba(34,197,94,0.14)'
                          : feedback.kind === 'warning'
                            ? 'rgba(245,158,11,0.14)'
                            : 'rgba(239,68,68,0.14)',
                      border: `1px solid ${
                        feedback.kind === 'success'
                          ? 'rgba(74,222,128,0.36)'
                          : feedback.kind === 'warning'
                            ? 'rgba(251,191,36,0.38)'
                            : 'rgba(248,113,113,0.38)'
                      }`,
                      color:
                        feedback.kind === 'success'
                          ? '#4ade80'
                          : feedback.kind === 'warning'
                            ? '#fbbf24'
                            : '#f87171',
                    }}
                  >
                    <Check size={15} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>{feedback.text}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    data-testid="offline-download-all-btn"
                    disabled={downloading}
                    onClick={() => void runPackDownload('all-farms')}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '10px 14px',
                      borderRadius: 13,
                      border: 'none',
                      background: 'var(--bp-accent)',
                      color: 'var(--bp-accent-contrast)',
                      fontSize: 13,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: downloading ? 'not-allowed' : 'pointer',
                      opacity: downloading ? 0.6 : 1,
                    }}
                  >
                    <DownloadCloud size={17} />
                    Baixar Todas as Fazendas
                  </button>

                  <button
                    type="button"
                    data-testid="offline-download-view-btn"
                    disabled={downloading}
                    onClick={() => void runPackDownload('viewport')}
                    style={{
                      width: '100%',
                      minHeight: 42,
                      padding: '9px 14px',
                      borderRadius: 13,
                      background: 'var(--bp-input-bg)',
                      border: '1px solid var(--bp-glass-border)',
                      color: 'var(--bp-heading)',
                      fontSize: 12.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: downloading ? 'not-allowed' : 'pointer',
                      opacity: downloading ? 0.6 : 1,
                    }}
                  >
                    <MapPin size={15} />
                    Baixar Área da Tela Atual
                  </button>
                </div>
              </div>

              {/* Áreas salvas */}
              <div style={{ borderTop: '1px solid var(--bp-glass-border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--bp-heading)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <HardDrive size={14} />
                    Áreas salvas
                  </span>
                  {(stats?.tileCount ?? 0) > 0 && (
                    <button
                      type="button"
                      data-testid="offline-clear-cache-btn"
                      disabled={downloading}
                      onClick={() => void handleClearTileCache()}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#f87171',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Limpar cache
                    </button>
                  )}
                </div>

                {!stats || stats.regions.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--bp-panel-muted)',
                      lineHeight: 1.45,
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: 'var(--bp-input-bg)',
                      border: '1px solid var(--bp-glass-border)',
                    }}
                  >
                    Os limites de todas as fazendas e marcações já são salvos automaticamente no aparelho. Baixe uma área acima para incluir também o mapa de satélite sem internet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {stats.regions.map((region) => (
                      <div
                        key={region.id}
                        data-testid="offline-saved-region"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 11px',
                          borderRadius: 12,
                          background: 'var(--bp-input-bg)',
                          border: '1px solid var(--bp-glass-border)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--bp-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {region.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--bp-panel-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                            {region.tileCount} blocos · ~{formatStorageSize(region.estimatedBytes)} · Z{region.minZoom}–{region.maxZoom} · {formatDateShort(region.createdAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFlyToRegion(region)}
                          title="Ir para esta área"
                          aria-label={`Ir para ${region.name}`}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 9,
                            background: 'var(--bp-accent-soft)',
                            border: '1px solid var(--bp-accent-border)',
                            color: 'var(--bp-accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <Navigation size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRegion(region.id)}
                          title="Remover registro"
                          aria-label={`Remover ${region.name}`}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 9,
                            background: 'transparent',
                            border: '1px solid var(--bp-glass-border)',
                            color: 'var(--bp-panel-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
