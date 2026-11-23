import React, { lazy, Suspense, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Maximize2, SlidersHorizontal, X, Eye, Compass, Construction, PencilRuler, Plus as PlusIcon, Satellite, Map as MapIcon, Wrench, ChevronDown, ChevronUp, Flame, LocateFixed, DownloadCloud, WifiOff } from 'lucide-react';
import RouteNavigator from './RouteNavigator';
import MapOfflineControls from './MapOfflineControls';
import MapVisibilityControl from './MapVisibilityControl';
import { PoiCategoryIcon, PoiMarkerIcon, WATER_TRUCK_ICON } from './PoiMarkerIcon';
import MapBottomSheet from './MapBottomSheet';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

import Map, { Source, Layer, Marker } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';

import 'mapbox-gl/dist/mapbox-gl.css';
import { usePOIManager, POI, CATEGORY_MAP, getTransportMaterial } from './POIManager';
import { centroid as turfCentroid } from '@turf/turf';
import { measurementCenter, type GpsAreaMeasurement } from '@/lib/gpsMeasurement';
import { decodeUtf8Base64 } from '@/lib/base64';

import { MAP_CONFIG, COLORS } from '@/config/constants';
import type { LayerProps } from 'react-map-gl';
import { useMapOptimization } from '@/hooks/useMapOptimization';
import { getGuardedMapboxLib } from '@/lib/mapboxFogGuard';
import {
  WATER_TRUCK_CATEGORIES,
  TRUCK_CATEGORIES,
  WATER_AND_TRUCK_CATEGORIES,
  isGroupHidden,
  toggleCategoryGroup,
  filterVisiblePois,
  countCategoryGroup,
  parseHiddenCategories,
  serializeHiddenCategories,
} from '@/lib/poiVisibility';
import {
  OFFLINE_BASE_STORAGE_KEY,
  OFFLINE_MODE_STORAGE_KEY,
  type OfflineBaseMode,
  createOfflineCartographicStyle,
  loadOfflineDataset,
  saveOfflineDataset,
} from '@/lib/offlineMapEngine';
import { mapPerformanceMonitor } from '@/lib/mapPerformanceMonitor';
import { poiReconnectProfiler } from '@/lib/poiReconnectProfiler';

// Componentes usados somente após uma interação ficam fora do chunk inicial.
// As fronteiras Suspense locais abaixo não suspendem nem remontam o <Map>.
const PopupContent = lazy(() => import('./PopupContent'));
const CustomPoiPopup = lazy(() => import('./CustomPoiPopup'));
const UnmarkedAreaPopup = lazy(() => import('./UnmarkedAreaPopup'));
const CompassNavigator = lazy(() => import('./CompassNavigator'));
const ModoTrator = lazy(() => import('./ModoTrator'));
const DrawingTools = lazy(() => import('./DrawingTools'));
const ShareModal = lazy(() => import('./ShareModal'));

interface MapContainerProps {
  onMapReady?: (map: any) => void;
  geojsonData: any;
  selectedFundo?: number;
  selectedTalhao?: number;
  selectionFocusVersion?: number;
  selectionFocusZoom?: number;
  onFlyTo?: (center: [number, number], zoom: number) => void;
  onAreaClick?: (fundo: number, talhao: number) => void;
  immersive?: boolean;
  onToggleImmersive?: () => void;
}

interface FazendaFeature {
  type: 'Feature';
  properties: {
    FAZENDA: number;
    TALHAO: number;
    ZONA: number;
    AREA_TOTAL: number;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

type GeoJSONBounds = [[number, number], [number, number]];

function getFeaturesBounds(features: FazendaFeature[]): GeoJSONBounds | null {
  const bounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };

  const visitCoordinates = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number' &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1])
    ) {
      bounds.minLng = Math.min(bounds.minLng, coordinates[0]);
      bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
      bounds.maxLng = Math.max(bounds.maxLng, coordinates[0]);
      bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);
      return;
    }

    coordinates.forEach(visitCoordinates);
  };

  features.forEach((feature) => visitCoordinates(feature.geometry?.coordinates));

  if (
    !Number.isFinite(bounds.minLng) ||
    !Number.isFinite(bounds.minLat) ||
    !Number.isFinite(bounds.maxLng) ||
    !Number.isFinite(bounds.maxLat)
  ) {
    return null;
  }

  return [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]];
}

interface PopupData {
  fundo: number;
  talhao: number;
  zona: string;
  hectares: string;
  lng: number;
  lat: number;
  isCustom?: boolean;
  customMessage?: string;
  poiId?: string;
  isMarkedArea?: boolean;
}

// ── Paleta dos fundos e talhões ─────────────────────────────────────────────
// A troca de tema altera somente a interface. As áreas demarcadas continuam
// usando exatamente a paleta original do tema padrão em Atual, Claro e Escuro.
function createFarmLayerPalette(_theme: Theme) {
  return {
    fill: COLORS.POLYGON_FILL,
    selectedFill: COLORS.POLYGON_SELECTED,
    outline: COLORS.POLYGON_STROKE,
    selectedOutline: COLORS.POLYGON_STROKE_SELECTED,
    inner: 'rgba(255, 255, 255, 0.12)',
    outer: 'rgba(192, 204, 192, 0.35)',
    label: '#333333',
    labelHalo: 'rgba(255, 255, 255, 0.5)',
  };
}

function createFarmLayers(theme: Theme): {
  fill: LayerProps;
  outline: LayerProps;
  inner: LayerProps;
  outer: LayerProps;
} {
  const palette = createFarmLayerPalette(theme);
  return {
    fill: { id: 'fazendas-fill', type: 'fill', paint: { 'fill-color': palette.fill, 'fill-opacity': 0.5 } },
    outline: { id: 'fazendas-outline', type: 'line', paint: { 'line-color': palette.outline, 'line-width': 2, 'line-opacity': 0.8 } },
    inner: { id: 'fazendas-inner-glow', type: 'line', paint: { 'line-color': palette.inner, 'line-width': 1, 'line-opacity': 0.6, 'line-offset': -2 } },
    outer: { id: 'fazendas-outer-glow', type: 'line', paint: { 'line-color': palette.outer, 'line-width': 4, 'line-opacity': 0.3, 'line-blur': 3 } },
  };
}

// Rótulos curtos para os chips de filtro por categoria (mais legíveis que os títulos completos)
const CAT_SHORT_LABEL: Record<string, string> = {
  represa: 'Represa', marcacao: 'Marcação', poco: 'Poço', bomba: 'Bomba', outro: 'Outro',
  irrigacao: 'Irrigação', irrigar: 'Irrigar', eucalipto: 'Eucalipto', soja: 'Soja',
  dessecada: 'Dessecada', adubo: 'Adubo', tubulacao: 'Tubulação', implemento: 'Implemento',
  transporte_insumo: 'Transporte', perigo: 'Perigo', incendio: 'Incêndio', queimada: 'Queimada',
};
const catShortLabel = (cat: string) => CAT_SHORT_LABEL[cat] || (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Marcação');

export default function MapContainer({
  onMapReady,
  geojsonData,
  selectedFundo,
  selectedTalhao,
  selectionFocusVersion = 0,
  selectionFocusZoom,
  onFlyTo,
  onAreaClick,
  immersive = false,
  onToggleImmersive,
}: MapContainerProps) {
  const { setShowModal, setSelectedCoords, pois, updatePOI, setPois, importSharedPois, popupData, setPopupData, deletePOI, addPOI, pendingCount, forceSync } = usePOIManager();
  const { theme } = useTheme();
  const farmPalette = useMemo(() => createFarmLayerPalette(theme), [theme]);
  const farmLayers = useMemo(() => createFarmLayers(theme), [theme]);
  const { preloadGeoJSON, optimizeRendering, prewarmTiles, initDB } = useMapOptimization();
  const mapRef = useRef<MapRef>(null);
  const mountStartRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const initialMarkersMeasuredRef = useRef(false);
  const visiblePoisRef = useRef<POI[]>([]);

  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    mapPerformanceMonitor.recordPhase('map-shell-mount', Math.max(0, now - mountStartRef.current));
    mapPerformanceMonitor.startPhase('map-style-load');
  }, []);
  // ─────────────────────────────────────────────────────────────────────────
  // Visibilidade dos marcadores (estilo Google Maps) + filtros por categoria.
  // Tudo é ajustável pelo usuário no painel "Camadas e Filtros" e fica salvo.
  // ─────────────────────────────────────────────────────────────────────────
  const POI_ZOOM_KEY = 'mapas-bp-poi-zoom';
  const POI_LABELS_KEY = 'mapas-bp-poi-labels';
  const POI_HIDDEN_CATS_KEY = 'mapas-bp-hidden-cats';
  const POI_SCALE_KEY = 'mapas-bp-poi-scale';
  // Zoom mínimo a partir do qual os ícones (e legendas) aparecem. Menor = aparecem de mais longe.
  // Padrão sugerido: 10 (marcações visíveis "agora", desde bem longe).
  const [iconMinZoom, setIconMinZoom] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem(POI_ZOOM_KEY) || '');
    return Number.isFinite(v) ? Math.min(18, Math.max(10, v)) : 10;
  });
  // Mostrar as legendas (nomes) já num zoom intermediário, junto com os ícones.
  // Padrão sugerido: desativado (mapa mais limpo; usuário liga se quiser).
  const [showLabels, setShowLabels] = useState<boolean>(() => {
    const v = localStorage.getItem(POI_LABELS_KEY);
    return v === null ? false : v === '1';
  });
  // Categorias ocultas (filtro). Vazio = mostra todas.
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    try { return parseHiddenCategories(localStorage.getItem(POI_HIDDEN_CATS_KEY)); } catch { return new Set(); }
  });
  // ── Modo Offline Profissional ─────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [offlineModeEnabled, setOfflineModeEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(OFFLINE_MODE_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [offlineBaseMode, setOfflineBaseMode] = useState<OfflineBaseMode>(() => {
    try {
      const saved = localStorage.getItem(OFFLINE_BASE_STORAGE_KEY);
      return saved === 'cached-satellite' ? 'cached-satellite' : 'cartographic';
    } catch {
      return 'cartographic';
    }
  });
  const [showOfflineCenter, setShowOfflineCenter] = useState(false);
  const [viewportBounds, setViewportBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const effectiveOffline = !isOnline || offlineModeEnabled;
  const useCartographicOffline = effectiveOffline && offlineBaseMode === 'cartographic';

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

  useEffect(() => {
    try { localStorage.setItem(OFFLINE_MODE_STORAGE_KEY, offlineModeEnabled ? '1' : '0'); } catch { /* noop */ }
  }, [offlineModeEnabled]);

  useEffect(() => {
    try { localStorage.setItem(OFFLINE_BASE_STORAGE_KEY, offlineBaseMode); } catch { /* noop */ }
  }, [offlineBaseMode]);
  // Tamanho (escala) dos ícones das marcações. 1 = padrão, 0.7 = padrão sugerido (mais leve).
  const [markerScale, setMarkerScale] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem(POI_SCALE_KEY) || '');
    return Number.isFinite(v) ? Math.min(1.8, Math.max(0.5, v)) : 0.7;
  });
  // Marcação sob o mouse (para mostrar a legenda completa ao passar o mouse no desktop).
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  // Zoom atual do mapa (arredondado para reduzir re-renderizações).
  const [zoom, setZoom] = useState<number>(MAP_CONFIG.DEFAULT_ZOOM);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [toolsMenuMounted, setToolsMenuMounted] = useState(false);
  const toolsMenuCloseTimerRef = useRef<number | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const closeToolsMenu = useCallback(() => {
    setShowToolsMenu(false);
    if (toolsMenuCloseTimerRef.current !== null) window.clearTimeout(toolsMenuCloseTimerRef.current);
    toolsMenuCloseTimerRef.current = window.setTimeout(() => {
      setToolsMenuMounted(false);
      toolsMenuCloseTimerRef.current = null;
    }, 190);
  }, []);
  const toggleToolsMenu = useCallback(() => {
    if (showToolsMenu) {
      closeToolsMenu();
      return;
    }
    if (toolsMenuCloseTimerRef.current !== null) window.clearTimeout(toolsMenuCloseTimerRef.current);
    setToolsMenuMounted(true);
    setShowToolsMenu(true);
  }, [closeToolsMenu, showToolsMenu]);
  const updateZoom = useCallback((z: number) => {
    const r = Math.round(z * 4) / 4;
    setZoom((prev) => (prev === r ? prev : r));
  }, []);
  // Persistência
  useEffect(() => { try { localStorage.setItem(POI_ZOOM_KEY, String(iconMinZoom)); } catch { /* noop */ } }, [iconMinZoom]);
  useEffect(() => { try { localStorage.setItem(POI_LABELS_KEY, showLabels ? '1' : '0'); } catch { /* noop */ } }, [showLabels]);
  useEffect(() => { try { localStorage.setItem(POI_HIDDEN_CATS_KEY, serializeHiddenCategories(hiddenCategories)); } catch { /* noop */ } }, [hiddenCategories]);
  useEffect(() => { try { localStorage.setItem(POI_SCALE_KEY, String(markerScale)); } catch { /* noop */ } }, [markerScale]);

  useEffect(() => {
    if (!showToolsMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) closeToolsMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeToolsMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeToolsMenu, showToolsMenu]);

  const toggleCategory = useCallback((cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const toggleVisibilityGroup = useCallback((categories: readonly string[]) => {
    setHiddenCategories((prev) => toggleCategoryGroup(prev, categories));
  }, []);
  // Zoom de abertura do mapa (definido pelo usuário). Padrão sugerido: 11.5.
  const POI_DEFAULT_ZOOM_KEY = 'mapas-bp-default-zoom';
  const [defaultZoom, setDefaultZoom] = useState<number | null>(() => {
    const v = parseFloat(localStorage.getItem(POI_DEFAULT_ZOOM_KEY) || '');
    return Number.isFinite(v) ? v : 11.5;
  });
  const saveDefaultZoom = useCallback(() => {
    const z = Math.round(((mapRef.current?.getMap?.()?.getZoom?.()) ?? zoom) * 4) / 4;
    setDefaultZoom(z);
    try { localStorage.setItem(POI_DEFAULT_ZOOM_KEY, String(z)); } catch { /* noop */ }
  }, [zoom]);
  const clearDefaultZoom = useCallback(() => {
    setDefaultZoom(null);
    try { localStorage.removeItem(POI_DEFAULT_ZOOM_KEY); } catch { /* noop */ }
  }, []);
  const [mapStyle, setMapStyle] = useState<string>('mapbox://styles/mapbox/satellite-streets-v12');
  const [showMapStyleSelector, setShowMapStyleSelector] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareData, setShareData] = useState<{ fundo: string | number, talhao: string | number, zona: string, lng: number, lat: number, pois: POI[], farmName?: string } | null>(null);
  const [initialPoisLoaded, setInitialPoisLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [sharedPoiFallback, setSharedPoiFallback] = useState<POI | null>(null);
  const sharedPoiHandledRef = useRef(false);
  const sharedPoiCoordinateCenteredRef = useRef(false);
  // Pontos únicos por (FAZ, TAL) usados exclusivamente para renderizar o
  // número do talhão. Evita que Mapbox desenhe um rótulo para cada polígono
  // interno de um MultiPolygon (raiz do problema de números sobrepostos).
  const [labelsData, setLabelsData] = useState<any>(null);

  // ── GPS Waze ──────────────────────────────────────────────────────────────
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsHeading, setGpsHeading] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number>(0);

  // ── Bússola ───────────────────────────────────────────────────────────────
  const [showCompass, setShowCompass] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  // Destino de navegação livre (ex.: foco de incêndio). Sobrepõe o talhão selecionado.
  const [navTarget, setNavTarget] = useState<{ lat: number; lng: number; name: string } | null>(null);

  // ── Modo Trator ───────────────────────────────────────────────────────────
  const [showModoTrator, setShowModoTrator] = useState(false);
  const [modoTratorInitialMode, setModoTratorInitialMode] = useState<'area' | 'queimada' | 'odometro'>('area');

  // ── Ferramentas de Desenho ────────────────────────────────────────────────
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  // Baixa na primeira abertura e permanece montado ao fechar para preservar
  // shapes, seleção e qualquer desenho em andamento.
  const [drawingToolsMounted, setDrawingToolsMounted] = useState(false);
  // Ref para rastrear se um modo de desenho está ativo (sem re-render)
  const isDrawingActiveRef = useRef(false);

  // ── Rota / Navegação ──────────────────────────────────────────────────────
  const [routeDestination, setRouteDestination] = useState<{ lng: number; lat: number; label: string } | null>(null);
  const [showRoute, setShowRoute] = useState(false);

  // Centróide do talhão selecionado para a bússola
  const selectedTalhaoCenter = useMemo(() => {
    if (!geojsonData || selectedFundo === undefined || selectedTalhao === undefined) return null;
    const feature = geojsonData.features.find(
      (f: FazendaFeature) => f.properties.FAZENDA === selectedFundo && f.properties.TALHAO === selectedTalhao
    );
    if (!feature) return null;
    try {
      const center = turfCentroid(feature);
      return { lng: center.geometry.coordinates[0], lat: center.geometry.coordinates[1] };
    } catch {
      return null;
    }
  }, [geojsonData, selectedFundo, selectedTalhao]);

  // ── Funções GPS ───────────────────────────────────────────────────────────
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS não suportado neste dispositivo.');
      return;
    }
    setGpsError(null);
    setGpsTracking(true);

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        setGpsAccuracy(typeof accuracy === 'number' ? accuracy : null);

        // Suavizar heading para evitar saltos bruscos
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

        setGpsPosition({ lat: latitude, lng: longitude });
        setGpsHeading(smoothHeading);

        // Centralizar mapa suavemente
        if (mapRef.current) {
          mapRef.current.easeTo({
            center: [longitude, latitude],
            duration: 500,
          });
        }
      },
      (err) => {
        let msg = 'Erro ao obter GPS.';
        if (err.code === 1) msg = 'Permissão de GPS negada. Habilite nas configurações.';
        else if (err.code === 2) msg = 'Sinal GPS indisponível. Tente em área aberta.';
        else if (err.code === 3) msg = 'Timeout do GPS.';
        setGpsError(msg);
        setGpsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, []);

  const stopGPS = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    setGpsTracking(false);
    setGpsPosition(null);
    setShowCompass(false);
    setNavTarget(null);
    setGpsAccuracy(null);
  }, []);

  // Bússola do aparelho (fallback de direção quando o GPS não fornece heading —
  // p.ex. parado). Funciona 100% offline (sensor do celular).
  useEffect(() => {
    const handler = (e: any) => {
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading; // iOS
      else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha; // Android absoluto
      if (h !== null && !isNaN(h)) setDeviceHeading(((h % 360) + 360) % 360);
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  // Iniciar navegação (GPS + bússola) até um POI — ex.: foco de incêndio.
  const navigateToPoi = useCallback((poi: POI) => {
    // iOS: pedir permissão de sensor de orientação (precisa de gesto do usuário)
    const DOE: any = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().catch(() => {});
    }
    setNavTarget({ lat: poi.lat, lng: poi.lng, name: poi.title || 'Destino' });
    if (gpsWatchRef.current === null) startGPS();
    setShowCompass(true);
    setPopupData(null);
    // aproxima a câmera do destino para dar contexto
    try {
      mapRef.current?.flyTo({ center: [poi.lng, poi.lat], zoom: Math.max(MAP_CONFIG.SELECTED_ZOOM - 1, 14), duration: 1200 });
    } catch { /* noop */ }
  }, [startGPS, setPopupData]);

  const stopNavigation = useCallback(() => {
    setNavTarget(null);
    setShowCompass(false);
  }, []);

  const handleBurnedAreaSaved = useCallback((measurement: GpsAreaMeasurement) => {
    const center = measurementCenter(measurement);
    const accuracyText = measurement.averageAccuracyM == null ? 'precisão não informada' : `precisão média ±${measurement.averageAccuracyM.toFixed(0)} m`;
    const message = [
      `Medição GPS a pé: ${measurement.areaHa.toFixed(4)} ha`,
      `Perímetro: ${(measurement.perimeterM / 1000).toFixed(3)} km`,
      `Pontos válidos: ${measurement.pointCount}`,
      accuracyText,
    ].join(' | ');
    window.dispatchEvent(new CustomEvent('openPoiModal', {
      detail: {
        fundo: selectedFundo != null ? String(selectedFundo) : 'N/A',
        talhao: selectedTalhao != null ? String(selectedTalhao) : 'N/A',
        lng: center.lng,
        lat: center.lat,
        category: 'queimada',
        title: `ÁREA QUEIMADA — ${measurement.areaHa.toFixed(4)} ha`,
        message,
      },
    }));
    setShowModoTrator(false);
  }, [selectedFundo, selectedTalhao]);

  // Atalho direto do mapa: registra o ponto atual como alerta de incêndio.
  // Se o GPS estiver ativo, a coordenada do aparelho tem prioridade sobre o centro da câmera.
  const handleOpenFireAlert = useCallback((point?: { lng: number; lat: number; fundo?: number | string; talhao?: number | string }) => {
    const map = mapRef.current?.getMap?.() ? mapRef.current.getMap() : mapRef.current;
    const center = map?.getCenter?.();
    const lng = point?.lng ?? gpsPosition?.lng ?? center?.lng;
    const lat = point?.lat ?? gpsPosition?.lat ?? center?.lat;
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return;

    window.dispatchEvent(new CustomEvent('openPoiModal', {
      detail: {
        fundo: point?.fundo != null ? String(point.fundo) : selectedFundo != null ? String(selectedFundo) : 'N/A',
        talhao: point?.talhao != null ? String(point.talhao) : selectedTalhao != null ? String(selectedTalhao) : 'N/A',
        lng,
        lat,
        category: 'incendio',
        title: 'ALERTA DE INCÊNDIO',
        message: gpsPosition
          ? 'Foco identificado na localização atual do GPS.'
          : 'Foco identificado no ponto selecionado do mapa.',
      },
    }));
    setShowModoTrator(false);
    setShowDrawingTools(false);
    isDrawingActiveRef.current = false;
    closeToolsMenu();
  }, [gpsPosition, selectedFundo, selectedTalhao]);

  // Atalho direto para iniciar a medição avançada caminhando ao redor da área.
  const handleOpenBurnedAreaMeasurement = useCallback(() => {
    setModoTratorInitialMode('queimada');
    setShowDrawingTools(false);
    isDrawingActiveRef.current = false;
    setShowModoTrator(true);
    closeToolsMenu();
  }, []);

  // Alvo da bússola: destino livre (incêndio) tem prioridade sobre o talhão selecionado
  const compassTarget = useMemo(() => {
    if (navTarget) return navTarget;
    if (selectedTalhaoCenter && selectedFundo !== undefined && selectedTalhao !== undefined) {
      return {
        lat: selectedTalhaoCenter.lat,
        lng: selectedTalhaoCenter.lng,
        name: `Fundo ${selectedFundo} — Talhão ${selectedTalhao}`,
      };
    }
    return null;
  }, [navTarget, selectedTalhaoCenter, selectedFundo, selectedTalhao]);

  // Direção efetiva: bússola do aparelho (mais confiável parado) ou heading do GPS
  const effectiveHeading = deviceHeading != null ? deviceHeading : gpsHeading;

  // Limpar GPS ao desmontar
  useEffect(() => {
    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
    };
  }, []);

  // Os polígonos vêm da Home, que já carregou o GeoJSON para a busca. Evita
  // baixar o arquivo de fazendas uma segunda vez ao montar o mapa. Rótulos são
  // complementares e persistem em IndexedDB para funcionar offline.
  useEffect(() => {
    let cancelled = false;
    const loadLabels = async () => {
      mapPerformanceMonitor.startPhase('farm-labels-load');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await loadOfflineDataset<any>('branco-peres-labels');
        if (!cancelled && Array.isArray(cached?.features)) {
          setLabelsData(cached);
          mapPerformanceMonitor.endPhase('farm-labels-load', { source: 'indexeddb', count: cached.features.length });
          return;
        }
      }
      try {
        const response = await fetch('/branco-peres-labels.json?v=186', { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const labels = await response.json();
        if (!cancelled && Array.isArray(labels.features)) {
          setLabelsData(labels);
          mapPerformanceMonitor.endPhase('farm-labels-load', { source: 'network', count: labels.features.length });
          void saveOfflineDataset('branco-peres-labels', labels);
        }
      } catch (error) {
        const cached = await loadOfflineDataset<any>('branco-peres-labels');
        if (!cancelled && Array.isArray(cached?.features)) {
          setLabelsData(cached);
          mapPerformanceMonitor.endPhase('farm-labels-load', { source: 'indexeddb-fallback', count: cached.features.length });
        } else {
          mapPerformanceMonitor.endPhase('farm-labels-load', { source: 'unavailable', count: 0 });
          console.warn('Rótulos do mapa indisponíveis:', error);
        }
      }
    };
    void loadLabels();
    return () => {
      cancelled = true;
    };
  }, []);

  // GeoJSON da área selecionada
  const selectedGeoJSON = useMemo(() => {
    if (!geojsonData || selectedFundo === undefined || selectedTalhao === undefined) return null;
    const selectedFeatures = geojsonData.features.filter(
      (feature: FazendaFeature) =>
        feature.properties.FAZENDA === selectedFundo &&
        feature.properties.TALHAO === selectedTalhao
    );
    if (selectedFeatures.length === 0) return null;
    return { type: 'FeatureCollection', features: selectedFeatures } as any;
  }, [geojsonData, selectedFundo, selectedTalhao]);

  // Para o overview de um fundo, o foco precisa considerar todos os talhões e
  // todas as partes de cada Polygon/MultiPolygon, não só o primeiro centróide.
  const focusFeatures = useMemo<FazendaFeature[]>(() => {
    if (!geojsonData || selectedFundo === undefined) return [];
    return geojsonData.features.filter(
      (feature: FazendaFeature) =>
        feature.properties.FAZENDA === selectedFundo &&
        (selectedTalhao === undefined || feature.properties.TALHAO === selectedTalhao)
    );
  }, [geojsonData, selectedFundo, selectedTalhao]);

  // A busca e o painel de detalhes não podem disputar o mesmo toque no celular.
  useEffect(() => {
    const openSearch = () => { setPopupData(null); setShowShareModal(false); };
    window.addEventListener('bp-open-farm-search', openSearch);
    return () => window.removeEventListener('bp-open-farm-search', openSearch);
  }, [setPopupData]);

  // Cada pedido explícito é consumido uma única vez. Clicar em um polígono
  // atualiza a seleção, mas não pode reaproveitar um pedido antigo de voo.
  const consumedFocusVersionRef = useRef(0);
  useEffect(() => {
    if (!selectionFocusVersion || selectionFocusVersion === consumedFocusVersionRef.current || !mapReady || selectedFundo === undefined) return;
    const map = mapRef.current?.getMap?.();
    if (!map || !focusFeatures.length) return;
    const bounds = getFeaturesBounds(focusFeatures);
    if (!bounds) return;

    // Um painel aberto pertence à seleção anterior. Não usar esses detalhes
    // para compartilhar ou criar anotações sobre a nova área.
    setPopupData(null);
    setShowShareModal(false);
    const [[west, south], [east, north]] = bounds;
    try {
      map.stop?.();
      if (selectionFocusZoom !== undefined || (west === east && south === north)) {
        map.flyTo({
          center: [(west + east) / 2, (south + north) / 2],
          zoom: selectionFocusZoom ?? MAP_CONFIG.SELECTED_ZOOM,
          duration: MAP_CONFIG.FLY_DURATION,
        });
      } else {
        // Bounds considera todas as partes da área. Zoom máximo evita saltos
        // excessivos em talhões pequenos; padding não fica acumulado na câmera.
        map.fitBounds(bounds, {
          padding: { top: 96, right: 48, bottom: 64, left: 48 },
          maxZoom: MAP_CONFIG.SELECTED_ZOOM,
          duration: MAP_CONFIG.FLY_DURATION,
        });
      }
      consumedFocusVersionRef.current = selectionFocusVersion;
    } catch (error) {
      console.error('Não foi possível enquadrar a área selecionada:', error);
    }
    // A câmera independe do idle de tiles/glyphs. Uma seleção mais recente
    // interrompe o voo anterior em vez de deixar callbacks antigos pendentes.
  }, [selectionFocusVersion, selectionFocusZoom, selectedFundo, selectedTalhao, focusFeatures, mapReady, setPopupData]);

  // Recuperação do mapa ao retornar do segundo plano no PWA/mobile.
  // Em alguns celulares (Android WebView / iOS PWA) o navegador pausa o
  // contexto WebGL quando o app fica em background e, ao retomar, o canvas
  // fica preto/branco mesmo com POIs (DOM) visíveis.
  //
  // Estratégia em camadas:
  //  1. resize + triggerRepaint em pequenos intervalos (barato, cobre 90%).
  //  2. jumpTo(center, zoom) — força o Mapbox a re-executar o pipeline
  //     completo (proj. + tiles + camadas) sem trocar estilo.
  //  3. Detecção de canvas preto (readPixels) → recarrega o estilo inteiro,
  //     que baixa tiles novos e reconstrói a cena.
  //  4. Watchdog: se ~4 s depois do resume o canvas continuar preto, mostra
  //     um botão flutuante "Recarregar mapa" para o usuário forçar a
  //     recuperação manual (última linha de defesa).
  const [mapNeedsReload, setMapNeedsReload] = useState(false);
  const watchdogTimersRef = useRef<number[]>([]);

  const isCanvasBlack = useCallback((map: any): boolean => {
    // Detecta o mapa "preto" que acontece ao voltar do segundo plano no
    // celular (a GPU descarta as texturas dos tiles e o mapa fica preto,
    // mesmo com os POIs — que são DOM — visíveis por cima).
    //
    // A leitura de pixels (readPixels) só é confiável porque o mapa é criado
    // com `preserveDrawingBuffer: true` (veja a prop no <Map/>). Sem isso, o
    // buffer é zerado após o compositing e daria falso positivo.
    try {
      const canvas = map?.getCanvas?.();
      if (!canvas) return false;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;
      // Contexto WebGL realmente perdido → definitivamente quebrado.
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return true;
      // Estilo ainda carregando não é "quebra": é só carregamento normal.
      if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return false;

      const w = Math.max(1, canvas.width | 0);
      const h = Math.max(1, canvas.height | 0);
      // Amostra 7 pontos espalhados (centro + quadrantes + meios).
      const points: Array<[number, number]> = [
        [w >> 1, h >> 1],
        [Math.floor(w * 0.25), Math.floor(h * 0.25)],
        [Math.floor(w * 0.75), Math.floor(h * 0.25)],
        [Math.floor(w * 0.25), Math.floor(h * 0.75)],
        [Math.floor(w * 0.75), Math.floor(h * 0.75)],
        [w >> 1, Math.floor(h * 0.3)],
        [w >> 1, Math.floor(h * 0.7)],
      ];
      const pixels = new Uint8Array(4);
      let read = 0;
      let black = 0;
      for (const [x, y] of points) {
        try {
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          read += 1;
          // "Preto" = todos os canais < 10 (tolerância p/ satélite escuro/noite).
          if (pixels[0] < 10 && pixels[1] < 10 && pixels[2] < 10) black += 1;
        } catch { /* ponto ignorado */ }
      }
      if (read === 0) return false;
      // Só consideramos quebrado quando praticamente TUDO está preto (>=85%),
      // evitando falso positivo em áreas legitimamente escuras.
      return black >= Math.ceil(read * 0.85);
    } catch {
      return false;
    }
  }, []);

  // Contexto WebGL realmente perdido (quebra dura, não apenas tiles em branco).
  const isContextLost = useCallback((map: any): boolean => {
    try {
      const canvas = map?.getCanvas?.();
      if (!canvas) return false;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return !!(gl && typeof gl.isContextLost === 'function' && gl.isContextLost());
    } catch {
      return false;
    }
  }, []);

  const forceStyleReload = useCallback(() => {
    // Em modo offline não forçamos recarregamento remoto de estilo (evita tela preta ou erro de rede).
    if (effectiveOffline) return true;
    const map = mapRef.current?.getMap?.();
    if (!map) return false;
    try {
      // Passa a URL original (não o objeto interno). Isso força o Mapbox a
      // baixar tiles novos e reconstruir toda a cena WebGL.
      map.setStyle(mapStyle);
      window.setTimeout(() => {
        try { map.resize(); map.triggerRepaint?.(); } catch { /* noop */ }
      }, 400);
      return true;
    } catch {
      return false;
    }
  }, [effectiveOffline, mapStyle]);

  const reloadMapManually = useCallback(() => {
    setMapNeedsReload(false);
    if (effectiveOffline) {
      setOfflineBaseMode('cartographic');
      return;
    }
    const ok = forceStyleReload();
    // Se o setStyle não resolver em 2 s, recarrega a página inteira.
    window.setTimeout(() => {
      const map = mapRef.current?.getMap?.();
      if (!ok || (map && isCanvasBlack(map))) {
        try { window.location.reload(); } catch { /* noop */ }
      }
    }, 2000);
  }, [effectiveOffline, forceStyleReload, isCanvasBlack]);

  const clearWatchdog = useCallback(() => {
    watchdogTimersRef.current.forEach((t) => window.clearTimeout(t));
    watchdogTimersRef.current = [];
  }, []);

  const startBlackCanvasWatchdog = useCallback(() => {
    clearWatchdog();
    if (effectiveOffline) return;
    // Amostras aos 2, 3.5 e 5.5 s após resume. Se o canvas estiver preto,
    // recarregamos o estilo (silenciosamente) para rebaixar os tiles. O banner
    // manual só aparece se o CONTEXTO WebGL foi realmente perdido (quebra dura),
    // evitando falso positivo quando os tiles apenas ainda não pintaram.
    const samples = [2000, 3500, 5500];
    samples.forEach((delay) => {
      const t = window.setTimeout(() => {
        const map = mapRef.current?.getMap?.();
        if (!map) return;
        if (isContextLost(map)) {
          forceStyleReload();
          setMapNeedsReload(true);
          return;
        }
        if (isCanvasBlack(map)) {
          forceStyleReload();
        } else {
          setMapNeedsReload(false);
        }
      }, delay);
      watchdogTimersRef.current.push(t);
    });
  }, [clearWatchdog, effectiveOffline, forceStyleReload, isCanvasBlack, isContextLost]);

  const recoverMapAfterResume = useCallback((reason = 'resume', opts?: { watchdog?: boolean; forceReload?: boolean }) => {
    const runWatchdog = opts?.watchdog !== false;
    const forceReload = opts?.forceReload === true;
    const delays = [0, 120, 360, 900, 1800];

    delays.forEach((delay, idx) => {
      window.setTimeout(() => {
        const map = mapRef.current?.getMap?.();
        if (!map) return;

        try {
          map.resize();
          map.triggerRepaint?.();

          // Nudge micro-transform: alguns celulares só re-renderizam se o
          // viewState "muda". jumpTo garante isso sem animar/mudar visual.
          try {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const bearing = map.getBearing?.() ?? 0;
            const pitch = map.getPitch?.() ?? 0;
            map.jumpTo({ center, zoom, bearing, pitch });
          } catch { /* noop */ }

          const canvas = map.getCanvas?.();
          if (canvas) {
            canvas.style.visibility = 'hidden';
            void canvas.offsetHeight;
            canvas.style.visibility = 'visible';
          }

          // Recarrega estilo antes na 3ª tentativa (aos 360 ms), caso já
          // esteja preto — muito antes do último recurso.
          if ((idx === 2 || idx === delays.length - 1) && isCanvasBlack(map)) {
            forceStyleReload();
          }
        } catch (error) {
          console.warn(`[Mapa] Falha ao recuperar renderização após ${reason}:`, error);
        }
      }, delay);
    });

    // Ao voltar de um background mais longo (ou bfcache), a GPU costuma ter
    // descartado as texturas dos tiles. Recarregar o estilo re-baixa os tiles
    // e reconstrói a cena — recuperação silenciosa e confiável.
    if (forceReload) {
      window.setTimeout(() => { forceStyleReload(); }, 250);
    }

    // Watchdog observa o canvas depois das tentativas (não roda no 'load').
    if (runWatchdog) startBlackCanvasWatchdog();
  }, [forceStyleReload, isCanvasBlack, startBlackCanvasWatchdog]);

  useEffect(() => {
    let backgroundedAt: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundedAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        const awayMs = backgroundedAt ? Date.now() - backgroundedAt : 0;
        // Ficou mais de ~3 s em background → a GPU pode ter descartado as
        // texturas dos tiles. Recarrega o estilo (silencioso) para garantir
        // que o mapa volte a desenhar, além das tentativas leves.
        recoverMapAfterResume('visibilitychange', { forceReload: awayMs > 3000 });
        backgroundedAt = null;
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      // event.persisted === true → veio do bfcache: cena quase sempre obsoleta.
      recoverMapAfterResume(event?.persisted ? 'pageshow-bfcache' : 'pageshow', { forceReload: !!event?.persisted });
    };
    const handleFocus = () => recoverMapAfterResume('focus');
    const handleOrientationChange = () => recoverMapAfterResume('orientationchange');
    const handleResize = () => recoverMapAfterResume('window-resize');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow as EventListener);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow as EventListener);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);
    };
  }, [recoverMapAfterResume]);

  // Clique no mapa
  const handleMapClick = useCallback(
    (event: any) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      // Bloquear popups quando ferramenta de desenho estiver ativa
      if (isDrawingActiveRef.current) return;
      const features = map.queryRenderedFeatures(event.point, { layers: ['fazendas-fill'] });
      const lng = event.lngLat.lng;
      const lat = event.lngLat.lat;

      if (features.length > 0) {
        const feature = features[0] as any;
        const properties = feature.properties;
        const fundo = Number(properties.FAZENDA);
        const talhao = Number(properties.TALHAO);
        const zona = properties.ZONA || 'N/A';
        const hectares = properties.AREA_TOTAL && !isNaN(Number(properties.AREA_TOTAL))
          ? Number(properties.AREA_TOTAL).toFixed(2) + ' ha'
          : 'N/A';
        onAreaClick?.(fundo, talhao);
        setPopupData({ fundo, talhao, zona, hectares, lng, lat, isMarkedArea: true });
      } else {
        setPopupData({ fundo: 0, talhao: 0, zona: 'Área Não Demarcada', hectares: 'N/A', lng, lat, isMarkedArea: false });
      }
    },
    [onAreaClick]
  );

  const syncViewportBounds = useCallback(() => {
    try {
      const map = mapRef.current?.getMap?.();
      const b = map?.getBounds?.();
      if (!b) return;
      setViewportBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    } catch { /* noop */ }
  }, []);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      mapPerformanceMonitor.endPhase('map-style-load', {
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      });
      onMapReady?.(map);
      setMapReady(true);
      syncViewportBounds();
      recoverMapAfterResume('load', { watchdog: false });
      try { updateZoom(map.getZoom()); } catch { /* noop */ }

      try {
        map.on('webglcontextrestored', () => {
          // Ao restaurar o contexto, recarregamos o estilo para reconstruir
          // todas as camadas/tiles perdidos.
          setMapNeedsReload(false);
          try {
            const style = map.getStyle?.();
            if (style) map.setStyle(style);
          } catch { /* noop */ }
          recoverMapAfterResume('webglcontextrestored', { forceReload: true });
        });

        // Permitir que o navegador restaure o contexto após perda
        // (importante em Android WebView quando o app fica em background).
        const canvas = map.getCanvas?.();
        if (canvas) {
          canvas.addEventListener('webglcontextlost', (event: Event) => {
            event.preventDefault();
            console.warn('[Mapa] webglcontextlost — aguardando restauração automática.');
            // Última linha de defesa: se em ~4 s o contexto não voltar, oferece
            // o botão de recarregar (quebra dura real, não apenas tiles).
            window.setTimeout(() => {
              if (isContextLost(map)) setMapNeedsReload(true);
            }, 4000);
          }, false);
        }
      } catch (error) {
        console.warn('[Mapa] Não foi possível registrar recuperação WebGL:', error);
      }
    }
  }, [onMapReady, recoverMapAfterResume, updateZoom, isContextLost]);

  // Carregar POIs da URL — preserva category para exibir imagem/ícone no dispositivo receptor
  useEffect(() => {
    if (initialPoisLoaded || !mapReady) return;
    const urlParams = new URLSearchParams(window.location.search);
    const serializedPois = urlParams.get('pois');
    const serializedPoi = urlParams.get('poiData');
    const sharedPoiId = urlParams.get('poi');

    if (serializedPoi) {
      try {
        const decoded = JSON.parse(decodeUtf8Base64(serializedPoi));
        const parsedPoi = Array.isArray(decoded) ? decoded[0] : decoded;
        if (parsedPoi && sharedPoiId && String(parsedPoi.id) === sharedPoiId) {
          setSharedPoiFallback({
            id: String(parsedPoi.id),
            lat: Number(parsedPoi.lat),
            lng: Number(parsedPoi.lng),
            title: parsedPoi.title || 'Marcação compartilhada',
            description: parsedPoi.description || '',
            category: parsedPoi.category || 'marcacao',
            type: parsedPoi.type || 'custom',
            message: parsedPoi.message || '',
            fundo: parsedPoi.fundo,
            talhao: parsedPoi.talhao,
            implementoAgr: parsedPoi.implementoAgr,
            transportMaterial: parsedPoi.transportMaterial,
            transportFormula: typeof parsedPoi.transportFormula === 'string' ? parsedPoi.transportFormula : undefined,
            transportQuantity: parsedPoi.transportQuantity == null ? undefined : Number(parsedPoi.transportQuantity),
            transportUnit: parsedPoi.transportUnit || (parsedPoi.transportMaterial === 'reativo_bigbag' ? 'bigbags' : parsedPoi.transportMaterial ? 'toneladas' : undefined),
            transportTrips: Array.isArray(parsedPoi.transportTrips) ? parsedPoi.transportTrips : undefined,
            createdAt: parsedPoi.createdAt || Date.now(),
          });
        }
      } catch (error) {
        console.error('Erro ao decodificar a marcação compartilhada:', error);
      }
    }

    if (serializedPois) {
      try {
        const decoded = JSON.parse(decodeUtf8Base64(serializedPois));
        // Garantir que cada POI tenha id e category válidos
        const parsedPois: POI[] = (Array.isArray(decoded) ? decoded : []).map((p: any, idx: number) => ({
          id: p.id || `poi-shared-${Date.now()}-${idx}`,
          lat: Number(p.lat),
          lng: Number(p.lng),
          title: p.title || 'POI Compartilhado',
          description: p.description || '',
          category: p.category || 'marcacao',
          type: p.type || 'custom',
          message: p.message || '',
          fundo: p.fundo,
          talhao: p.talhao,
          implementoAgr: p.implementoAgr,
          transportMaterial: p.transportMaterial,
          transportFormula: typeof p.transportFormula === 'string' ? p.transportFormula : undefined,
          transportQuantity: p.transportQuantity == null ? undefined : Number(p.transportQuantity),
          transportUnit: p.transportUnit || (p.transportMaterial === 'reativo_bigbag' ? 'bigbags' : p.transportMaterial ? 'toneladas' : undefined),
          transportTrips: Array.isArray(p.transportTrips) ? p.transportTrips : undefined,
          createdAt: p.createdAt || Date.now(),
        }));
        // POIs compartilhados via link: importa sem sobrescrever os existentes
        // (o banco Supabase e a fonte da verdade; a foto fica preservada)
        importSharedPois(parsedPois);
        setInitialPoisLoaded(true);
        if (parsedPois.length > 0) {
          const firstPoi = parsedPois[0];
          mapRef.current?.flyTo({
            center: [firstPoi.lng, firstPoi.lat],
            zoom: MAP_CONFIG.SELECTED_ZOOM,
            duration: MAP_CONFIG.FLY_DURATION,
          });
        }
      } catch (error) {
        console.error('Erro ao desserializar POIs da URL:', error);
      }
    } else {
      setInitialPoisLoaded(true);
    }
  }, [importSharedPois, initialPoisLoaded, mapReady]);

  // Link compartilhado canônico: centraliza e abre a marcação correta assim que
  // ela chega do Supabase (ou usa o payload do link como fallback offline).
  // Enquanto os dados ainda chegam, lat/lng do próprio link já posicionam o mapa.
  useEffect(() => {
    if (!mapReady || sharedPoiHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const poiId = params.get('poi');
    if (!poiId) return;

    const paramLat = Number(params.get('lat'));
    const paramLng = Number(params.get('lng'));
    const hasCoordinateFallback = Number.isFinite(paramLat) && Number.isFinite(paramLng);
    const target = pois.find((poi) => poi.id === poiId) || (sharedPoiFallback?.id === poiId ? sharedPoiFallback : null);

    if (!target) {
      if (hasCoordinateFallback && !sharedPoiCoordinateCenteredRef.current) {
        sharedPoiCoordinateCenteredRef.current = true;
        mapRef.current?.flyTo({
          center: [paramLng, paramLat],
          zoom: MAP_CONFIG.SELECTED_ZOOM,
          duration: MAP_CONFIG.FLY_DURATION,
        });
      }
      return;
    }

    sharedPoiHandledRef.current = true;
    mapRef.current?.flyTo({
      center: [target.lng, target.lat],
      zoom: MAP_CONFIG.SELECTED_ZOOM,
      duration: MAP_CONFIG.FLY_DURATION,
    });
    setPopupData({
      fundo: target.fundo || 0,
      talhao: target.talhao || 0,
      zona: target.category || 'Marcação',
      hectares: 'N/A',
      lng: target.lng,
      lat: target.lat,
      customMessage: target.message,
      isCustom: true,
      poiId: target.id,
    });
  }, [mapReady, pois, setPopupData, sharedPoiFallback]);

  const isSatellite = mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12';

  // Dedupe defensivo por id: garante que nunca renderizemos dois marcadores
  // para o mesmo POI (evita "marcação duplicada" no mapa).
  // OBS: `Map` aqui é o componente do react-map-gl (import default), então NÃO
  // podemos usar `new Map()`. Usamos um Set de ids vistos.
  const uniquePois = useMemo(() => {
    const seen = new Set<string>();
    const out: POI[] = [];
    for (const p of pois) {
      if (!p || !p.id) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [pois]);

  const activeCustomPoi = useMemo(() => {
    if (!popupData?.isCustom || !popupData.poiId) return null;
    return uniquePois.find((p) => p.id === popupData.poiId)
      || (sharedPoiFallback?.id === popupData.poiId ? sharedPoiFallback : null);
  }, [popupData, uniquePois, sharedPoiFallback]);
  const isTransportPanel = activeCustomPoi?.category === 'transporte_insumo';

  // Categorias presentes nas marcações atuais (para montar os chips de filtro).
  const presentCategories = useMemo(() => {
    const s = new Set<string>();
    uniquePois.forEach((p) => s.add(p.category || 'marcacao'));
    return Array.from(s);
  }, [uniquePois]);

  // Marcações visíveis após o filtro por categoria.
  const visiblePois = useMemo(
    () => filterVisiblePois(uniquePois, hiddenCategories),
    [uniquePois, hiddenCategories]
  );
  visiblePoisRef.current = visiblePois;

  // Mede pintura inicial dos marcadores POI assim que o mapa e os pontos estão prontos
  useEffect(() => {
    if (!mapReady || visiblePois.length === 0 || initialMarkersMeasuredRef.current) return;
    initialMarkersMeasuredRef.current = true;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const rafId = window.requestAnimationFrame(() => {
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      mapPerformanceMonitor.recordPhase('poi-markers-render', Math.max(0, elapsed), {
        visibleCount: visiblePois.length,
        totalCount: uniquePois.length,
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [mapReady, visiblePois.length, uniquePois.length]);

  // Mede a pintura final dos marcadores POI após retorno da conexão offline
  useEffect(() => {
    const handleReconnectPoisUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      const totalCount = Number(detail?.count ?? visiblePoisRef.current.length);
      window.requestAnimationFrame(() => {
        const visibleCount = visiblePoisRef.current.length;
        mapPerformanceMonitor.endPhase('reconnect-poi-render', {
          visibleCount,
          totalCount,
        });
        mapPerformanceMonitor.completeReconnectCycle(totalCount);
        poiReconnectProfiler.markStageEnd('markers-paint', {
          visibleCount,
          totalCount,
        });
        poiReconnectProfiler.finishCycle({
          poiCount: totalCount,
          visibleCount,
        });
      });
    };
    window.addEventListener('bp-pois-reconnect-updated', handleReconnectPoisUpdated);
    return () => window.removeEventListener('bp-pois-reconnect-updated', handleReconnectPoisUpdated);
  }, []);

  const allFarmBounds = useMemo<GeoJSONBounds | null>(() => {
    if (!geojsonData?.features?.length) return null;
    return getFeaturesBounds(geojsonData.features);
  }, [geojsonData]);

  const offlineCartographicStyle = useMemo(() => {
    const bounds = allFarmBounds
      ? {
          west: allFarmBounds[0][0],
          south: allFarmBounds[0][1],
          east: allFarmBounds[1][0],
          north: allFarmBounds[1][1],
        }
      : undefined;
    return createOfflineCartographicStyle(theme, bounds);
  }, [theme, allFarmBounds]);

  const activeMapStyle = useCartographicOffline ? offlineCartographicStyle : mapStyle;

  // No modo cartográfico 100% offline (sem glyphs remotos), exibimos os números
  // dos talhões visíveis na tela com recorte por viewport (máximo 48 por quadro).
  const offlineVisibleLabels = useMemo(() => {
    if (!useCartographicOffline || !labelsData?.features?.length || zoom < 12.25) return [];
    const b = viewportBounds;
    const candidates: Array<{ id: string; lng: number; lat: number; talhao: string; area: number }> = [];
    for (const f of labelsData.features) {
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const [lng, lat] = coords;
      if (b && (lng < b.west || lng > b.east || lat < b.south || lat > b.north)) continue;
      candidates.push({
        id: `${f.properties?.FAZENDA ?? ''}-${f.properties?.TALHAO ?? ''}`,
        lng,
        lat,
        talhao: String(f.properties?.TALHAO ?? ''),
        area: Number(f.properties?.AREA_TOTAL ?? 0),
      });
    }
    candidates.sort((a, bItem) => bItem.area - a.area);
    return candidates.slice(0, 48);
  }, [useCartographicOffline, labelsData, zoom, viewportBounds]);

  const waterHidden = isGroupHidden(hiddenCategories, WATER_TRUCK_CATEGORIES);
  const trucksHidden = isGroupHidden(hiddenCategories, TRUCK_CATEGORIES);
  const waterPoiCount = useMemo(() => countCategoryGroup(uniquePois, WATER_TRUCK_CATEGORIES), [uniquePois]);
  const truckPoiCount = useMemo(() => countCategoryGroup(uniquePois, TRUCK_CATEGORIES), [uniquePois]);

  // Regras de exibição (estilo Google Maps), agora controláveis pelo usuário.
  const showIcons = zoom >= iconMinZoom;
  const showLabelsNow = showIcons && showLabels;

  // Ao entrar/sair do modo imersivo o container do mapa muda de tamanho.
  // Forçamos alguns resize() para o canvas do Mapbox preencher a nova área.
  useEffect(() => {
    const delays = [50, 250, 450];
    const timers = delays.map((d) =>
      window.setTimeout(() => {
        try { mapRef.current?.getMap?.()?.resize(); } catch { /* noop */ }
      }, d)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [immersive]);

  // Usar estilos padrão (original)

  return (
    <div className="relative w-full h-full">
      {mapNeedsReload && (
        <div
          role="alert"
          className="bp-map-reload-banner"
          style={{
            position: 'absolute',
            top: 84,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 14,
            background: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid rgba(255,120,80,0.55)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            color: '#f8fafc',
            maxWidth: 'min(92vw, 480px)',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>
            O mapa não voltou a renderizar. Toque para recarregar.
          </span>
          <button
            data-testid="map-reload-btn"
            onClick={reloadMapManually}
            style={{
              marginLeft: 'auto',
              padding: '9px 14px',
              minHeight: 40,
              borderRadius: 10,
              border: '1px solid rgba(173,255,47,0.6)',
              background: 'rgba(173,255,47,0.18)',
              color: '#ADFF2F',
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            Recarregar
          </button>
        </div>
      )}
      <style>{`
        /* ── Marcadores premium vetoriais ───────────────────────────────── */
        .bp-poi-marker {
          --poi-color: #b7ff4a;
          position: relative;
          width: 48px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--poi-color);
          cursor: pointer;
          filter: drop-shadow(0 8px 12px rgba(0,0,0,0.48));
          transform-origin: center bottom;
          animation: bpPoiMarkerFloat 2.4s ease-in-out infinite;
          isolation: isolate;
        }
        .bp-poi-marker-orbit,
        .bp-poi-marker-glow {
          position: absolute;
          left: 50%;
          top: 14px;
          border-radius: 999px;
          pointer-events: none;
          transform: translate(-50%, -50%);
        }
        .bp-poi-marker-orbit {
          width: 45px;
          height: 45px;
          border: 1.5px solid currentColor;
          opacity: 0.35;
          animation: bpPoiMarkerOrbit 2.4s ease-out infinite;
        }
        .bp-poi-marker-orbit-inner {
          width: 37px;
          height: 37px;
          opacity: 0.5;
          animation-delay: 0.55s;
        }
        .bp-poi-marker-glow {
          width: 34px;
          height: 34px;
          opacity: 0.42;
          background: currentColor;
          filter: blur(11px);
        }
        .bp-poi-marker-core {
          position: relative;
          z-index: 2;
          width: 35px;
          height: 35px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #f8fff0;
          background: linear-gradient(145deg, rgba(31,45,61,0.98), rgba(12,19,31,0.96));
          border: 2px solid var(--poi-color);
          box-shadow: 0 0 0 2px rgba(7,17,29,0.92), 0 0 20px var(--poi-color), inset 0 1px 1px rgba(255,255,255,0.24), 0 7px 16px rgba(0,0,0,0.42);
          transform: rotate(45deg);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .bp-poi-marker-core > svg {
          transform: rotate(-45deg);
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
        }
        .bp-poi-marker-tip {
          position: absolute;
          z-index: 1;
          left: 50%;
          bottom: 8px;
          width: 12px;
          height: 12px;
          background: var(--poi-color);
          border-right: 2px solid rgba(7,17,29,0.94);
          border-bottom: 2px solid rgba(7,17,29,0.94);
          transform: translateX(-50%) rotate(45deg);
          box-shadow: 5px 5px 10px rgba(0,0,0,0.38);
        }
        .bp-poi-marker.is-selected .bp-poi-marker-core,
        .bp-poi-marker.is-hovered .bp-poi-marker-core {
          transform: rotate(45deg) scale(1.14);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.18), 0 0 25px var(--poi-color), inset 0 1px 1px rgba(255,255,255,0.28), 0 9px 18px rgba(0,0,0,0.5);
        }
        .bp-poi-marker-water-truck .bp-poi-marker-core {
          width: 62px;
          height: 62px;
          padding: 0;
          border-radius: 0;
          transform: none;
          color: transparent;
          background: transparent;
          border: none;
          box-shadow: none;
          overflow: visible;
        }
        /* Sem glow/órbita/ponta para o pegador de água: só o ícone do caminhão. */
        .bp-poi-marker-water-truck .bp-poi-marker-glow,
        .bp-poi-marker-water-truck .bp-poi-marker-orbit,
        .bp-poi-marker-water-truck .bp-poi-marker-tip {
          display: none;
        }
        .bp-poi-marker-water-truck .bp-poi-marker-core > img {
          width: 62px;
          height: 62px;
          object-fit: contain;
          transform: none;
          /* Contorno branco fino + sombra: destaque robusto sobre satélite. */
          filter: drop-shadow(0 0 1px rgba(255,255,255,0.95)) drop-shadow(0 0 2px rgba(255,255,255,0.8)) drop-shadow(0 3px 5px rgba(0,0,0,0.55));
        }
        .bp-poi-marker-water-truck.is-selected .bp-poi-marker-core,
        .bp-poi-marker-water-truck.is-hovered .bp-poi-marker-core {
          transform: scale(1.16);
          box-shadow: none;
        }
        .bp-poi-marker-transport-truck .bp-poi-marker-core {
          width: 56px;
          height: 42px;
          padding: 0;
          border-radius: 12px;
          transform: none;
          color: transparent;
          background: #1b212c;
          border: 2px solid #fb923c;
          box-shadow: 0 0 0 2px rgba(7,17,29,0.92), 0 0 22px rgba(249,115,22,0.78), inset 0 1px 1px rgba(255,255,255,0.24), 0 7px 16px rgba(0,0,0,0.42);
          overflow: hidden;
        }
        .bp-poi-marker-transport-truck .bp-poi-marker-core > img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          transform: none;
          filter: drop-shadow(0 2px 3px rgba(0,0,0,0.42));
        }
        .bp-poi-marker-transport-truck.is-selected .bp-poi-marker-core,
        .bp-poi-marker-transport-truck.is-hovered .bp-poi-marker-core {
          transform: scale(1.14);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.18), 0 0 28px rgba(249,115,22,0.95), inset 0 1px 1px rgba(255,255,255,0.3), 0 9px 18px rgba(0,0,0,0.5);
        }
        .bp-poi-marker-alert .bp-poi-marker-core {
          color: #fff8ed;
          background: linear-gradient(145deg, rgba(255,105,45,0.98), rgba(191,24,24,0.98));
          border-color: #ffd166;
          box-shadow: 0 0 0 2px rgba(7,17,29,0.96), 0 0 24px rgba(255,67,34,0.95), inset 0 1px 2px rgba(255,255,255,0.42), 0 8px 18px rgba(0,0,0,0.52);
        }
        .bp-poi-marker-fire .bp-poi-marker-core {
          animation: bpPoiFireGlow 1.15s ease-in-out infinite;
        }
        .bp-poi-marker-alert-badge {
          position: absolute;
          z-index: 4;
          top: -1px;
          right: 1px;
          width: 15px;
          height: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: #fff;
          background: #bd1e1e;
          border: 2px solid rgba(7,17,29,0.95);
          font-size: 10px;
          font-weight: 950;
          line-height: 1;
          box-shadow: 0 2px 8px rgba(0,0,0,0.45);
        }
        .bp-poi-marker-photo-dot {
          position: absolute;
          z-index: 4;
          left: 1px;
          top: 0;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #60a5fa;
          border: 2px solid rgba(7,17,29,0.95);
          box-shadow: 0 0 10px rgba(96,165,250,0.95);
        }
        @keyframes bpPoiMarkerOrbit {
          0% { transform: translate(-50%, -50%) scale(0.72); opacity: 0.62; }
          75% { opacity: 0.16; }
          100% { transform: translate(-50%, -50%) scale(1.28); opacity: 0; }
        }
        @keyframes bpPoiMarkerFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes bpPoiFireGlow {
          0%, 100% { transform: rotate(45deg) scale(1); filter: saturate(1); }
          50% { transform: rotate(45deg) scale(1.08); filter: saturate(1.35) brightness(1.12); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bp-poi-marker,
          .bp-poi-marker-orbit,
          .bp-poi-marker-core { animation: none; }
        }
      `}</style>
      <Map
        ref={mapRef}
        mapLib={getGuardedMapboxLib()}
        mapboxAccessToken={MAP_CONFIG.MAPBOX_ACCESS_TOKEN}
        // As camadas atuais não precisam de MSAA; manter antialias desligado
        // reduz custo de criação e renderização do contexto WebGL.
        antialias={false}
        // O buffer é mantido porque isCanvasBlack/readPixels participa da
        // recuperação de telas pretas após o app voltar do segundo plano.
        preserveDrawingBuffer={true}
        initialViewState={{
          longitude: MAP_CONFIG.DEFAULT_CENTER.lng,
          latitude: MAP_CONFIG.DEFAULT_CENTER.lat,
          zoom: defaultZoom ?? MAP_CONFIG.DEFAULT_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={activeMapStyle as any}
        minZoom={MAP_CONFIG.MIN_ZOOM}
        maxZoom={MAP_CONFIG.MAX_ZOOM}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        onZoom={(e) => updateZoom(e.viewState.zoom)}
        onZoomEnd={(e) => { updateZoom(e.viewState.zoom); syncViewportBounds(); }}
        onMoveEnd={syncViewportBounds}
        onError={() => {
          // Se estiver sem internet e o estilo remoto de satélite falhar, alterna
          // automaticamente para o mapa cartográfico local para nunca travar o uso.
          if (!navigator.onLine && offlineBaseMode === 'cached-satellite') {
            setOfflineBaseMode('cartographic');
          }
        }}
        interactiveLayerIds={['fazendas-fill']}
      >
        {/* Todas as fazendas — Glass Liquid Theme */}
        {geojsonData && (
          <Source id="fazendas" type="geojson" data={geojsonData}>
            {/* Glow externo (profundidade glass) */}
            <Layer {...farmLayers.outer} />
            {/* Preenchimento adaptado ao tema */}
            <Layer {...farmLayers.fill} />
            {/* Borda interna sutil */}
            <Layer {...farmLayers.inner} />
            {/* Borda principal adaptada ao tema */}
            <Layer {...farmLayers.outline} />
          </Source>
        )}

        {/* Números dos talhões — fonte vetorial quando o estilo possui glyphs */}
        {labelsData && !useCartographicOffline && (
          <Source id="fazendas-labels-src" type="geojson" data={labelsData}>
            <Layer
              id="fazendas-labels"
              type="symbol"
              layout={{
                'text-field': ['to-string', ['get', 'TALHAO']],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 9,
                  12, 11,
                  14, 14,
                  16, 18,
                  18, 22,
                ],
                // Um único rótulo por talhão. Não permitimos sobreposição
                // entre rótulos vizinhos: se conflitar, o Mapbox omite o
                // menos importante mantendo o mapa legível.
                'text-allow-overlap': false,
                'text-ignore-placement': false,
                'text-anchor': 'center',
                'text-padding': 2,
                'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'AREA_TOTAL'], 0]],
              }}
              paint={{
                'text-color': farmPalette.label,
                'text-halo-color': farmPalette.labelHalo,
                'text-halo-width': 1.2,
              }}
            />
          </Source>
        )}

        {/* Rótulos locais de talhões no modo cartográfico 100% offline (sem glyphs externos) */}
        {useCartographicOffline && offlineVisibleLabels.map((lbl) => (
          <Marker key={`off-lbl-${lbl.id}`} longitude={lbl.lng} latitude={lbl.lat} anchor="center">
            <span
              style={{
                pointerEvents: 'none',
                fontSize: 10,
                fontWeight: 800,
                color: theme === 'light' ? '#1e293b' : '#f1f5f9',
                textShadow: theme === 'light'
                  ? '0 0 3px rgba(255,255,255,0.95)'
                  : '0 1px 4px rgba(0,0,0,0.9)',
                userSelect: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {lbl.talhao}
            </span>
          </Marker>
        ))}

        {/* Área selecionada com destaque — Glass Liquid Accent */}
        {selectedGeoJSON && (
          <Source id="fazendas-selected" type="geojson" data={selectedGeoJSON as any}>
            {/* Glow externo amarelo */}
            <Layer
              id="fazendas-selected-glow"
              type="line"
              paint={{
                'line-color': farmPalette.selectedOutline,
                'line-width': 6,
                'line-opacity': 0.35,
                'line-blur': 4,
              }}
            />
            {/* Preenchimento da área selecionada */}
            <Layer
              id="fazendas-selected-fill"
              type="fill"
              paint={{
                'fill-color': farmPalette.selectedFill,
                'fill-opacity': 0.72,
              }}
            />
            {/* Borda interna branca */}
            <Layer
              id="fazendas-selected-inner"
              type="line"
              paint={{
                'line-color': farmPalette.inner,
                'line-width': 1.2,
                'line-offset': -2,
                'line-opacity': 0.7,
              }}
            />
            {/* Contorno principal amarelo */}
            <Layer
              id="fazendas-selected-outline"
              type="line"
              paint={{
                'line-color': farmPalette.selectedOutline,
                'line-width': 3,
                'line-opacity': 1,
              }}
            />
          </Source>
        )}

        {/* POIs — visíveis conforme zoom e filtro de categoria (estilo Google Maps) */}
        {showIcons && visiblePois.map((poi: POI, index) => {
          const catInfo = CATEGORY_MAP[poi.category] || CATEGORY_MAP.marcacao;
          const poiColor = catInfo.color || '#ADFF2F';
          const isSelected = !!popupData && popupData.poiId === poi.id;
          const isHovered = hoveredPoiId === poi.id;
          const isExpanded = isSelected || isHovered; // legenda completa
          const transportLegend = poi.category === 'transporte_insumo'
            ? getTransportMaterial(poi.transportMaterial)?.label
              || poi.title.replace(/^TRANSPORTE DE INSUMO\s*[—-]\s*/i, '')
            : poi.title;
          const markerLabel = transportLegend || poi.title;
          return (
          <Marker
            key={`poi-${poi.id || index}`}
            longitude={poi.lng}
            latitude={poi.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setPopupData({
                fundo: poi.fundo || 0,
                talhao: poi.talhao || 0,
                zona: poi.category || 'Custom',
                hectares: 'N/A',
                lng: poi.lng,
                lat: poi.lat,
                customMessage: poi.message,
                isCustom: true,
                poiId: poi.id,
              });
            }}
          >
            <div
              data-testid="poi-marker"
              onMouseEnter={() => setHoveredPoiId(poi.id)}
              onMouseLeave={() => setHoveredPoiId((prev) => (prev === poi.id ? null : prev))}
              style={{
                position: 'relative',
                transform: markerScale !== 1 ? `scale(${markerScale})` : undefined,
                transformOrigin: 'bottom center',
                zIndex: isExpanded ? 5 : undefined,
              }}
            >
            <PoiMarkerIcon
              category={poi.category}
              color={poiColor}
              title={markerLabel}
              transportMaterial={poi.transportMaterial}
              waterAvailable={poi.waterAvailable !== false}
              selected={isSelected}
              hovered={isHovered}
              hasPhoto={Boolean(poi.photo)}
            />

            {/* Legenda inteligente: completa na marcação sob o toque OU sob o mouse (desktop);
                as demais ficam curtas. Ao passar o mouse mostra mesmo com legendas desligadas. */}
            {(showLabelsNow || isExpanded) && markerLabel && (
              <div
                data-testid="poi-label"
                style={{
                  position: 'absolute', top: '100%', left: '50%',
                  transform: 'translate(-50%, 4px)',
                  pointerEvents: 'none',
                  zIndex: isExpanded ? 9 : 7,
                  background: isExpanded ? 'rgba(10,16,26,0.96)' : 'rgba(10,16,26,0.8)',
                  color: '#f5f7fa',
                  padding: isExpanded ? '3px 9px' : '1px 6px',
                  borderRadius: 7,
                  fontSize: isExpanded ? 11 : 9,
                  fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.25,
                  border: `1px solid ${poiColor}${isExpanded ? 'bb' : '55'}`,
                  boxShadow: isExpanded ? '0 3px 12px rgba(0,0,0,0.6)' : '0 2px 6px rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  whiteSpace: isExpanded ? 'normal' : 'nowrap',
                  maxWidth: isExpanded ? 190 : 84,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  textAlign: 'center',
                }}
              >
                {markerLabel}
              </div>
            )}
            </div>
          </Marker>
          );
        })}

        {/* Marcador GPS Waze com logotipo girando */}
        {gpsTracking && gpsPosition && (
          <Marker longitude={gpsPosition.lng} latitude={gpsPosition.lat} anchor="center">
            <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
              {/* Anel de precisão */}
              <div className="absolute rounded-full border-2 border-blue-400 opacity-30 animate-pulse"
                style={{ width: 52, height: 52 }} />

              {/* Triângulo de direção */}
              <div
                className="absolute"
                style={{
                  width: 0, height: 0,
                  borderLeft: '7px solid transparent',
                  borderRight: '7px solid transparent',
                  borderBottom: '18px solid rgba(59, 130, 246, 0.7)',
                  transform: `rotate(${gpsHeading}deg) translateY(-28px)`,
                  transformOrigin: 'bottom center',
                  transition: 'transform 0.5s linear',
                }}
              />

              {/* Logotipo girando */}
              <div
                style={{
                  width: 42, height: 42,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid #3b82f6',
                  boxShadow: '0 0 12px rgba(59,130,246,0.8), 0 2px 8px rgba(0,0,0,0.4)',
                  background: 'white',
                  transition: 'transform 0.5s linear',
                  transform: `rotate(${gpsHeading}deg)`,
                }}
              >
                <img
                  src="/header-logo.png"
                  alt="Minha posição"
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: `rotate(-${gpsHeading}deg)`,
                    transition: 'transform 0.5s linear',
                  }}
                />
              </div>
            </div>
          </Marker>
        )}



        {/* Modo Trator - trilha no mapa */}
        {showModoTrator && (
          <Suspense fallback={null}>
            <ModoTrator
              key={modoTratorInitialMode}
              mapRef={mapRef}
              isWazeActive={gpsTracking}
              initialMode={modoTratorInitialMode}
              onBurnedAreaSaved={handleBurnedAreaSaved}
              onClose={() => setShowModoTrator(false)}
            />
          </Suspense>
        )}

        {/* Ferramentas de Desenho - camadas dentro do Map */}
        {drawingToolsMounted && (
          <Suspense fallback={null}>
            <DrawingTools
              mapRef={mapRef}
              isActive={showDrawingTools}
              onClose={() => {
                setShowDrawingTools(false);
                isDrawingActiveRef.current = false;
              }}
              onDrawingModeChange={(active) => { isDrawingActiveRef.current = active; }}
            />
          </Suspense>
        )}
      </Map>

      {/* Folha inferior estilo Google Maps: começa parcialmente aberta e pode
          ser recolhida/expandida por arraste vertical. */}
      <MapBottomSheet
        open={popupData !== null}
        onOpenChange={(open) => { if (!open) setPopupData(null); }}
        title={popupData?.isCustom
          ? 'Detalhes da marcação'
          : popupData?.isMarkedArea
            ? `Fundo ${popupData.fundo} — Talhão ${popupData.talhao}`
            : 'Área não demarcada'}
        variant={isTransportPanel ? 'transport' : 'standard'}
      >
        <Suspense fallback={null}>
        {popupData?.isCustom ? (
          (() => {
            const cpoi = activeCustomPoi;
            if (!cpoi) return null;
            return (
              <CustomPoiPopup
                poi={cpoi}
                presentation="sheet"
                onClose={() => setPopupData(null)}
                onNavigate={(poiToNav) => navigateToPoi(poiToNav)}
                onShare={(poiToShare) => {
                  setShareData({
                    fundo: poiToShare.fundo || '',
                    talhao: poiToShare.talhao || '',
                    zona: poiToShare.category,
                    lng: poiToShare.lng,
                    lat: poiToShare.lat,
                    pois: [poiToShare],
                  });
                  setShowShareModal(true);
                  setPopupData(null);
                }}
                onUpdate={(id, updates) => { updatePOI(id, updates); }}
                onDelete={(id) => { deletePOI(id); setPopupData(null); }}
              />
            );
          })()
        ) : popupData?.isMarkedArea ? (
          <PopupContent
            presentation="sheet"
            fundo={popupData.fundo}
            talhao={popupData.talhao}
            zona={popupData.zona}
            hectares={popupData.hectares}
            lng={popupData.lng}
            lat={popupData.lat}
            onClose={() => setPopupData(null)}
            onShare={(shareContext) => {
              const farmPois = pois.filter((poi) => (
                String(poi.fundo ?? '') === String(popupData.fundo) &&
                String(poi.talhao ?? '') === String(popupData.talhao)
              ));
              setShareData({
                fundo: String(popupData.fundo),
                talhao: String(popupData.talhao),
                zona: popupData.zona,
                lng: popupData.lng,
                lat: popupData.lat,
                pois: farmPois,
                farmName: shareContext?.farmName,
              });
              setShowShareModal(true);
              setPopupData(null);
            }}
            onAddPoi={() => {
              window.dispatchEvent(new CustomEvent('openPoiModal', {
                detail: { fundo: String(popupData.fundo), talhao: String(popupData.talhao), lng: popupData.lng, lat: popupData.lat },
              }));
              setPopupData(null);
            }}
            onFireAlert={() => {
              handleOpenFireAlert({ lng: popupData.lng, lat: popupData.lat, fundo: popupData.fundo, talhao: popupData.talhao });
              setPopupData(null);
            }}
            onBurnedArea={() => {
              setPopupData(null);
              handleOpenBurnedAreaMeasurement();
            }}
            onRoute={() => {
              setRouteDestination({
                lng: popupData.lng,
                lat: popupData.lat,
                label: `Fundo ${popupData.fundo} — Talhão ${popupData.talhao}`,
              });
              setShowRoute(true);
              setPopupData(null);
            }}
          />
        ) : popupData ? (
          <UnmarkedAreaPopup
            presentation="sheet"
            lng={popupData.lng}
            lat={popupData.lat}
            onClose={() => setPopupData(null)}
            onAddPoi={() => {
              window.dispatchEvent(new CustomEvent('openPoiModal', {
                detail: { fundo: 'N/A', talhao: 'N/A', lng: popupData.lng, lat: popupData.lat, isUnmarkedArea: true },
              }));
              setPopupData(null);
            }}
            onFireAlert={() => {
              handleOpenFireAlert({ lng: popupData.lng, lat: popupData.lat });
              setPopupData(null);
            }}
            onBurnedArea={() => {
              setPopupData(null);
              handleOpenBurnedAreaMeasurement();
            }}
          />
        ) : null}
        </Suspense>
      </MapBottomSheet>

      {/* ── Controles flutuantes (direita) ─────────────────────────────────── */}
      <div
        ref={toolsMenuRef}
        className="bp-themed-floating-controls bp-tools-anchor absolute top-20 right-4 z-50 flex flex-col items-end space-y-2"
        style={{
          display: immersive ? 'none' : undefined,
          // Quando há popup aberto, o popup tem prioridade de toque mesmo se
          // sua posição coincidir com a coluna de ícones da direita.
          pointerEvents: popupData ? 'none' : 'auto',
          opacity: popupData ? 0.62 : 1,
        }}
        data-testid="floating-controls"
      >
        {/* Acionador único: as ferramentas ficam recolhidas por padrão, como a busca. */}
        <button
          type="button"
          data-testid="tools-menu-trigger"
          className="bp-tools-menu-trigger glass-liquid-button"
          onClick={toggleToolsMenu}
          aria-expanded={showToolsMenu}
          aria-controls="map-tools-menu"
          aria-label={showToolsMenu ? 'Fechar ferramentas do mapa' : 'Abrir ferramentas do mapa'}
          title={showToolsMenu ? 'Fechar ferramentas do mapa' : 'Abrir ferramentas do mapa'}
        >
          <Wrench size={19} strokeWidth={2.35} />
          <span className="bp-tools-menu-trigger-label">Ferramentas</span>
          {showToolsMenu ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {(showLayersPanel || showModoTrator || showDrawingTools || gpsTracking || hiddenCategories.size > 0) && (
            <span className="bp-tools-menu-active-dot" aria-label="Ferramenta ativa" />
          )}
        </button>

        <button
          data-testid="collapse-ui-btn"
          onClick={() => { closeToolsMenu(); setShowMapStyleSelector(false); onToggleImmersive?.(); }}
          className="bp-tools-immersive-button glass-liquid-button"
          title="Ampliar mapa (ocultar menus e ícones)"
          aria-label="Ampliar mapa e ocultar menus"
        >
          <Maximize2 size={18} strokeWidth={2.5} />
        </button>

        {/* Seletor de estilo: fica abaixo de Expandir e abre as duas opções em glass. */}
        <div className="bp-map-style-picker">
          <button
            data-testid="map-style-selector"
            type="button"
            onClick={() => setShowMapStyleSelector((open) => !open)}
            className={`bp-map-style-selector-trigger glass-liquid-button ${showMapStyleSelector ? 'is-open' : ''}`}
            aria-expanded={showMapStyleSelector}
            aria-controls="map-style-options"
            aria-label="Escolher estilo do mapa"
            title={showMapStyleSelector ? 'Fechar estilos do mapa' : 'Escolher modo satélite ou rua'}
          >
            {isSatellite ? <Satellite size={20} strokeWidth={2.35} /> : <MapIcon size={20} strokeWidth={2.35} />}
            {showMapStyleSelector ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showMapStyleSelector && (
            <div id="map-style-options" className="bp-map-style-options" role="group" aria-label="Estilos do mapa">
              <button
                data-testid="map-satellite-btn"
                type="button"
                onClick={() => { setMapStyle('mapbox://styles/mapbox/satellite-streets-v12'); setShowMapStyleSelector(false); }}
                className={`bp-map-style-option glass-liquid-button ${isSatellite ? 'is-active' : ''}`}
                aria-label="Ativar modo satélite"
                aria-pressed={isSatellite}
                title="Modo satélite"
              >
                <Satellite size={19} strokeWidth={2.35} />
                <span>Satélite</span>
              </button>
              <button
                data-testid="map-street-btn"
                type="button"
                onClick={() => { setMapStyle('mapbox://styles/mapbox/streets-v12'); setShowMapStyleSelector(false); }}
                className={`bp-map-style-option glass-liquid-button ${!isSatellite ? 'is-active' : ''}`}
                aria-label="Ativar modo rua"
                aria-pressed={!isSatellite}
                title="Modo rua"
              >
                <MapIcon size={19} strokeWidth={2.35} />
                <span>Rua</span>
              </button>
            </div>
          )}
        </div>

        {/* GPS essencial: permanece abaixo do seletor de modo e usa o mesmo glass dos controles. */}
        <div className="bp-map-gps-control" aria-label="Minha localização">
          <div className="bp-map-essential-gps-wrap">
            <button
              data-testid="map-gps-btn"
              type="button"
              onClick={gpsTracking ? stopGPS : startGPS}
              className={`bp-map-essential-control glass-liquid-button ${gpsTracking ? 'is-active is-gps-active' : ''}`}
              aria-label={gpsTracking ? 'Parar minha localização' : 'Ativar minha localização'}
              aria-pressed={gpsTracking}
              title={gpsTracking ? 'Parar minha localização' : 'Ativar minha localização'}
            >
              <LocateFixed size={20} strokeWidth={2.35} />
              {gpsTracking && <span className="bp-map-essential-gps-dot" aria-hidden="true" />}
            </button>
            {gpsError && (
              <div className="bp-map-essential-gps-error" role="status">
                {gpsError}
              </div>
            )}
          </div>
        </div>

        {/* Controle rápido de visibilidade: ocultar represas, pegadores de água e caminhões em 1 toque */}
        <MapVisibilityControl
          pois={uniquePois}
          hiddenCategories={hiddenCategories}
          onToggleGroup={toggleVisibilityGroup}
          onShowAll={() => setHiddenCategories(new Set())}
          onOpenAdvancedLayers={() => setShowLayersPanel(true)}
        />

        {/* Botão direto da Central do Mapa Offline */}
        <button
          type="button"
          data-testid="offline-center-btn"
          onClick={() => { closeToolsMenu(); setShowOfflineCenter(true); }}
          className={`bp-map-essential-control glass-liquid-button relative flex items-center justify-center ${
            effectiveOffline ? 'is-active' : ''
          }`}
          aria-label={effectiveOffline ? 'Central do Mapa Offline (Modo offline ativo)' : 'Abrir Central do Mapa Offline'}
          title={effectiveOffline ? 'Modo offline ativo — gerenciar mapas offline' : 'Mapa offline — baixar áreas e usar sem internet'}
          style={{
            minWidth: 44,
            minHeight: 44,
            color: !isOnline ? '#fbbf24' : offlineModeEnabled ? 'var(--bp-accent)' : undefined,
            borderColor: !isOnline ? 'rgba(251,191,36,0.5)' : offlineModeEnabled ? 'var(--bp-accent-border)' : undefined,
          }}
        >
          {effectiveOffline ? <WifiOff size={19} strokeWidth={2.35} /> : <DownloadCloud size={19} strokeWidth={2.35} />}
        </button>

        {toolsMenuMounted && (
          <div id="map-tools-menu" data-testid="map-tools-menu" className={`bp-tools-menu-panel ${showToolsMenu ? 'is-open' : 'is-closing'}`} role="dialog" aria-label="Ferramentas do mapa">
            <div className="bp-tools-menu-header">
              <div>
                <div className="bp-tools-menu-kicker">Painel operacional</div>
                <div className="bp-tools-menu-title">Ferramentas do mapa</div>
              </div>
              <button
                type="button"
                data-testid="tools-menu-close"
                className="bp-tools-menu-close"
                onClick={closeToolsMenu}
                aria-label="Fechar ferramentas do mapa"
                title="Fechar ferramentas do mapa"
              >
                <X size={16} />
              </button>
            </div>
            <div className="bp-tools-menu-grid">

        {/* Botão Camadas e Filtros — controla zoom das marcações, legendas e filtro por categoria */}
        <button
          data-testid="layers-filter-btn"
          onClick={() => { setShowLayersPanel((v) => !v); closeToolsMenu(); }}
          className="bp-tool-button glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition relative"
          style={{
            background: showLayersPanel || hiddenCategories.size > 0 ? 'rgba(173,255,47,0.22)' : undefined,
            color: showLayersPanel || hiddenCategories.size > 0 ? '#ADFF2F' : undefined,
          }}
          title="Camadas e filtros das marcações"
          aria-label="Camadas e filtros das marcações"
        >
          <SlidersHorizontal size={18} strokeWidth={2.5} />
          <span className="bp-tool-label">Camadas</span>
          {hiddenCategories.size > 0 && (
            <span
              style={{
                position: 'absolute', top: -4, right: -4,
                width: 10, height: 10, borderRadius: '50%',
                background: '#ADFF2F', border: '2px solid rgba(10,16,26,0.95)',
              }}
            />
          )}
        </button>

        {/* Botão Bússola (aparece quando GPS ativo e há destino: talhão ou foco) */}
        {gpsTracking && gpsPosition && compassTarget && (
          <button
            onClick={() => setShowCompass(!showCompass)}
            className={`bp-tool-button glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition text-lg ${
              showCompass
                ? 'bg-sky-400/24 text-sky-50 hover:bg-sky-400/32'
                : 'text-white hover:bg-white/10'
            }`}
            aria-label={showCompass ? 'Ocultar bússola' : 'Bússola: navegar até o destino'}
            title={showCompass ? 'Ocultar bússola' : 'Bússola: navegar até o destino'}
          >
            <Compass size={19} strokeWidth={2.35} />
            <span className="bp-tool-label">Bússola</span>
          </button>
        )}

        {/* Botão Modo Trator */}
        <button
          onClick={() => setShowModoTrator(!showModoTrator)}
          className={`bp-tool-button glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition text-lg ${
            showModoTrator
              ? 'bg-yellow-300/24 text-yellow-50 hover:bg-yellow-300/32'
              : 'text-white hover:bg-white/10'
          }`}
          aria-label={showModoTrator ? 'Fechar Modo Trator' : 'Modo Trator — Medir área por caminhada'}
          title={showModoTrator ? 'Fechar Modo Trator' : 'Modo Trator — Medir área por caminhada'}
        >
            <Construction size={19} strokeWidth={2.35} />
            <span className="bp-tool-label">Trator</span>
        </button>

        {/* Ferramentas de incêndio — atalhos explícitos no próprio mapa */}
        <button
          data-testid="fire-alert-tool-btn"
          type="button"
          onClick={() => handleOpenFireAlert()}
          className="bp-tool-button bp-tool-alert glass-liquid-button"
          title="Registrar alerta de incêndio neste ponto"
          aria-label="Registrar alerta de incêndio neste ponto"
          style={{
            width: '100%', minHeight: 52, padding: '5px 6px', borderRadius: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            color: '#fff7ed', background: 'linear-gradient(145deg, rgba(239,68,68,0.42), rgba(127,29,29,0.7))',
            border: '1px solid rgba(255,126,72,0.7)', boxShadow: '0 0 18px rgba(239,68,68,0.25)',
          }}
        >
          <Flame size={19} strokeWidth={2.5} />
          <span style={{ fontSize: 9, fontWeight: 900, lineHeight: 1 }}>Alerta</span>
        </button>

        <button
          data-testid="burned-area-tool-btn"
          type="button"
          onClick={handleOpenBurnedAreaMeasurement}
          className="bp-tool-button bp-tool-burned-area glass-liquid-button"
          title="Medir área queimada caminhando com GPS"
          aria-label="Medir área queimada caminhando com GPS"
          style={{
            width: '100%', minHeight: 52, padding: '5px 6px', borderRadius: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            color: '#ffedd5', background: showModoTrator && modoTratorInitialMode === 'queimada'
              ? 'linear-gradient(145deg, rgba(249,115,22,0.6), rgba(124,45,18,0.78))'
              : 'linear-gradient(145deg, rgba(249,115,22,0.28), rgba(67,20,7,0.68))',
            border: '1px solid rgba(251,146,60,0.7)', boxShadow: '0 0 18px rgba(249,115,22,0.22)',
          }}
        >
          <LocateFixed size={19} strokeWidth={2.35} />
          <span style={{ fontSize: 9, fontWeight: 900, lineHeight: 1 }}>Área GPS</span>
        </button>

        {/* Botão Ferramentas de Desenho */}
        <button
          onClick={() => {
            const next = !showDrawingTools;
            setDrawingToolsMounted(true);
            setShowDrawingTools(next);
            if (!next) isDrawingActiveRef.current = false;
          }}
          className={`bp-tool-button glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition text-lg ${
            showDrawingTools
              ? 'bg-purple-400/24 text-purple-50 hover:bg-purple-400/32'
              : 'text-white hover:bg-white/10'
          }`}
          aria-label={showDrawingTools ? 'Fechar Ferramentas de Desenho' : 'Ferramentas de Desenho — Régua, Polígono, Retângulo, Círculo'}
          title={showDrawingTools ? 'Fechar Ferramentas de Desenho' : 'Ferramentas de Desenho — Régua, Polígono, Retângulo, Círculo'}
        >
            <PencilRuler size={19} strokeWidth={2.35} />
            <span className="bp-tool-label">Desenho</span>
        </button>

        {/* Atalho para a Central do Mapa Offline dentro de Ferramentas */}
        <button
          type="button"
          data-testid="download-area-btn"
          onClick={() => { closeToolsMenu(); setShowOfflineCenter(true); }}
          className={`bp-map-offline-download bp-tool-button glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition text-lg ${
            effectiveOffline ? 'bg-amber-400/20 text-amber-200' : 'text-white hover:bg-white/10'
          }`}
          aria-label="Abrir Central do Mapa Offline"
          title="Baixar áreas e configurar modo sem internet"
        >
          {effectiveOffline ? <WifiOff size={18} /> : <DownloadCloud size={18} />}
          <span className="bp-tool-label">Offline</span>
        </button>

        {/* Adicionar marcação no centro do mapa — forma garantida de adicionar */}
        <button
          data-testid="add-marker-btn"
          onClick={() => {
            const map = mapRef.current?.getMap?.() ? mapRef.current.getMap() : mapRef.current;
            const c = map?.getCenter?.();
            const lng = c ? c.lng : MAP_CONFIG.DEFAULT_CENTER.lng;
            const lat = c ? c.lat : MAP_CONFIG.DEFAULT_CENTER.lat;
            window.dispatchEvent(new CustomEvent('openPoiModal', {
              detail: {
                fundo: selectedFundo != null ? String(selectedFundo) : 'N/A',
                talhao: selectedTalhao != null ? String(selectedTalhao) : 'N/A',
                lng, lat,
                isUnmarkedArea: selectedFundo == null,
              },
            }));
          }}
          className="bp-tool-button bp-tool-add-marker glass-liquid-button w-10 h-10 flex items-center justify-center rounded-xl shadow-2xl transition text-lg bg-[#ADFF2F]/20 text-[#ADFF2F] hover:bg-[#ADFF2F]/30 font-black"
          aria-label="Adicionar marcação no centro do mapa"
          title="Adicionar marcação no centro do mapa"
        >
            <PlusIcon size={24} strokeWidth={2.8} />
            <span className="bp-tool-label">Adicionar</span>
        </button>

            </div>
          </div>
        )}
      </div>

      {/* Central do Mapa Offline (modal completo + banner compacto quando offline) */}
      <MapOfflineControls
        mapRef={mapRef}
        geojsonData={geojsonData}
        labelsData={labelsData}
        farmBounds={allFarmBounds}
        poiCount={uniquePois.length}
        pendingSyncCount={pendingCount}
        onForceSync={forceSync}
        isOnline={isOnline}
        offlineModeEnabled={offlineModeEnabled}
        onToggleOfflineMode={setOfflineModeEnabled}
        offlineBaseMode={offlineBaseMode}
        onChangeOfflineBaseMode={setOfflineBaseMode}
        open={showOfflineCenter}
        onOpenChange={setShowOfflineCenter}
      />

      {/* ── Painel "Camadas e Filtros" ──────────────────────────────────────
           Controla: (1) a partir de qual zoom as marcações aparecem,
           (2) exibição das legendas (nomes) e (3) filtro por categoria. */}
      {showLayersPanel && !immersive && (
        <div
          data-testid="layers-filter-panel"
          className="glass-liquid-strong bp-layers-panel"
          style={{
            position: 'absolute', top: 80, right: 64, zIndex: 56,
            width: 'min(290px, calc(100vw - 88px))', maxHeight: '72vh', overflowY: 'auto',
            padding: 14, borderRadius: 16,
            background: 'rgba(14,20,32,0.94)',
            border: '1px solid rgba(173,255,47,0.22)',
            backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
            color: '#e8edf4',
          }}
        >
          {/* Cabeçalho */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#ADFF2F', letterSpacing: 0.3 }}>Camadas e Filtros</span>
            <button
              data-testid="layers-panel-close"
              onClick={() => setShowLayersPanel(false)}
              aria-label="Fechar"
              style={{
                width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#cdd7e3',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* (1) Zoom para exibir marcações */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Exibir marcações ao aproximar</div>
            <input
              data-testid="poi-zoom-slider"
              type="range" min={10} max={18} step={0.5}
              value={iconMinZoom}
              onChange={(e) => setIconMinZoom(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#ADFF2F', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9fb0c3', marginTop: 3 }}>
              <span>Mais cedo</span>
              <span data-testid="poi-zoom-status" style={{ color: showIcons ? '#ADFF2F' : '#9fb0c3', fontWeight: 700 }}>
                {showIcons ? 'Visíveis agora' : 'Aproxime para ver'}
              </span>
              <span>Mais tarde</span>
            </div>
          </div>

          {/* (1b) Tamanho das marcações */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Tamanho das marcações</span>
              <span data-testid="poi-size-value" style={{ fontSize: 10.5, color: '#ADFF2F', fontWeight: 700 }}>{Math.round(markerScale * 100)}%</span>
            </div>
            <input
              data-testid="poi-size-slider"
              type="range" min={0.5} max={1.8} step={0.1}
              value={markerScale}
              onChange={(e) => setMarkerScale(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#ADFF2F', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9fb0c3', marginTop: 3 }}>
              <span>Menor</span>
              <button
                data-testid="poi-size-reset"
                onClick={() => setMarkerScale(1)}
                style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cdd7e3' }}
              >Padrão</button>
              <span>Maior</span>
            </div>
          </div>


          {/* (2) Legendas */}
          <button
            data-testid="poi-labels-toggle"
            onClick={() => setShowLabels((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              padding: '9px 11px', borderRadius: 12, marginBottom: 16, cursor: 'pointer',
              background: showLabels ? 'rgba(173,255,47,0.14)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showLabels ? 'rgba(173,255,47,0.35)' : 'rgba(255,255,255,0.1)'}`,
              color: '#e8edf4',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={15} /> Mostrar nomes (legendas)
            </span>
            <span style={{ width: 34, height: 18, borderRadius: 20, flex: '0 0 auto', background: showLabels ? '#ADFF2F' : 'rgba(255,255,255,0.25)', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: showLabels ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#0a101a', transition: 'left 0.2s' }} />
            </span>
          </button>

          {/* (2b) Ocultar rápido: Represas / Pegadores de Água e Caminhões */}
          <div data-testid="layers-quick-vehicles" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>Represas, pegadores e caminhões</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                data-testid="layers-toggle-represa"
                onClick={() => toggleVisibilityGroup(WATER_TRUCK_CATEGORIES)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  padding: '8px 10px', borderRadius: 11, cursor: 'pointer',
                  background: !waterHidden ? 'rgba(14,165,233,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${!waterHidden ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: '#e8edf4',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700 }}>
                  <img src={WATER_TRUCK_ICON} alt="" aria-hidden="true" style={{ width: 18, height: 18, objectFit: 'contain', opacity: waterHidden ? 0.45 : 1 }} />
                  Represas / Pegadores ({waterPoiCount})
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: !waterHidden ? '#38bdf8' : '#9fb0c3' }}>
                  {waterHidden ? 'Oculto' : 'Visível'}
                </span>
              </button>
              <button
                type="button"
                data-testid="layers-toggle-trucks"
                onClick={() => toggleVisibilityGroup(TRUCK_CATEGORIES)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  padding: '8px 10px', borderRadius: 11, cursor: 'pointer',
                  background: !trucksHidden ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${!trucksHidden ? 'rgba(251,146,60,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: '#e8edf4',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700 }}>
                  <img src="/poi-pin-transport-dump-truck.png" alt="" aria-hidden="true" style={{ width: 20, height: 16, objectFit: 'contain', opacity: trucksHidden ? 0.45 : 1 }} />
                  Caminhões ({truckPoiCount})
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: !trucksHidden ? '#fb923c' : '#9fb0c3' }}>
                  {trucksHidden ? 'Oculto' : 'Visível'}
                </span>
              </button>
            </div>
          </div>

          {/* (3) Filtro por categoria */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Filtrar por categoria</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  data-testid="cat-show-all"
                  onClick={() => setHiddenCategories(new Set())}
                  style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, cursor: 'pointer', background: 'rgba(173,255,47,0.14)', border: '1px solid rgba(173,255,47,0.3)', color: '#ADFF2F' }}
                >Todas</button>
                <button
                  data-testid="cat-clear-all"
                  onClick={() => setHiddenCategories(new Set(presentCategories))}
                  style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cdd7e3' }}
                >Limpar</button>
              </div>
            </div>
            {presentCategories.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9fb0c3', padding: '6px 2px' }}>Nenhuma marcação no mapa ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {presentCategories.map((cat) => {
                  const info = CATEGORY_MAP[cat] || CATEGORY_MAP.marcacao;
                  const active = !hiddenCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      data-testid={`cat-chip-${cat}`}
                      onClick={() => toggleCategory(cat)}
                      title={info.title}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                        fontSize: 11, fontWeight: 700,
                        background: active ? `${info.color}22` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${active ? info.color : 'rgba(255,255,255,0.12)'}`,
                        color: active ? '#f5f7fa' : '#8a97a8',
                        opacity: active ? 1 : 0.6,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <PoiCategoryIcon category={cat} size={14} color={active ? info.color : '#8a97a8'} />
                      <span>{catShortLabel(cat)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* (4) Zoom de abertura do mapa */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Zoom de abertura do mapa</div>
            <div data-testid="default-zoom-status" style={{ fontSize: 10.5, color: '#9fb0c3', marginBottom: 8 }}>
              {defaultZoom !== null
                ? `Sempre abrir com aproximação ${defaultZoom.toFixed(1)}`
                : 'Abertura automática (padrão do app)'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                data-testid="save-default-zoom"
                onClick={saveDefaultZoom}
                style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                         background: 'rgba(173,255,47,0.16)', border: '1px solid rgba(173,255,47,0.35)', color: '#ADFF2F' }}
              >Salvar aproximação atual</button>
              {defaultZoom !== null && (
                <button
                  data-testid="clear-default-zoom"
                  onClick={clearDefaultZoom}
                  style={{ fontSize: 11, fontWeight: 700, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                           background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cdd7e3' }}
                >Restaurar</button>
              )}
            </div>
          </div>

        </div>
      )}


      {/* ── Bússola de navegação (canto inferior direito) ─────────────────── */}
      {showCompass && gpsTracking && gpsPosition && compassTarget && (
        <div className="absolute bottom-24 right-4 z-50 flex flex-col items-end gap-2">
          <Suspense fallback={null}>
            <CompassNavigator
              userLat={gpsPosition.lat}
              userLng={gpsPosition.lng}
              targetLat={compassTarget.lat}
              targetLng={compassTarget.lng}
              targetName={compassTarget.name}
              userHeading={effectiveHeading}
              accuracy={gpsAccuracy}
            />
          </Suspense>
          {navTarget && (
            <button
              data-testid="stop-navigation-btn"
              onClick={stopNavigation}
              className="glass-liquid-button px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:bg-white/10"
              title="Encerrar navegação"
            >
              ✕ Encerrar navegação
            </button>
          )}
        </div>
      )}

      {/* ── Rota / Navegação ────────────────────────────────────────────────────── */}
      {showRoute && routeDestination && (
        <RouteNavigator
          mapRef={mapRef}
          destination={routeDestination}
          onClose={() => { setShowRoute(false); setRouteDestination(null); }}
        />
      )}

      {/* ── Modal de compartilhamento ──────────────────────────────────────────────── */}
      {showShareModal && shareData && (
        <Suspense fallback={null}>
          <ShareModal
            fundo={shareData.fundo}
            talhao={shareData.talhao}
            zona={shareData.zona}
            lng={shareData.lng}
            lat={shareData.lat}
            pois={shareData.pois}
            farmName={shareData.farmName}
            onClose={() => setShowShareModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
