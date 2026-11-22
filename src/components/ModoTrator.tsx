/**
 * ModoTrator v3 - Medição de área por caminhada com alta precisão
 *
 * Correções v3:
 * - CORRIGIDO: Bug do ponto inicial errado (filtro Kalman inicializado antes do primeiro ponto)
 * - CORRIGIDO: maximumAge=0 para garantir posição ATUAL do dispositivo
 * - Odômetro digital para motoristas (distância percorrida em km)
 * - Velocidade atual em km/h via GPS
 * - Indicador de precisão em tempo real
 * - Funciona 100% offline
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Source, Layer, Marker } from 'react-map-gl';
import { distance as turfDistance } from '@turf/turf';
import { CheckCircle2, Flame, Pause, Play, Save, Square, StopCircle, Trash2, X } from 'lucide-react';
import { calculateGpsArea, createGpsAreaMeasurement, formatMeasurementArea, type GpsAreaMeasurement } from '@/lib/gpsMeasurement';

interface Coordinate {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

interface KalmanState {
  lat: number;
  lng: number;
  variance: number;
}

interface ModoTratorProps {
  mapRef: React.RefObject<any>;
  onAreaCalculated?: (hectares: number) => void;
  onBurnedAreaSaved?: (measurement: GpsAreaMeasurement) => void;
  onClose?: () => void;
  isWazeActive?: boolean; // Quando WazeGPS está ativo, ocultar marcador do Trator para evitar sobreposição
  initialMode?: ModoType;
}

type UnitType = 'm2' | 'ha' | 'alq' | 'km2';
type ModoType = 'area' | 'queimada' | 'odometro';

// Constantes de conversão
const HA_PER_ALQUEIRE_SP = 2.42; // 1 alqueire paulista = 2.42 ha
const MAX_ACCURACY_METERS = 50;   // Rejeita pontos com erro > 50m
const MIN_DISTANCE_METERS = 2;    // Distância mínima entre pontos (área)
const MIN_DISTANCE_ODO = 5;       // Distância mínima entre pontos (odômetro)
const KALMAN_Q = 3e-5;            // Ruído do processo (menor = mais suave)

// Filtro Kalman 1D para lat/lng
class KalmanFilter {
  private q: number;
  private r: number;
  private p: number;
  private x: number;
  private k: number;
  private initialized: boolean;

  constructor(q = KALMAN_Q, r = 0.01, p = 1, x = 0) {
    this.q = q;
    this.r = r;
    this.p = p;
    this.x = x;
    this.k = 0;
    this.initialized = false;
  }

  filter(measurement: number): number {
    // Na primeira medição, inicializar com o valor real (sem filtrar)
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return measurement;
    }
    // Predição
    this.p += this.q;
    // Atualização
    this.k = this.p / (this.p + this.r);
    this.x += this.k * (measurement - this.x);
    this.p *= (1 - this.k);
    return this.x;
  }

  reset(value: number) {
    this.x = value;
    this.p = 1;
    this.initialized = true;
  }

  isInitialized() {
    return this.initialized;
  }
}

export default function ModoTrator({ mapRef, onAreaCalculated, onBurnedAreaSaved, onClose, isWazeActive = false, initialMode = 'area' }: ModoTratorProps) {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trail, setTrail] = useState<Coordinate[]>([]);
  const [calculatedArea, setCalculatedArea] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalDistance, setTotalDistance] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [unit, setUnit] = useState<UnitType>('ha');
  const [modo, setModo] = useState<ModoType>(initialMode);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [liveArea, setLiveArea] = useState<number | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'waiting' | 'active' | 'weak' | 'error'>('waiting');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastMeasurement, setLastMeasurement] = useState<GpsAreaMeasurement | null>(null);
  const [savedMeasurementId, setSavedMeasurementId] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<Coordinate | null>(null);
  const totalDistRef = useRef(0);
  const kalmanLatRef = useRef(new KalmanFilter());
  const kalmanLngRef = useRef(new KalmanFilter());
  const isPausedRef = useRef(false);
  const trailRef = useRef<Coordinate[]>([]);
  const isFirstPointRef = useRef(true);

  // Manter trailRef sincronizado com trail
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  // Manter isPausedRef sincronizado
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Calcular a área em tempo real com o mesmo algoritmo usado no fechamento.
  useEffect(() => {
    const areaM2 = calculateGpsArea(trail);
    setLiveArea(areaM2 > 0 ? areaM2 : null);
  }, [trail]);

  const processPosition = useCallback((position: GeolocationPosition) => {
    if (isPausedRef.current) return;

    const { latitude, longitude, accuracy, speed } = position.coords;
    setCurrentAccuracy(accuracy);
    setGpsStatus(accuracy <= 30 ? 'active' : accuracy <= 50 ? 'weak' : 'weak');

    // Velocidade em km/h (se disponível)
    if (speed !== null && speed !== undefined) {
      setCurrentSpeed(speed * 3.6); // m/s → km/h
    }

    // Rejeitar posições muito imprecisas
    if (accuracy > MAX_ACCURACY_METERS) {
      setGpsStatus('weak');
      return;
    }

    // CORREÇÃO PRINCIPAL: Inicializar filtro Kalman com a primeira posição REAL
    if (isFirstPointRef.current) {
      kalmanLatRef.current.reset(latitude);
      kalmanLngRef.current.reset(longitude);
      isFirstPointRef.current = false;
    }

    // Aplicar filtro Kalman (já inicializado com valor real)
    const filteredLat = kalmanLatRef.current.filter(latitude);
    const filteredLng = kalmanLngRef.current.filter(longitude);

    const newPoint: Coordinate = {
      lat: filteredLat,
      lng: filteredLng,
      accuracy,
      timestamp: Date.now(),
    };

    // Verificar distância mínima
    const minDist = modo === 'odometro' ? MIN_DISTANCE_ODO : MIN_DISTANCE_METERS;
    if (lastPointRef.current) {
      const dist = turfDistance(
        [lastPointRef.current.lng, lastPointRef.current.lat],
        [filteredLng, filteredLat],
        { units: 'meters' }
      );

      if (dist < minDist) return;

      // Rejeitar saltos impossíveis (> 200m em 1 atualização = GPS pulou)
      if (dist > 200) {
        console.warn(`[ModoTrator] Salto GPS detectado: ${dist.toFixed(0)}m — ignorando ponto`);
        return;
      }

      totalDistRef.current += dist;
      setTotalDistance(totalDistRef.current);
    }

    lastPointRef.current = newPoint;
    setTrail((prev) => [...prev, newPoint]);
    setPointCount((c) => c + 1);

    // Centralizar mapa suavemente
    if (mapRef.current) {
      try {
        const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
        map.easeTo({
          center: [filteredLng, filteredLat],
          duration: 800,
          zoom: Math.max(map.getZoom(), 16),
        });
      } catch {
        // silencioso
      }
    }
  }, [mapRef, modo]);

  const startMeasurement = useCallback(() => {
    if (!navigator.geolocation) {
      setError('GPS não disponível neste dispositivo.');
      return;
    }

    setError(null);
    setTrail([]);
    setCalculatedArea(null);
    setTotalDistance(0);
    setPointCount(0);
    setLiveArea(null);
    setLastMeasurement(null);
    setSavedMeasurementId(null);
    setStartedAt(Date.now());
    setIsPaused(false);
    setGpsStatus('waiting');
    setCurrentSpeed(null);
    isPausedRef.current = false;
    lastPointRef.current = null;
    totalDistRef.current = 0;
    isFirstPointRef.current = true; // IMPORTANTE: resetar flag do primeiro ponto
    // Criar novos filtros Kalman zerados (sem valor inicial)
    kalmanLatRef.current = new KalmanFilter();
    kalmanLngRef.current = new KalmanFilter();
    setIsActive(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => {
        let msg = 'Erro no GPS.';
        if (err.code === 1) msg = '⛔ Permissão de GPS negada. Verifique as configurações do celular.';
        else if (err.code === 2) msg = '📡 Sinal GPS fraco. Mova-se para área aberta e aguarde.';
        else if (err.code === 3) msg = '⏳ GPS demorando para responder. Aguardando sinal...';

        if (err.code !== 3) {
          setError(msg);
          setIsActive(false);
          setGpsStatus('error');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,      // SEMPRE buscar posição atual — nunca usar cache
        timeout: 30000,     // Aguarda 30s antes de reportar timeout
      }
    );
  }, [processPosition]);

  const pauseMeasurement = useCallback(() => {
    setIsPaused(true);
    isPausedRef.current = true;
  }, []);

  const resumeMeasurement = useCallback(() => {
    setIsPaused(false);
    isPausedRef.current = false;
    // Resetar lastPoint para evitar linha longa ao retomar
    lastPointRef.current = null;
  }, []);

  const stopMeasurement = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsActive(false);
    setIsPaused(false);

    const currentTrail = trailRef.current;
    if (modo === 'area' || modo === 'queimada') {
      const measurement = createGpsAreaMeasurement(currentTrail, startedAt ?? Date.now());
      if (measurement) {
        setCalculatedArea(measurement.areaHa);
        setLastMeasurement(measurement);
        setSavedMeasurementId(null);
        onAreaCalculated?.(measurement.areaHa);
      } else {
        setError(`Apenas ${currentTrail.length} ponto(s) válido(s). Percorra pelo menos três pontos ao redor da área.`);
      }
    }
    // No modo odômetro, apenas para a gravação (distância já está no estado)
  }, [onAreaCalculated, modo, startedAt]);

  const saveBurnedArea = useCallback(() => {
    if (!lastMeasurement || modo !== 'queimada') return;
    try {
      const key = 'mapas-bp-gps-burned-areas';
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      const next = [...(Array.isArray(stored) ? stored : []), lastMeasurement].slice(-20);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // A gravação no fluxo principal continua possível mesmo sem localStorage.
    }
    setSavedMeasurementId(lastMeasurement.id);
    onBurnedAreaSaved?.(lastMeasurement);
  }, [lastMeasurement, modo, onBurnedAreaSaved]);

  const clearMeasurement = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsActive(false);
    setIsPaused(false);
    setTrail([]);
    setCalculatedArea(null);
    setError(null);
    setTotalDistance(0);
    setPointCount(0);
    setLiveArea(null);
    setCurrentSpeed(null);
    setStartedAt(null);
    setLastMeasurement(null);
    setSavedMeasurementId(null);
    setGpsStatus('waiting');
    lastPointRef.current = null;
    totalDistRef.current = 0;
    isFirstPointRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Converter área para a unidade selecionada
  const convertArea = (areaM2: number, targetUnit: UnitType): string => {
    switch (targetUnit) {
      case 'm2':
        return `${Math.round(areaM2).toLocaleString('pt-BR')} m²`;
      case 'ha': {
        const ha = areaM2 / 10000;
        return `${ha.toFixed(4)} ha`;
      }
      case 'alq': {
        const ha = areaM2 / 10000;
        const alq = ha / HA_PER_ALQUEIRE_SP;
        return `${alq.toFixed(4)} alq`;
      }
      case 'km2': {
        const km2 = areaM2 / 1_000_000;
        return `${km2.toFixed(6)} km²`;
      }
    }
  };

  const formatDistance = (m: number) => {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(3)} km`;
  };

  const getAccuracyColor = (acc: number | null) => {
    if (acc === null) return 'text-gray-400';
    if (acc <= 10) return 'text-green-400';
    if (acc <= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getAccuracyLabel = (acc: number | null) => {
    if (acc === null) return 'Aguardando GPS...';
    if (acc <= 10) return `🟢 ±${acc.toFixed(0)}m — Excelente`;
    if (acc <= 30) return `🟡 ±${acc.toFixed(0)}m — Boa`;
    return `🔴 ±${acc.toFixed(0)}m — Baixa`;
  };

  // GeoJSON da trilha
  const trailGeoJSON = React.useMemo(() => {
    if (trail.length < 2) return null;
    const coords = trail.map((p) => [p.lng, p.lat]);
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: coords },
        },
        ...(trail.length >= 3 && (modo === 'area' || modo === 'queimada')
          ? [{
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Polygon' as const, coordinates: [[...coords, coords[0]]] },
            }]
          : []),
      ],
    };
  }, [trail, modo]);

  const handleClose = () => {
    if (!onClose || isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, 300);
  };

  const panel = (
    <div
      className={`bp-gps-measurement-panel bg-gray-900 bg-opacity-97 rounded-xl shadow-2xl border border-yellow-700 ${isClosing ? 'is-closing' : ''}`}
      style={{
        position: 'fixed',
        bottom: '180px',
        left: '16px',
        zIndex: 9999,
        minWidth: 260,
        maxWidth: 320,
        maxHeight: '70vh',
        overflowY: 'auto',
        background: 'var(--bp-panel-bg)',
        color: 'var(--bp-panel-text)',
        border: '1px solid var(--bp-accent-border)',
        fontFamily: 'var(--bp-font-ui)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer select-none"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-base">🚜</span>
          <span className="text-xs font-bold text-yellow-300 uppercase tracking-wide">
            {modo === 'queimada' ? 'Área Queimada GPS' : modo === 'area' ? 'Modo Trator' : '🚛 Odômetro'}
          </span>
          {isActive && !isPaused && (
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          )}
          {isPaused && (
            <span className="text-xs text-orange-400 font-bold">⏸ PAUSADO</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 text-xs">{isMinimized ? '▲' : '▼'}</span>
          {onClose && (
            <button
              type="button"
              aria-label="Fechar Área Queimada GPS"
              title="Fechar painel"
              onClick={(event) => { event.stopPropagation(); handleClose(); }}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/75 transition hover:bg-white/20 hover:text-white active:scale-95"
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <div className="px-3 pb-3 space-y-2">

          {/* Seletor de modo */}
          {!isActive && (
            <div>
              <p className="text-gray-400 text-xs mb-1 font-semibold uppercase tracking-wide">Modo de Uso</p>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => setModo('area')}
                  className={`text-xs py-2 px-2 rounded font-bold transition ${
                    modo === 'area'
                      ? 'bg-yellow-500 text-black'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  📐 Área
                </button>
                <button
                  data-testid="gps-burned-area-mode"
                  onClick={() => setModo('queimada')}
                  className={`text-xs py-2 px-2 rounded font-bold transition ${
                    modo === 'queimada'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <Flame className="inline-block w-3 h-3 mr-1" />Queimada
                </button>
                <button
                  onClick={() => setModo('odometro')}
                  className={`text-xs py-2 px-2 rounded font-bold transition ${
                    modo === 'odometro'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🚛 Odômetro
                </button>
              </div>
            </div>
          )}

          {/* Seletor de unidade para área comum e área queimada */}
          {(modo === 'area' || modo === 'queimada') && (
            <div>
              <p className="text-gray-400 text-xs mb-1 font-semibold uppercase tracking-wide">Unidade de Resultado</p>
              <div className="grid grid-cols-4 gap-1">
                {(['m2', 'ha', 'alq', 'km2'] as UnitType[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={`text-xs py-1 px-1 rounded font-bold transition ${
                      unit === u
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {u === 'm2' ? 'm²' : u === 'ha' ? 'ha' : u === 'alq' ? 'alq' : 'km²'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Precisão GPS */}
          {(isActive || currentAccuracy !== null) && (
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-gray-400 text-xs font-semibold mb-0.5">Precisão GPS</p>
              <p className={`text-xs font-bold ${getAccuracyColor(currentAccuracy)}`}>
                {getAccuracyLabel(currentAccuracy)}
              </p>
              {currentSpeed !== null && currentSpeed > 0.5 && (
                <p className="text-blue-300 text-xs mt-0.5">
                  🚗 {currentSpeed.toFixed(1)} km/h
                </p>
              )}
            </div>
          )}

          {/* Status de gravação */}
          {isActive && (
            <div className={`rounded-lg p-2 border ${
              isPaused
                ? 'bg-orange-900 bg-opacity-40 border-orange-700'
                : 'bg-yellow-900 bg-opacity-40 border-yellow-700'
            }`}>
              <p className={`text-xs font-semibold ${isPaused ? 'text-orange-300' : 'text-yellow-300'}`}>
                {isPaused ? '⏸ Medição pausada' : '🔴 Gravando...'}
              </p>
              <p className="text-yellow-200 text-xs mt-0.5">
                📍 {pointCount} pontos | 📏 {formatDistance(totalDistance)}
              </p>
              {(modo === 'area' || modo === 'queimada') && liveArea !== null && (
                <p className={`text-sm font-bold mt-1 ${modo === 'queimada' ? 'text-orange-100' : 'text-yellow-100'}`}>
                  {modo === 'queimada' ? '🔥' : '📐'} {convertArea(liveArea, unit)}
                </p>
              )}
              {modo === 'odometro' && (
                <p className="text-blue-200 text-sm font-bold mt-1">
                  🛣️ {formatDistance(totalDistance)}
                </p>
              )}
            </div>
          )}

          {/* Resultado final — Área comum ou área queimada */}
          {calculatedArea !== null && (modo === 'area' || modo === 'queimada') && (
            <div className={modo === 'queimada'
              ? 'bg-orange-900 bg-opacity-55 border border-orange-600 rounded-lg p-3'
              : 'bg-green-900 bg-opacity-50 border border-green-600 rounded-lg p-3'}>
              <p className={`text-xs font-semibold mb-1 ${modo === 'queimada' ? 'text-orange-200' : 'text-green-300'}`}>
                {modo === 'queimada' ? '🔥 Área Queimada Calculada:' : '✅ Área Calculada:'}
              </p>
              <p className={`text-2xl font-bold ${modo === 'queimada' ? 'text-orange-200' : 'text-green-400'}`}>
                {convertArea(calculatedArea * 10000, unit)}
              </p>
              <div className={`mt-2 space-y-0.5 border-t pt-2 ${modo === 'queimada' ? 'border-orange-800' : 'border-green-800'}`}>
                <p className={`text-xs ${modo === 'queimada' ? 'text-orange-200' : 'text-green-300'}`}>📐 {calculatedArea.toFixed(4)} ha</p>
                <p className={`text-xs ${modo === 'queimada' ? 'text-orange-200' : 'text-green-300'}`}>📐 {(calculatedArea / HA_PER_ALQUEIRE_SP).toFixed(4)} alqueires</p>
                <p className={`text-xs ${modo === 'queimada' ? 'text-orange-200' : 'text-green-300'}`}>📐 {Math.round(calculatedArea * 10000).toLocaleString('pt-BR')} m²</p>
                <p className={`text-xs ${modo === 'queimada' ? 'text-orange-200' : 'text-green-300'}`}>📐 {(calculatedArea / 100).toFixed(6)} km²</p>
              </div>
              <p className={`text-xs mt-2 ${modo === 'queimada' ? 'text-orange-200' : 'text-green-400'}`}>
                📍 {pointCount} pontos | 📏 {formatDistance(totalDistance)}
              </p>
              {modo === 'queimada' && lastMeasurement && (
                <div className="bp-gps-measurement-metrics">
                  <span>Área técnica <strong>{formatMeasurementArea(lastMeasurement)}</strong></span>
                  <span>Perímetro <strong>{formatDistance(lastMeasurement.perimeterM)}</strong></span>
                  <span>Precisão média <strong>{lastMeasurement.averageAccuracyM == null ? '—' : `±${lastMeasurement.averageAccuracyM.toFixed(0)} m`}</strong></span>
                  <span>Melhor sinal <strong>{lastMeasurement.bestAccuracyM == null ? '—' : `±${lastMeasurement.bestAccuracyM.toFixed(0)} m`}</strong></span>
                  <span>Duração <strong>{Math.max(1, Math.round(lastMeasurement.durationMs / 60000))} min</strong></span>
                </div>
              )}
              {modo === 'queimada' && lastMeasurement && (
                <button
                  type="button"
                  onClick={saveBurnedArea}
                  disabled={savedMeasurementId === lastMeasurement.id}
                  className="bp-gps-save-button"
                >
                  {savedMeasurementId === lastMeasurement.id ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {savedMeasurementId === lastMeasurement.id ? 'Área salva no aparelho' : 'Salvar como área queimada'}
                </button>
              )}
            </div>
          )}

          {/* Resultado final — Odômetro */}
          {!isActive && totalDistance > 0 && modo === 'odometro' && (
            <div className="bg-blue-900 bg-opacity-50 border border-blue-600 rounded-lg p-3">
              <p className="text-blue-300 text-xs font-semibold mb-1">✅ Distância Percorrida:</p>
              <p className="text-blue-400 text-2xl font-bold">
                {formatDistance(totalDistance)}
              </p>
              <p className="text-blue-300 text-xs mt-1">
                📍 {pointCount} pontos registrados
              </p>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="bg-red-900 bg-opacity-50 border border-red-700 rounded-lg p-2">
              <p className="text-red-300 text-xs">{error}</p>
            </div>
          )}

          {/* Instruções iniciais */}
          {!isActive && calculatedArea === null && totalDistance === 0 && !error && (
            <div className="bg-gray-800 rounded-lg p-2">
              <p className="text-gray-300 text-xs font-semibold mb-1">
                {modo === 'area' ? '📐 Como medir área:' : modo === 'queimada' ? '🔥 Como medir área queimada:' : '🚛 Como usar o odômetro:'}
              </p>
              {modo === 'area' || modo === 'queimada' ? (
                <p className="text-gray-400 text-xs leading-relaxed">
                  1. Escolha a unidade desejada<br/>
                  2. Toque em "Iniciar Medição"<br/>
                  3. Caminhe a pé contornando toda a área<br/>
                  4. Use "Pausar" quando precisar interromper<br/>
                  5. Toque em "Parar e Calcular" ao finalizar
                </p>
              ) : (
                <p className="text-gray-400 text-xs leading-relaxed">
                  1. Toque em "Iniciar Odômetro"<br/>
                  2. Dirija normalmente<br/>
                  3. A distância é calculada em tempo real<br/>
                  4. Use "Pausar" para parar temporariamente<br/>
                  5. Toque em "Parar" ao finalizar
                </p>
              )}
            </div>
          )}

          {/* Botões de ação */}
          <div className="space-y-1.5">
            {!isActive ? (
              <button
                onClick={startMeasurement}
                data-testid="gps-start-measurement"
                className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 px-3 rounded-lg text-sm transition active:scale-95 ${
                  modo === 'area'
                    ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                    : modo === 'queimada'
                      ? 'bg-orange-600 hover:bg-orange-500 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {modo === 'queimada' ? <Flame className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {modo === 'area' || modo === 'queimada' ? 'Iniciar Medição' : 'Iniciar Odômetro'}
              </button>
            ) : (
              <>
                {/* Pausa / Retomar */}
                {!isPaused ? (
                  <button
                    onClick={pauseMeasurement}
                    className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-3 rounded-lg text-sm transition active:scale-95"
                  >
                    <Pause className="w-4 h-4" />
                    Pausar
                  </button>
                ) : (
                  <button
                    onClick={resumeMeasurement}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded-lg text-sm transition active:scale-95"
                  >
                    <Play className="w-4 h-4" />
                    Retomar
                  </button>
                )}

                {/* Parar e Calcular */}
                <button
                  data-testid="gps-stop-measurement"
                  onClick={stopMeasurement}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-3 rounded-lg text-sm transition active:scale-95"
                >
                  <StopCircle className="w-4 h-4" />
                  {modo === 'area' || modo === 'queimada' ? 'Parar e Calcular' : 'Parar Odômetro'}
                </button>
              </>
            )}

            {(trail.length > 0 || calculatedArea !== null || totalDistance > 0) && (
              <button
                onClick={clearMeasurement}
                className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 px-3 rounded-lg text-xs transition active:scale-95"
              >
                <Trash2 className="w-3 h-3" />
                Limpar Tudo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Renderizar trilha no mapa */}
      {trailGeoJSON && (
        <Source id="trator-trail" type="geojson" data={trailGeoJSON as any}>
          {trail.length >= 3 && (modo === 'area' || modo === 'queimada') && (
            <Layer
              id="trator-area-fill"
              type="fill"
              filter={['==', '$type', 'Polygon']}
              paint={{ 'fill-color': modo === 'queimada' ? '#ef4444' : '#f59e0b', 'fill-opacity': modo === 'queimada' ? 0.24 : 0.2 }}
            />
          )}
          <Layer
            id="trator-trail-line"
            type="line"
            filter={['==', '$type', 'LineString']}
            paint={{
              'line-color': modo === 'queimada' ? '#ef4444' : modo === 'area' ? '#f59e0b' : '#3b82f6',
              'line-width': 3,
              'line-dasharray': [2, 1],
            }}
          />
        </Source>
      )}

      {/* Marcador de início */}
      {trail.length > 0 && (
        <Marker longitude={trail[0].lng} latitude={trail[0].lat} anchor="center">
          <div
            className="w-5 h-5 bg-green-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
            title="Início"
            style={{ fontSize: 10, color: 'white', fontWeight: 'bold' }}
          >
            A
          </div>
        </Marker>
      )}

      {/* Marcador de posição atual com logotipo — oculto se WazeGPS estiver ativo */}
      {trail.length > 1 && isActive && !isPaused && !isWazeActive && (
        <Marker longitude={trail[trail.length - 1].lng} latitude={trail[trail.length - 1].lat} anchor="center">
          <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
            {/* Anel de precisão pulsante */}
            <div
              className="absolute rounded-full border-2 opacity-20 animate-pulse"
              style={{
                width: 52,
                height: 52,
                borderColor: modo === 'queimada' ? '#ef4444' : modo === 'area' ? '#f59e0b' : '#3b82f6',
              }}
            />
            {/* Anel interno */}
            <div
              className="absolute rounded-full border opacity-50"
              style={{
                width: 44,
                height: 44,
                borderColor: modo === 'queimada' ? '#ef4444' : modo === 'area' ? '#f59e0b' : '#3b82f6',
                borderWidth: 2,
              }}
            />
            {/* Logotipo da empresa */}
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `3px solid ${modo === 'queimada' ? '#ef4444' : modo === 'area' ? '#f59e0b' : '#3b82f6'}`,
                boxShadow: `0 0 12px ${modo === 'queimada' ? '#ef444488' : modo === 'area' ? '#f59e0b88' : '#3b82f688'}, 0 2px 6px rgba(0,0,0,0.5)`,
                background: 'white',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <img
                src="/header-logo.png"
                alt="Posição atual"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            {/* Indicador de modo (pequeno badge) */}
            <div
              className="absolute -bottom-4 text-white text-xs font-bold px-1 py-0.5 rounded"
              style={{
                fontSize: 9,
                whiteSpace: 'nowrap',
                background: modo === 'queimada' ? '#ef4444' : modo === 'area' ? '#f59e0b' : '#3b82f6',
              }}
            >
              {modo === 'queimada' ? '🔥 Queimada' : modo === 'area' ? '📐 Área' : '🚛 Odo'}
            </div>
          </div>
        </Marker>
      )}

      {/* Painel renderizado via portal */}
      {createPortal(panel, document.body)}
    </>
  );
}
