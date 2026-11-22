/**
 * DrawingTools — Sistema de Desenho no Mapa
 * Ferramentas: Régua (distância), Polígono livre, Retângulo, Círculo
 * Cada desenho exibe: área (ha), perímetro (km/m), cor customizável, rótulo
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Source, Layer, Marker } from 'react-map-gl';
import {
  area as turfArea,
  length as turfLength,
  distance as turfDistance,
  polygon as turfPolygon,
  lineString as turfLineString,
  circle as turfCircle,
  bbox as turfBbox,
} from '@turf/turf';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type DrawMode = 'none' | 'ruler' | 'polygon' | 'rectangle' | 'circle';

export type DrawingCategory =
  | 'area_queima'
  | 'area_soja'
  | 'area_dessecada'
  | 'area_eucalipto'
  | 'area_irrigacao'
  | 'area_livre';

export interface DrawnShape {
  id: string;
  type: 'polygon' | 'rectangle' | 'circle' | 'ruler';
  coordinates: [number, number][];
  color: string;
  fillColor: string;
  label: string;
  category: DrawingCategory;
  areaHa?: number;
  perimeterKm?: number;
  distanceKm?: number;
  radiusKm?: number;
  center?: [number, number];
  createdAt: number;
}

// ─── Configurações de categoria ─────────────────────────────────────────────

export const DRAWING_CATEGORIES: Record<DrawingCategory, {
  label: string;
  emoji: string;
  color: string;
  fillColor: string;
  fillOpacity: number;
}> = {
  area_queima:    { label: 'Área de Queima',    emoji: '🔥', color: '#ff4500', fillColor: '#ff4500', fillOpacity: 0.35 },
  area_soja:      { label: 'Área de Soja',      emoji: '🌿', color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.30 },
  area_dessecada: { label: 'Área Dessecada',    emoji: '🟤', color: '#a16207', fillColor: '#a16207', fillOpacity: 0.35 },
  area_eucalipto: { label: 'Área de Eucalipto', emoji: '🌲', color: '#166534', fillColor: '#166534', fillOpacity: 0.30 },
  area_irrigacao: { label: 'Área de Irrigação', emoji: '💧', color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.30 },
  area_livre:     { label: 'Área Livre',        emoji: '📐', color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.25 },
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(3)} km`;
}

function formatArea(ha: number): string {
  if (ha < 1) return `${(ha * 10000).toFixed(0)} m²`;
  return `${ha.toFixed(2)} ha`;
}

function calcPolygonStats(coords: [number, number][]) {
  if (coords.length < 3) return { areaHa: 0, perimeterKm: 0 };
  const closed = [...coords, coords[0]];
  const poly = turfPolygon([closed]);
  const areaM2 = turfArea(poly);
  const line = turfLineString(closed);
  const perimeterKm = turfLength(line, { units: 'kilometers' });
  return { areaHa: areaM2 / 10000, perimeterKm };
}

function calcRulerStats(coords: [number, number][]) {
  if (coords.length < 2) return { distanceKm: 0 };
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += turfDistance(coords[i], coords[i + 1], { units: 'kilometers' });
  }
  return { distanceKm: total };
}

// ─── Componente principal ────────────────────────────────────────────────────

interface DrawingToolsProps {
  mapRef: React.RefObject<any>;
  isActive: boolean;
  onClose: () => void;
  onDrawingModeChange?: (isDrawing: boolean) => void;
}

export default function DrawingTools({ mapRef, isActive, onClose, onDrawingModeChange }: DrawingToolsProps) {
  const [mode, setMode] = useState<DrawMode>('none');

  // Notificar o pai quando o modo de desenho muda
  const handleSetMode = (newMode: DrawMode) => {
    setMode(newMode);
    onDrawingModeChange?.(newMode !== 'none');
  };
  const [category, setCategory] = useState<DrawingCategory>('area_livre');
  const [customColor, setCustomColor] = useState('#8b5cf6');
  const [label, setLabel] = useState('');
  const [shapes, setShapes] = useState<DrawnShape[]>(() => {
    try {
      const saved = localStorage.getItem('mapas-drawings');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [mousePos, setMousePos] = useState<[number, number] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false); // false = expandido
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Persistência
  useEffect(() => {
    localStorage.setItem('mapas-drawings', JSON.stringify(shapes));
  }, [shapes]);

  // Sincronizar cor com categoria
  useEffect(() => {
    setCustomColor(DRAWING_CATEGORIES[category].color);
  }, [category]);

  // ─── Handlers de clique no mapa ──────────────────────────────────────────

  const handleMapClick = useCallback((e: any) => {
    if (!isActive || mode === 'none') return;
    const { lng, lat } = e.lngLat;
    const pt: [number, number] = [lng, lat];

    if (mode === 'ruler' || mode === 'polygon') {
      setCurrentPoints(prev => [...prev, pt]);
      setIsDrawing(true);
    } else if (mode === 'rectangle') {
      if (currentPoints.length === 0) {
        setCurrentPoints([pt]);
        setIsDrawing(true);
      } else if (currentPoints.length === 1) {
        // Fechar retângulo
        const [x1, y1] = currentPoints[0];
        const [x2, y2] = pt;
        const rectCoords: [number, number][] = [
          [x1, y1], [x2, y1], [x2, y2], [x1, y2],
        ];
        finishShape(rectCoords, 'rectangle');
      }
    } else if (mode === 'circle') {
      if (currentPoints.length === 0) {
        setCurrentPoints([pt]);
        setIsDrawing(true);
      } else if (currentPoints.length === 1) {
        const radiusKm = turfDistance(currentPoints[0], pt, { units: 'kilometers' });
        finishCircle(currentPoints[0], radiusKm);
      }
    }
  }, [isActive, mode, currentPoints]);

  // Ref para detectar duplo toque em celular (touchend rápido)
  const lastTouchTimeRef = useRef<number>(0);
  const lastTouchPosRef = useRef<[number, number] | null>(null);

  const handleMapDblClick = useCallback((e: any) => {
    if (!isActive) return;
    e.preventDefault();
    if (mode === 'polygon' && currentPoints.length >= 3) {
      finishShape(currentPoints, 'polygon');
    } else if (mode === 'ruler' && currentPoints.length >= 2) {
      finishRuler(currentPoints);
    }
  }, [isActive, mode, currentPoints]);

  // Handler de toque para celular — detecta duplo toque rápido (< 400ms)
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!isActive || mode === 'none') return;
    const now = Date.now();
    const touch = e.changedTouches[0];
    const pos: [number, number] = [touch.clientX, touch.clientY];

    if (lastTouchPosRef.current) {
      const dx = Math.abs(pos[0] - lastTouchPosRef.current[0]);
      const dy = Math.abs(pos[1] - lastTouchPosRef.current[1]);
      const dt = now - lastTouchTimeRef.current;
      // Duplo toque: < 400ms e < 40px de distância
      if (dt < 400 && dx < 40 && dy < 40) {
        e.preventDefault();
        e.stopPropagation();
        if (mode === 'polygon' && currentPoints.length >= 3) {
          finishShape(currentPoints, 'polygon');
        } else if (mode === 'ruler' && currentPoints.length >= 2) {
          finishRuler(currentPoints);
        }
        lastTouchTimeRef.current = 0;
        lastTouchPosRef.current = null;
        return;
      }
    }
    lastTouchTimeRef.current = now;
    lastTouchPosRef.current = pos;
  }, [isActive, mode, currentPoints]);

  const handleMapMouseMove = useCallback((e: any) => {
    if (!isActive || !isDrawing) return;
    setMousePos([e.lngLat.lng, e.lngLat.lat]);
  }, [isActive, isDrawing]);

  // ─── Finalizar formas ────────────────────────────────────────────────────

  const finishShape = (coords: [number, number][], type: 'polygon' | 'rectangle') => {
    const { areaHa, perimeterKm } = calcPolygonStats(coords);
    const cat = DRAWING_CATEGORIES[category];
    const shape: DrawnShape = {
      id: `draw-${Date.now()}`,
      type,
      coordinates: coords,
      color: customColor,
      fillColor: customColor,
      label: label || `${cat.emoji} ${cat.label}`,
      category,
      areaHa,
      perimeterKm,
      createdAt: Date.now(),
    };
    setShapes(prev => [...prev, shape]);
    resetDrawing();
  };

  const finishRuler = (coords: [number, number][]) => {
    const { distanceKm } = calcRulerStats(coords);
    const shape: DrawnShape = {
      id: `draw-${Date.now()}`,
      type: 'ruler',
      coordinates: coords,
      color: '#f59e0b',
      fillColor: '#f59e0b',
      label: label || `📏 ${formatDistance(distanceKm)}`,
      category: 'area_livre',
      distanceKm,
      createdAt: Date.now(),
    };
    setShapes(prev => [...prev, shape]);
    resetDrawing();
  };

  const finishCircle = (center: [number, number], radiusKm: number) => {
    const circleFeature = turfCircle(center, radiusKm, { units: 'kilometers', steps: 64 });
    const coords = circleFeature.geometry.coordinates[0] as [number, number][];
    const areaHa = turfArea(circleFeature) / 10000;
    const cat = DRAWING_CATEGORIES[category];
    const shape: DrawnShape = {
      id: `draw-${Date.now()}`,
      type: 'circle',
      coordinates: coords,
      color: customColor,
      fillColor: customColor,
      label: label || `${cat.emoji} ${cat.label} (r=${formatDistance(radiusKm)})`,
      category,
      areaHa,
      radiusKm,
      center,
      createdAt: Date.now(),
    };
    setShapes(prev => [...prev, shape]);
    resetDrawing();
  };

  const resetDrawing = () => {
    setCurrentPoints([]);
    setMousePos(null);
    setIsDrawing(false);
    setLabel('');
  };

  const deleteShape = (id: string) => {
    setShapes(prev => prev.filter(s => s.id !== id));
    setShowDeleteConfirm(null);
    if (selectedShapeId === id) setSelectedShapeId(null);
  };

  const deleteAll = () => {
    setShapes([]);
    setSelectedShapeId(null);
  };

  // ─── Registrar eventos no mapa ───────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !isActive) return;

    map.on('click', handleMapClick);
    map.on('dblclick', handleMapDblClick);
    map.on('mousemove', handleMapMouseMove);
    // Registrar touchend no canvas para detectar duplo toque em celular
    const canvas = map.getCanvas();
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    if (mode !== 'none') {
      map.getCanvas().style.cursor = 'crosshair';
    }

    return () => {
      map.off('click', handleMapClick);
      map.off('dblclick', handleMapDblClick);
      map.off('mousemove', handleMapMouseMove);
      const canvas = map.getCanvas();
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.style.cursor = '';
    };
  }, [isActive, mode, handleMapClick, handleMapDblClick, handleMapMouseMove, handleTouchEnd]);

  // ─── GeoJSON das formas salvas ───────────────────────────────────────────

  const shapesGeoJSON = {
    type: 'FeatureCollection' as const,
    features: shapes
      .filter(s => s.type !== 'ruler')
      .map(s => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          color: s.fillColor,
          label: s.label,
          selected: s.id === selectedShapeId,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...s.coordinates, s.coordinates[0]]],
        },
      })),
  };

  const rulerGeoJSON = {
    type: 'FeatureCollection' as const,
    features: shapes
      .filter(s => s.type === 'ruler')
      .map(s => ({
        type: 'Feature' as const,
        properties: { id: s.id, label: s.label },
        geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      })),
  };

  // GeoJSON do desenho em andamento
  const previewCoords = mousePos
    ? [...currentPoints, mousePos]
    : currentPoints;

  const previewGeoJSON = {
    type: 'FeatureCollection' as const,
    features: previewCoords.length >= 2 ? [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: mode === 'ruler' ? 'LineString' as const : 'LineString' as const,
          coordinates: previewCoords,
        },
      },
    ] : [],
  };

  // ─── Cálculo em tempo real ───────────────────────────────────────────────

  const liveStats = (() => {
    if (!isDrawing || previewCoords.length < 2) return null;
    if (mode === 'ruler') {
      const { distanceKm } = calcRulerStats(previewCoords);
      return `📏 ${formatDistance(distanceKm)}`;
    }
    if (mode === 'polygon' && previewCoords.length >= 3) {
      const { areaHa, perimeterKm } = calcPolygonStats(previewCoords);
      return `📐 ${formatArea(areaHa)} | ${formatDistance(perimeterKm)}`;
    }
    if (mode === 'rectangle' && currentPoints.length === 1 && mousePos) {
      const [x1, y1] = currentPoints[0];
      const [x2, y2] = mousePos;
      const rectCoords: [number, number][] = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
      const { areaHa } = calcPolygonStats(rectCoords);
      return `⬜ ${formatArea(areaHa)}`;
    }
    if (mode === 'circle' && currentPoints.length === 1 && mousePos) {
      const r = turfDistance(currentPoints[0], mousePos, { units: 'kilometers' });
      const area = Math.PI * r * r * 100; // ha
      return `⭕ r=${formatDistance(r)} | ${formatArea(area)}`;
    }
    return null;
  })();

  if (!isActive) return null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Camadas de formas salvas */}
      <Source id="drawings-fill-src" type="geojson" data={shapesGeoJSON}>
        <Layer
          id="drawings-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': ['case', ['get', 'selected'], 0.55, 0.35],
          }}
        />
        <Layer
          id="drawings-outline"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ['case', ['get', 'selected'], 3, 2],
            'line-dasharray': [2, 1],
          }}
        />
      </Source>

      {/* Linhas de régua */}
      <Source id="drawings-ruler-src" type="geojson" data={rulerGeoJSON}>
        <Layer
          id="drawings-ruler"
          type="line"
          paint={{
            'line-color': '#f59e0b',
            'line-width': 2.5,
            'line-dasharray': [4, 2],
          }}
        />
      </Source>

      {/* Preview do desenho em andamento */}
      <Source id="drawing-preview-src" type="geojson" data={previewGeoJSON}>
        <Layer
          id="drawing-preview"
          type="line"
          paint={{
            'line-color': mode === 'ruler' ? '#f59e0b' : customColor,
            'line-width': 2,
            'line-dasharray': [3, 2],
          }}
        />
      </Source>

      {/* Marcadores dos pontos clicados */}
      {currentPoints.map((pt, i) => (
        <Marker key={`pt-${i}`} longitude={pt[0]} latitude={pt[1]} anchor="center">
          <div
            style={{
              width: 10, height: 10,
              borderRadius: '50%',
              background: mode === 'ruler' ? '#f59e0b' : customColor,
              border: '2px solid white',
              boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            }}
          />
        </Marker>
      ))}

      {/* Rótulos das formas salvas */}
      {shapes.map(shape => {
        const midIdx = Math.floor(shape.coordinates.length / 2);
        const [lng, lat] = shape.coordinates[midIdx] || shape.coordinates[0];
        return (
          <Marker key={`lbl-${shape.id}`} longitude={lng} latitude={lat} anchor="center">
            <div
              onClick={() => setSelectedShapeId(shape.id === selectedShapeId ? null : shape.id)}
              style={{
                background: 'rgba(0,0,0,0.75)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1.5px solid ${shape.color}`,
                whiteSpace: 'nowrap',
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {shape.label}
              {shape.areaHa !== undefined && (
                <span style={{ color: '#86efac', marginLeft: 4 }}>
                  {formatArea(shape.areaHa)}
                </span>
              )}
              {shape.distanceKm !== undefined && (
                <span style={{ color: '#fde68a', marginLeft: 4 }}>
                  {formatDistance(shape.distanceKm)}
                </span>
              )}
            </div>
          </Marker>
        );
      })}

      {/* Indicador de distância/área em tempo real */}
      {liveStats && mousePos && (
        <Marker longitude={mousePos[0]} latitude={mousePos[1]} anchor="bottom-left" offset={[10, -10]}>
          <div style={{
            background: 'rgba(0,0,0,0.85)',
            color: 'white',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.2)',
            pointerEvents: 'none',
          }}>
            {liveStats}
          </div>
        </Marker>
      )}

      {/* ─── Painel de controle (via portal, fora do Map) ───────────────── */}
      {createPortal(
      <div
        style={{ position: 'fixed', top: 60, right: 4, minWidth: 260, maxWidth: 300, zIndex: 9999, maxHeight: 'calc(100vh - 70px)', overflowY: 'auto' }}
        className="bg-gray-900 bg-opacity-97 rounded-xl shadow-2xl border border-gray-700"
      >   {/* Header */}
        <div
          className="flex items-center justify-between p-3 cursor-pointer border-b border-gray-700"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-2">
            <span className="text-purple-400 text-base">✏️</span>
            <span className="text-xs font-bold text-white uppercase tracking-wide">Ferramentas de Desenho</span>
            {shapes.length > 0 && (
              <span className="bg-purple-600 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                {shapes.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-xs">{isMinimized ? '▲' : '▼'}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-gray-400 hover:text-red-400 ml-1 text-xs px-1"
              title="Fechar"
            >✕</button>
          </div>
        </div>

        {!isMinimized && (
          <div className="p-3 space-y-3">

            {/* Seleção de modo */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Ferramenta</p>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { m: 'ruler',     icon: '📏', tip: 'Régua (distância)' },
                  { m: 'polygon',   icon: '🔷', tip: 'Polígono livre' },
                  { m: 'rectangle', icon: '⬜', tip: 'Retângulo' },
                  { m: 'circle',    icon: '⭕', tip: 'Círculo' },
                ] as const).map(({ m, icon, tip }) => (
                  <button
                    key={m}
                    title={tip}
                    onClick={() => {
                      handleSetMode(mode === m ? 'none' : m);
                      resetDrawing();
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-base transition-all ${
                      mode === m
                        ? 'bg-purple-600 border border-purple-400 shadow-lg scale-105'
                        : 'bg-gray-800 border border-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    <span>{icon}</span>
                    <span className="text-xs text-gray-300 mt-0.5" style={{ fontSize: 9 }}>
                      {tip.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Instrução contextual */}
            {mode !== 'none' && (
              <div className="bg-purple-900 bg-opacity-50 border border-purple-700 rounded-lg p-2">
                <p className="text-purple-200 text-xs">
                  {mode === 'ruler' && '📏 Toque para adicionar pontos. Toque 2x rápido ou use o botão ✅ para finalizar.'}
                  {mode === 'polygon' && '🔷 Toque para adicionar vértices. Toque 2x rápido ou use o botão ✅ abaixo para fechar.'}
                  {mode === 'rectangle' && '⬜ Clique no 1º canto, depois no 2º canto oposto.'}
                  {mode === 'circle' && '⭕ Clique no centro, depois no raio desejado.'}
                </p>
                {currentPoints.length > 0 && (
                  <p className="text-yellow-300 text-xs mt-1">
                    {currentPoints.length} ponto{currentPoints.length > 1 ? 's' : ''} marcado{currentPoints.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Categoria (não para régua) */}
            {mode !== 'ruler' && mode !== 'none' && (
              <div>
                <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Categoria</p>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as DrawingCategory)}
                  className="w-full bg-gray-800 text-white text-xs border border-gray-600 rounded-lg px-2 py-1.5"
                >
                  {(Object.entries(DRAWING_CATEGORIES) as [DrawingCategory, any][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.emoji} {v.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Cor personalizada */}
            {mode !== 'none' && mode !== 'ruler' && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide flex-1">Cor</p>
                <input
                  type="color"
                  value={customColor}
                  onChange={e => setCustomColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  title="Escolher cor"
                />
                <div className="flex gap-1">
                  {['#ff4500','#22c55e','#0ea5e9','#f59e0b','#8b5cf6','#ec4899'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCustomColor(c)}
                      style={{ background: c }}
                      className="w-5 h-5 rounded-full border-2 border-gray-600 hover:scale-110 transition-transform"
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Rótulo */}
            {mode !== 'none' && (
              <div>
                <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Rótulo (opcional)</p>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Ex: Área 1 - Queima 2025"
                  className="w-full bg-gray-800 text-white text-xs border border-gray-600 rounded-lg px-2 py-1.5 placeholder-gray-500"
                />
              </div>
            )}

            {/* Botão CONCLUIR — touch-friendly para celular */}
            {isDrawing && (
              (mode === 'polygon' && currentPoints.length >= 3) ||
              (mode === 'ruler' && currentPoints.length >= 2)
            ) && (
              <button
                onClick={() => {
                  if (mode === 'polygon') finishShape(currentPoints, 'polygon');
                  else if (mode === 'ruler') finishRuler(currentPoints);
                }}
                className="w-full text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                  fontSize: 15,
                  letterSpacing: 0.5,
                  boxShadow: '0 4px 15px rgba(34,197,94,0.4)',
                }}
              >
                ✅ Concluir {mode === 'polygon' ? 'Polígono' : 'Régua'}
                {currentPoints.length > 0 && (
                  <span className="ml-2 text-green-200 font-normal" style={{ fontSize: 12 }}>
                    ({currentPoints.length} pontos)
                  </span>
                )}
              </button>
            )}

            {/* Botão cancelar desenho atual */}
            {isDrawing && currentPoints.length > 0 && (
              <button
                onClick={resetDrawing}
                className="w-full bg-red-800 hover:bg-red-700 text-white text-xs py-2 rounded-lg font-semibold transition"
              >
                ✕ Cancelar Desenho
              </button>
            )}

            {/* Lista de formas salvas */}
            {shapes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Desenhos Salvos ({shapes.length})
                  </p>
                  <button
                    onClick={deleteAll}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >
                    Apagar todos
                  </button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {shapes.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedShapeId(s.id === selectedShapeId ? null : s.id)}
                      className={`flex items-start justify-between p-2 rounded-lg cursor-pointer transition-all ${
                        s.id === selectedShapeId
                          ? 'bg-purple-900 border border-purple-500'
                          : 'bg-gray-800 border border-gray-700 hover:bg-gray-750'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ background: s.color }}
                          />
                          <p className="text-xs text-white font-semibold truncate">{s.label}</p>
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          {s.areaHa !== undefined && (
                            <span className="text-xs text-green-400">{formatArea(s.areaHa)}</span>
                          )}
                          {s.perimeterKm !== undefined && (
                            <span className="text-xs text-blue-400">{formatDistance(s.perimeterKm)}</span>
                          )}
                          {s.distanceKm !== undefined && (
                            <span className="text-xs text-yellow-400">{formatDistance(s.distanceKm)}</span>
                          )}
                        </div>
                      </div>
                      {showDeleteConfirm === s.id ? (
                        <div className="flex gap-1 ml-1">
                          <button
                            onClick={e => { e.stopPropagation(); deleteShape(s.id); }}
                            className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded hover:bg-red-500"
                          >✓</button>
                          <button
                            onClick={e => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                            className="text-xs bg-gray-600 text-white px-1.5 py-0.5 rounded hover:bg-gray-500"
                          >✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setShowDeleteConfirm(s.id); }}
                          className="text-red-400 hover:text-red-300 ml-1 text-xs flex-shrink-0"
                          title="Apagar"
                        >🗑</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>        )}

      </div>
      , document.body)}
    </>
  );
}
