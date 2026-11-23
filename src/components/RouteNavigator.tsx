/**
 * RouteNavigator — Sistema de Roteamento Estilo Google Maps
 * Usa APENAS a API nativa do Mapbox GL JS (sem Source/Layer/Marker do react-map-gl)
 * para evitar o erro "Cannot destructure property 'map' of useContext()"
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { MapRef } from 'react-map-gl';
import { createPortal } from 'react-dom';
import { MAP_CONFIG } from '@/config/constants';
import { installMapboxFogGuard } from '@/lib/mapboxFogGuard';

installMapboxFogGuard(mapboxgl);

// ── Coordenadas fixas da Usina ────────────────────────────────────────────────
export const USINA_COORDS = {
  lng: -51.029651800285365,
  lat: -21.492391427001520,
  label: 'Usina Branco Peres',
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface RouteOrigin {
  lng: number;
  lat: number;
  label: string;
}

interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
}

interface RouteInfo {
  distance: number;
  duration: number;
  steps: RouteStep[];
}

interface RouteNavigatorProps {
  mapRef: React.RefObject<MapRef>;
  destination: RouteOrigin | null;
  onClose: () => void;
}

// ── Utilitários ───────────────────────────────────────────────────────────────
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function getManeuverIcon(maneuver: string): string {
  if (maneuver.includes('left')) return '↰';
  if (maneuver.includes('right')) return '↱';
  if (maneuver.includes('straight') || maneuver.includes('continue')) return '↑';
  if (maneuver.includes('uturn')) return '↩';
  if (maneuver.includes('roundabout')) return '↻';
  if (maneuver.includes('arrive')) return '📍';
  if (maneuver.includes('depart')) return '🚗';
  return '→';
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Componente Principal ──────────────────────────────────────────────────────
export default function RouteNavigator({ mapRef, destination, onClose }: RouteNavigatorProps) {
  const [originMode, setOriginMode] = useState<'usina' | 'gps'>('usina');
  const [origin, setOrigin] = useState<RouteOrigin>(USINA_COORDS);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ── Marcadores DOM para A e B ─────────────────────────────────────────────
  const markerARef = useRef<any>(null);
  const markerBRef = useRef<any>(null);

  // ── Adicionar camadas de rota via API nativa do Mapbox GL JS ─────────────
  const addRouteToMap = useCallback((geojson: any, from: RouteOrigin, to: RouteOrigin) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Remover camadas e fontes existentes
    ['route-shadow', 'route-main', 'route-border'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['route-geojson'].forEach(id => {
      if (map.getSource(id)) map.removeSource(id);
    });

    // Remover marcadores DOM anteriores
    if (markerARef.current) { markerARef.current.remove(); markerARef.current = null; }
    if (markerBRef.current) { markerBRef.current.remove(); markerBRef.current = null; }

    // Adicionar fonte GeoJSON
    map.addSource('route-geojson', { type: 'geojson', data: geojson });

    // Sombra
    map.addLayer({
      id: 'route-shadow',
      type: 'line',
      source: 'route-geojson',
      paint: { 'line-color': '#000000', 'line-width': 12, 'line-opacity': 0.15, 'line-blur': 5 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Linha principal azul
    map.addLayer({
      id: 'route-main',
      type: 'line',
      source: 'route-geojson',
      paint: { 'line-color': '#2563EB', 'line-width': 7, 'line-opacity': 0.95 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Borda branca pontilhada
    map.addLayer({
      id: 'route-border',
      type: 'line',
      source: 'route-geojson',
      paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': 0.5, 'line-dasharray': [0, 3] },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Marcador A (origem) via DOM
    const elA = document.createElement('div');
    elA.style.cssText = `
      width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:#2563EB;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;cursor:pointer;
    `;
    elA.innerHTML = '<span style="transform:rotate(45deg);color:white;font-weight:800;font-size:11px">A</span>';
    markerARef.current = new mapboxgl.Marker({ element: elA, anchor: 'bottom' })
      .setLngLat([from.lng, from.lat])
      .addTo(map);

    // Marcador B (destino) via DOM
    const elB = document.createElement('div');
    elB.style.cssText = `
      width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:#DC2626;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;cursor:pointer;
    `;
    elB.innerHTML = '<span style="transform:rotate(45deg);color:white;font-weight:800;font-size:11px">B</span>';
    markerBRef.current = new mapboxgl.Marker({ element: elB, anchor: 'bottom' })
      .setLngLat([to.lng, to.lat])
      .addTo(map);

    // Ajustar bounds
    const coords = geojson.features[0].geometry.coordinates;
    const lngs = coords.map((c: number[]) => c[0]);
    const lats = coords.map((c: number[]) => c[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: { top: 80, bottom: 220, left: 40, right: 40 }, duration: 1500 }
    );
  }, [mapRef]);

  // ── Remover rota do mapa ──────────────────────────────────────────────────
  const removeRouteFromMap = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      ['route-shadow', 'route-main', 'route-border'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource('route-geojson')) map.removeSource('route-geojson');
    }
    if (markerARef.current) { markerARef.current.remove(); markerARef.current = null; }
    if (markerBRef.current) { markerBRef.current.remove(); markerBRef.current = null; }
  }, [mapRef]);

  // ── Cleanup ao desmontar ──────────────────────────────────────────────────
  useEffect(() => {
    return () => { removeRouteFromMap(); };
  }, [removeRouteFromMap]);

  // ── Buscar rota via Mapbox Directions API ─────────────────────────────────
  const fetchRoute = useCallback(async (from: RouteOrigin, to: RouteOrigin) => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    setRouteInfo(null);

    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?` +
        `steps=true&geometries=geojson&overview=full&language=pt&` +
        `access_token=${MAP_CONFIG.MAPBOX_ACCESS_TOKEN}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Erro na API: ${response.status}`);

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) {
        throw new Error('Nenhuma rota encontrada.');
      }

      const route = data.routes[0];
      const steps: RouteStep[] = route.legs[0].steps.map((step: any) => ({
        instruction: step.maneuver.instruction || step.name || 'Continuar',
        distance: step.distance,
        duration: step.duration,
        maneuver: step.maneuver.type + (step.maneuver.modifier ? '_' + step.maneuver.modifier : ''),
      }));

      setRouteInfo({ distance: route.distance, duration: route.duration, steps });

      const geojson = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: route.geometry }],
      };

      // Aguardar o mapa estar pronto antes de adicionar camadas
      const map = mapRef.current?.getMap();
      if (map) {
        if (map.isStyleLoaded()) {
          addRouteToMap(geojson, from, to);
        } else {
          map.once('style.load', () => addRouteToMap(geojson, from, to));
        }
      }

    } catch (err: any) {
      // Fallback: linha reta
      const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
      const duration = (distance / 1000 / 60) * 3600;

      setRouteInfo({
        distance,
        duration,
        steps: [
          { instruction: `Siga em direção a ${to.label}`, distance, duration, maneuver: 'depart' },
          { instruction: `Chegou ao destino: ${to.label}`, distance: 0, duration: 0, maneuver: 'arrive' },
        ],
      });

      const geojson = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
        }],
      };

      const map = mapRef.current?.getMap();
      if (map) {
        if (map.isStyleLoaded()) {
          addRouteToMap(geojson, from, to);
        } else {
          map.once('style.load', () => addRouteToMap(geojson, from, to));
        }
      }

      setError('Rota aproximada (linha reta). Distância real pode ser maior.');
    } finally {
      setLoading(false);
    }
  }, [mapRef, addRouteToMap]);

  // ── Iniciar com Usina como origem ─────────────────────────────────────────
  useEffect(() => {
    if (destination) {
      fetchRoute(USINA_COORDS, destination);
    }
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleUsinaOrigin = () => {
    setOrigin(USINA_COORDS);
    setOriginMode('usina');
    if (destination) fetchRoute(USINA_COORDS, destination);
  };

  const handleGPSOrigin = () => {
    if (!navigator.geolocation) {
      setError('GPS não disponível neste dispositivo.');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newOrigin: RouteOrigin = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          label: 'Minha Localização',
        };
        setOrigin(newOrigin);
        setOriginMode('gps');
        if (destination) fetchRoute(newOrigin, destination);
      },
      (err) => {
        let msg = 'Erro ao obter GPS.';
        if (err.code === 1) msg = 'Permissão de GPS negada.';
        else if (err.code === 2) msg = 'Sinal GPS indisponível.';
        setError(msg);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    removeRouteFromMap();
    window.setTimeout(onClose, 300);
  };

  const openInWaze = () => {
    if (!destination) return;
    window.open(`https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`, '_blank');
  };

  const openInGoogleMaps = () => {
    if (!destination) return;
    window.open(
      `https://www.google.com/maps/dir/${origin.lat},${origin.lng}/${destination.lat},${destination.lng}`,
      '_blank'
    );
  };

  // ── Painel via Portal ─────────────────────────────────────────────────────
  return createPortal(
    <div className={`bp-route-panel ${isClosing ? 'is-closing' : ''}`} style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      width: isMinimized ? 'auto' : 'min(420px, calc(100vw - 32px))',
      background: 'rgba(10, 18, 35, 0.97)',
      backdropFilter: 'blur(16px)',
      borderRadius: 16,
      boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.3)',
      zIndex: 9999,
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      transition: 'width 0.3s ease',
    }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🗺️</span>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
              Rota até {destination?.label || 'Destino'}
            </div>
            {routeInfo && (
              <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 1 }}>
                {formatDistance(routeInfo.distance)} · {formatDuration(routeInfo.duration)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: '50%', width: 26, height: 26,
              color: 'white', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {isMinimized ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {!isMinimized && (
        <div style={{ padding: 14 }}>

          {/* Seletor de Origem */}
          <div style={{ marginBottom: 12 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>
              Ponto de Partida
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleUsinaOrigin}
                style={{
                  flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${originMode === 'usina' ? '#3b82f6' : 'rgba(255,255,255,0.12)'}`,
                  background: originMode === 'usina' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: originMode === 'usina' ? '#93c5fd' : 'rgba(255,255,255,0.5)',
                  fontSize: 11, fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                🏭 Usina
              </button>
              <button
                onClick={handleGPSOrigin}
                style={{
                  flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${originMode === 'gps' ? '#22c55e' : 'rgba(255,255,255,0.12)'}`,
                  background: originMode === 'gps' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                  color: originMode === 'gps' ? '#86efac' : 'rgba(255,255,255,0.5)',
                  fontSize: 11, fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                📍 Meu GPS
              </button>
            </div>
          </div>

          {/* Linha de Rota */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            padding: '10px 12px', marginBottom: 12,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563EB', border: '2px solid white', flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{origin.label}</span>
            </div>
            <div style={{ marginLeft: 4, marginBottom: 4, borderLeft: '2px dashed rgba(59,130,246,0.4)', height: 14 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626', border: '2px solid white', flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{destination?.label || 'Destino'}</span>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', color: 'rgba(255,255,255,0.6)' }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(59,130,246,0.3)', borderTop: '2px solid #3b82f6',
                animation: 'routeSpin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 13 }}>Calculando rota...</span>
            </div>
          )}

          {/* Aviso */}
          {error && !loading && (
            <div style={{
              background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
              borderRadius: 8, padding: '7px 10px', marginBottom: 10,
            }}>
              <p style={{ color: '#fde047', fontSize: 11, margin: 0 }}>⚠️ {error}</p>
            </div>
          )}

          {/* Resultado */}
          {routeInfo && !loading && (
            <>
              {/* Cards distância/tempo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{
                  background: 'rgba(37,99,235,0.18)', border: '1px solid rgba(37,99,235,0.35)',
                  borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                }}>
                  <p style={{ color: '#93c5fd', fontSize: 10, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Distância</p>
                  <p style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1 }}>
                    {formatDistance(routeInfo.distance)}
                  </p>
                </div>
                <div style={{
                  background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.35)',
                  borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                }}>
                  <p style={{ color: '#86efac', fontSize: 10, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tempo Est.</p>
                  <p style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1 }}>
                    {formatDuration(routeInfo.duration)}
                  </p>
                </div>
              </div>

              {/* Toggle passos */}
              {routeInfo.steps.length > 0 && (
                <button
                  onClick={() => setShowSteps(!showSteps)}
                  style={{
                    width: '100%', padding: '7px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontSize: 11,
                    cursor: 'pointer', marginBottom: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  {showSteps ? '▲ Ocultar' : '▼ Ver'} instruções ({routeInfo.steps.length} etapas)
                </button>
              )}

              {/* Lista de passos */}
              {showSteps && (
                <div style={{
                  maxHeight: 180, overflowY: 'auto',
                  background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {routeInfo.steps.map((step, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '7px 10px',
                      borderBottom: i < routeInfo.steps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{getManeuverIcon(step.maneuver)}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11, margin: '0 0 2px' }}>{step.instruction}</p>
                        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: 0 }}>
                          {formatDistance(step.distance)} · {formatDuration(step.duration)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Botões de navegação externa */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={openInWaze}
                  style={{
                    padding: '10px 8px',
                    background: 'linear-gradient(135deg, #00b4d8, #0077b6)',
                    border: 'none', borderRadius: 10, color: 'white',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  <span style={{ fontSize: 15 }}>🚗</span> Waze
                </button>
                <button
                  onClick={openInGoogleMaps}
                  style={{
                    padding: '10px 8px',
                    background: 'linear-gradient(135deg, #4285F4, #34A853)',
                    border: 'none', borderRadius: 10, color: 'white',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  <span style={{ fontSize: 15 }}>🗺️</span> Google Maps
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes routeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body
  );
}
