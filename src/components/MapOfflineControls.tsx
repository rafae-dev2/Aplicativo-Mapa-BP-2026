import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, WifiOff, X, Check, Loader2, MapPin } from 'lucide-react';

interface Props {
  mapRef: React.RefObject<any>;
}

// ── Slippy map math (WGS84 <-> tile) ────────────────────────────────────────
function lngLatToTile(lng: number, lat: number, z: number) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}
function tileCenterLngLat(x: number, y: number, z: number) {
  const n = Math.pow(2, z);
  const lng = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

/**
 * MapOfflineControls — botao "Baixar esta area" + indicador online/offline.
 *
 * Como funciona o download: em vez de adivinhar URLs de tiles do Mapbox
 * (que mudam com `sku`), fazemos a propria camera do mapa varrer a area em
 * varios niveis de zoom. Assim o Mapbox GL requisita exatamente os tiles que
 * usaria offline, e o Service Worker (sw-map-tiles.js) os guarda em cache.
 */
export default function MapOfflineControls({ mapRef }: Props) {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [blocks, setBlocks] = useState(0);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const waitForIdle = (map: any, timeout = 2600) =>
    new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve();
      };
      const t = setTimeout(finish, timeout);
      try { map.once('idle', finish); } catch { finish(); }
    });

  const startDownload = useCallback(async () => {
    const map = mapRef.current?.getMap?.() ? mapRef.current.getMap() : mapRef.current;
    if (!map || downloading) return;
    if (!navigator.onLine) {
      alert('Você está offline. Conecte-se à internet uma vez para baixar esta área.');
      return;
    }
    cancelRef.current = false;
    setDownloading(true);
    setProgress(0);
    setDone(false);

    const b = map.getBounds();
    const west = b.getWest();
    const east = b.getEast();
    const north = b.getNorth();
    const south = b.getSouth();
    const base = Math.round(map.getZoom());
    // baixa o nivel atual + 2 mais proximos (detalhe ao chegar perto)
    const zooms = [base, base + 1, base + 2].filter((z) => z >= 3 && z <= 18);

    const jobs: { z: number; x: number; y: number }[] = [];
    for (const z of zooms) {
      const tl = lngLatToTile(west, north, z);
      const br = lngLatToTile(east, south, z);
      for (let x = tl.x; x <= br.x; x++) {
        for (let y = tl.y; y <= br.y; y++) jobs.push({ z, x, y });
      }
    }
    const MAX_JOBS = 90; // limite p/ nao estourar dados/tempo
    const capped = jobs.slice(0, MAX_JOBS);
    setBlocks(capped.length);

    const orig = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    try {
      for (let i = 0; i < capped.length; i++) {
        if (cancelRef.current) break;
        const { z, x, y } = capped[i];
        const c = tileCenterLngLat(x, y, z);
        try { map.jumpTo({ center: [c.lng, c.lat], zoom: z, bearing: 0, pitch: 0 }); } catch { /* noop */ }
        await waitForIdle(map);
        setProgress(Math.round(((i + 1) / capped.length) * 100));
      }
    } finally {
      try { map.jumpTo(orig); } catch { /* noop */ }
      setDownloading(false);
      if (!cancelRef.current) {
        // registra a area baixada
        try {
          const saved = JSON.parse(localStorage.getItem('mapas-areas-offline') || '[]');
          saved.push({ ts: Date.now(), center: [orig.center.lng, orig.center.lat], zoom: base, blocks: capped.length });
          localStorage.setItem('mapas-areas-offline', JSON.stringify(saved.slice(-50)));
        } catch { /* noop */ }
        setDone(true);
        setTimeout(() => setDone(false), 4500);
      }
    }
  }, [mapRef, downloading]);

  const cancel = () => {
    cancelRef.current = true;
  };

  return (
    <>
      {/* Botao (flui dentro da coluna de controles) */}
      <button
        data-testid="download-area-btn"
        onClick={startDownload}
        disabled={downloading}
        className={`bp-map-offline-download bp-tool-button glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition text-lg ${
          downloading ? 'bg-emerald-400/24 text-emerald-50' : 'text-white hover:bg-white/10'
        }`}
        title="Baixar esta área para usar sem internet"
      >
        {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        <span className="bp-tool-label">Offline</span>
      </button>

      {/* Indicador Offline do mapa (fixo, canto inferior central) */}
      {!online && (
        <div
          data-testid="map-offline-badge"
          style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 999,
            background: 'rgba(251,146,60,0.16)', border: '1px solid rgba(251,146,60,0.4)',
            color: '#fb923c', fontWeight: 800, fontSize: 12,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          <WifiOff size={14} /> Mapa offline — mostrando áreas já baixadas
        </div>
      )}

      {/* "Baixado!" flash */}
      {done && (
        <div
          data-testid="download-done-badge"
          style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 999,
            background: 'rgba(74,222,128,0.16)', border: '1px solid rgba(74,222,128,0.4)',
            color: '#4ade80', fontWeight: 800, fontSize: 12,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          <Check size={14} /> Área salva para uso offline
        </div>
      )}

      {/* Modal de progresso do download */}
      {downloading && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            className="glass-liquid-strong"
            style={{
              width: '90%', maxWidth: 360, borderRadius: 20, padding: 20,
              background: 'var(--bp-glass-bg-strong)',
              border: '1px solid var(--bp-glass-border-accent)',
              boxShadow: 'var(--bp-glass-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MapPin size={20} color="#34d399" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'white' }}>Baixando esta área…</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {blocks} blocos · use no campo sem internet
                </div>
              </div>
            </div>

            {/* Barra de progresso */}
            <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div
                data-testid="download-progress-bar"
                style={{
                  height: '100%', width: `${progress}%`,
                  background: 'linear-gradient(90deg,#34d399,#10b981)',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{progress}%</span>
              <button
                onClick={cancel}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', fontSize: 12, fontWeight: 700, borderRadius: 8,
                  padding: '4px 10px', cursor: 'pointer',
                }}
              >
                <X size={12} /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
