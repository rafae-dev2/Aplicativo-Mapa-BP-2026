/**
 * WazeGPS v2 — GPS robusto para áreas rurais sem internet
 *
 * Melhorias:
 * - Filtro Kalman para suavizar posições e rejeitar saltos bruscos
 * - Mantém última posição válida quando sinal cai (não apaga marcador)
 * - Rejeita posições com accuracy > 150m (muito imprecisas)
 * - Indicador visual de qualidade do sinal (verde/amarelo/vermelho)
 * - Timeout estendido para áreas rurais (30s)
 * - maximumAge: 3000 — aceita posição de até 3s para evitar "pulo para posição antiga"
 * - Reconecta automaticamente após perda de sinal
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Marker } from 'react-map-gl';
import { Navigation } from 'lucide-react';

interface WazeGPSProps {
  mapRef: React.RefObject<any>;
  onPositionUpdate?: (lat: number, lng: number) => void;
  onHeadingUpdate?: (heading: number) => void;
}

interface GPSState {
  lat: number;
  lng: number;
  heading: number;
  accuracy: number;
  speed: number | null;
  timestamp: number;
}

type SignalQuality = 'excellent' | 'good' | 'poor' | 'lost';

// ─── Filtro Kalman simples para lat/lng ──────────────────────────────────────
class KalmanFilter {
  private Q: number; // ruído do processo
  private R: number; // ruído da medição
  private P: number; // covariância estimada
  private x: number; // estado estimado
  private initialized = false;

  constructor(Q = 0.0001, R = 0.01) {
    this.Q = Q;
    this.R = R;
    this.P = 1;
    this.x = 0;
  }

  filter(measurement: number, accuracy: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return measurement;
    }
    // Ajustar R dinamicamente com base na accuracy do GPS
    const dynamicR = Math.max(this.R, accuracy * 0.0001);
    // Predição
    this.P = this.P + this.Q;
    // Atualização
    const K = this.P / (this.P + dynamicR);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * this.P;
    return this.x;
  }

  reset() {
    this.initialized = false;
    this.P = 1;
  }
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function WazeGPS({ mapRef, onPositionUpdate, onHeadingUpdate }: WazeGPSProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [gpsState, setGpsState] = useState<GPSState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [signalQuality, setSignalQuality] = useState<SignalQuality>('lost');
  const [retryCount, setRetryCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number>(0);
  const lastValidPositionRef = useRef<GPSState | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTrackingRef = useRef(false);

  // Filtros Kalman para lat e lng
  const kalmanLatRef = useRef(new KalmanFilter(0.00001, 0.001));
  const kalmanLngRef = useRef(new KalmanFilter(0.00001, 0.001));

  // Calcular qualidade do sinal baseada na accuracy
  const getSignalQuality = (accuracy: number): SignalQuality => {
    if (accuracy <= 10) return 'excellent';
    if (accuracy <= 30) return 'good';
    if (accuracy <= 100) return 'poor';
    return 'lost';
  };

  const signalColors: Record<SignalQuality, string> = {
    excellent: '#22c55e',
    good: '#84cc16',
    poor: '#f59e0b',
    lost: '#ef4444',
  };

  const signalLabels: Record<SignalQuality, string> = {
    excellent: 'GPS Excelente',
    good: 'GPS Bom',
    poor: 'GPS Fraco',
    lost: 'Sem Sinal',
  };

  // ─── Processar posição GPS ─────────────────────────────────────────────────

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, heading, accuracy, speed } = position.coords;

    // Rejeitar posições muito imprecisas (> 150m) — evita "pulo para posição antiga"
    if (accuracy > 150) {
      setSignalQuality('poor');
      // Manter a última posição válida no mapa — não apagar o marcador
      return;
    }

    // Rejeitar posições que "saltam" mais de 500m em menos de 2s (GPS glitch)
    if (lastValidPositionRef.current) {
      const last = lastValidPositionRef.current;
      const timeDiff = (position.timestamp - last.timestamp) / 1000; // segundos
      if (timeDiff < 2) {
        const latDiff = Math.abs(latitude - last.lat);
        const lngDiff = Math.abs(longitude - last.lng);
        // ~0.005 graus ≈ 500m
        if (latDiff > 0.005 || lngDiff > 0.005) {
          console.warn('[GPS] Salto brusco detectado, ignorando posição:', { latDiff, lngDiff, timeDiff });
          return;
        }
      }
    }

    // Aplicar filtro Kalman para suavizar lat/lng
    const filteredLat = kalmanLatRef.current.filter(latitude, accuracy);
    const filteredLng = kalmanLngRef.current.filter(longitude, accuracy);

    // Suavizar heading (interpolação angular)
    let smoothHeading = lastHeadingRef.current;
    if (heading !== null && !isNaN(heading)) {
      let diff = heading - lastHeadingRef.current;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      smoothHeading = lastHeadingRef.current + diff * 0.3;
      if (smoothHeading < 0) smoothHeading += 360;
      if (smoothHeading >= 360) smoothHeading -= 360;
      lastHeadingRef.current = smoothHeading;
    }

    const quality = getSignalQuality(accuracy);
    setSignalQuality(quality);
    setError(null);
    setRetryCount(0);

    const newState: GPSState = {
      lat: filteredLat,
      lng: filteredLng,
      heading: smoothHeading,
      accuracy,
      speed,
      timestamp: position.timestamp,
    };

    lastValidPositionRef.current = newState;
    setGpsState(newState);
    onPositionUpdate?.(filteredLat, filteredLng);
    onHeadingUpdate?.(smoothHeading);

    // Centralizar o mapa suavemente
    if (followUser && mapRef.current) {
      mapRef.current.easeTo({
        center: [filteredLng, filteredLat],
        duration: 800,
      });
    }
  }, [mapRef, onPositionUpdate, onHeadingUpdate, followUser]);

  // ─── Handler de erro GPS ───────────────────────────────────────────────────

  const handleError = useCallback((err: GeolocationPositionError) => {
    let msg = '';
    if (err.code === 1) {
      msg = 'Permissão de GPS negada. Habilite nas configurações do dispositivo.';
      setIsTracking(false);
      isTrackingRef.current = false;
    } else if (err.code === 2) {
      msg = 'Sinal GPS indisponível. Aguardando sinal...';
      setSignalQuality('lost');
      // Não parar o rastreamento — manter a última posição e tentar reconectar
      // O watchPosition continua tentando automaticamente
    } else if (err.code === 3) {
      msg = 'Timeout do GPS. Tentando reconectar...';
      setSignalQuality('lost');
      // Reconectar automaticamente após timeout
      if (isTrackingRef.current) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          if (isTrackingRef.current) {
            setRetryCount(prev => prev + 1);
            restartWatch();
          }
        }, 3000);
      }
    }
    if (msg) setError(msg);
  }, []);

  // ─── Iniciar watchPosition ─────────────────────────────────────────────────

  const restartWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,   // Força hardware GPS
        maximumAge: 3000,           // Aceita posição de até 3s — evita "pulo para posição antiga"
        timeout: 30000,             // 30s timeout para áreas rurais com sinal fraco
      }
    );
  }, [handlePosition, handleError]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('GPS não suportado neste dispositivo.');
      return;
    }

    // Resetar filtros Kalman ao iniciar novo rastreamento
    kalmanLatRef.current.reset();
    kalmanLngRef.current.reset();
    lastValidPositionRef.current = null;

    setError(null);
    setIsTracking(true);
    isTrackingRef.current = true;
    setFollowUser(true);
    setSignalQuality('poor');

    restartWatch();
  }, [restartWatch]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    isTrackingRef.current = false;
    setIsTracking(false);
    setGpsState(null);
    setError(null);
    setSignalQuality('lost');
    lastValidPositionRef.current = null;
  }, []);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const handleToggle = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  const speedKmh = gpsState?.speed != null ? (gpsState.speed * 3.6).toFixed(0) : null;
  const signalColor = signalColors[signalQuality];

  return (
    <>
      {/* Marcador GPS no mapa com logotipo girando */}
      {gpsState && (
        <Marker
          longitude={gpsState.lng}
          latitude={gpsState.lat}
          anchor="center"
        >
          <div
            className="relative flex items-center justify-center"
            style={{ width: 60, height: 60 }}
          >
            {/* Anel de precisão (accuracy) — tamanho proporcional */}
            <div
              className="absolute rounded-full border-2 opacity-25 animate-pulse"
              style={{
                width: Math.min(Math.max(gpsState.accuracy * 0.4, 44), 140),
                height: Math.min(Math.max(gpsState.accuracy * 0.4, 44), 140),
                borderColor: signalColor,
              }}
            />

            {/* Anel interno sólido */}
            <div
              className="absolute rounded-full border opacity-50"
              style={{
                width: 52,
                height: 52,
                borderColor: signalColor,
                borderWidth: 2,
              }}
            />

            {/* Triângulo de direção */}
            <div
              className="absolute"
              style={{
                width: 0,
                height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderBottom: `18px solid ${signalColor}`,
                transform: `rotate(${gpsState.heading}deg) translateY(-30px)`,
                transformOrigin: 'bottom center',
                transition: 'transform 0.6s ease-out',
                opacity: 0.85,
              }}
            />

            {/* Logotipo da empresa */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `3px solid ${signalColor}`,
                boxShadow: `0 0 14px ${signalColor}88, 0 2px 8px rgba(0,0,0,0.5)`,
                background: 'white',
                transition: 'border-color 0.5s ease',
              }}
            >
              <img
                src="/header-logo.png"
                alt="Posição atual"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>

            {/* Velocidade */}
            {speedKmh && Number(speedKmh) > 2 && (
              <div
                className="absolute -bottom-5 text-white text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  background: signalColor,
                }}
              >
                {speedKmh} km/h
              </div>
            )}
          </div>
        </Marker>
      )}

      {/* Botão de controle GPS */}
      <div className="relative">
        <button
          onClick={handleToggle}
          className={`glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition ${
            isTracking
              ? 'bg-sky-400/24 text-sky-50 hover:bg-sky-400/32'
              : 'text-white hover:bg-white/10'
          }`}
          title={isTracking ? 'Parar rastreamento GPS' : 'Iniciar GPS em tempo real (Waze)'}
        >
          <Navigation className={`w-5 h-5 ${isTracking ? 'text-white' : 'text-[#ADFF2F]'}`} />
        </button>

        {/* Indicador de qualidade do sinal */}
        {isTracking && (
          <div
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white"
            style={{
              background: signalColor,
              animation: signalQuality !== 'lost' ? 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' : 'none',
            }}
          />
        )}

        {/* Painel de status GPS (quando rastreando) */}
        {isTracking && gpsState && (
          <div
            className="glass-liquid-strong absolute bottom-12 right-0 rounded-xl p-2 text-xs text-white shadow-2xl"
            style={{
              background: 'rgba(10, 22, 35, 0.72)',
              color: 'white',
              minWidth: 160,
              zIndex: 50,
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: signalColor }} />
              <span style={{ color: signalColor, fontWeight: 700 }}>{signalLabels[signalQuality]}</span>
            </div>
            <div className="opacity-80">Precisão: ±{gpsState.accuracy.toFixed(0)}m</div>
            <div className="opacity-60 text-xs mt-0.5">
              {gpsState.lat.toFixed(6)}, {gpsState.lng.toFixed(6)}
            </div>
            {retryCount > 0 && (
              <div className="opacity-70 text-yellow-400 mt-0.5">Reconectando... ({retryCount})</div>
            )}
          </div>
        )}

        {/* Erro */}
        {error && (
          <div className="absolute bottom-12 right-0 p-2 bg-red-600 text-white text-xs rounded-lg shadow-lg max-w-xs z-50">
            {error}
          </div>
        )}
      </div>
    </>
  );
}
