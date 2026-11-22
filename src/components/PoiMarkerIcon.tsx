import React from 'react';
import {
  AlertTriangle,
  CloudRain,
  CircleDot,
  Construction,
  Droplet,
  Flame,
  LocateFixed,
  MapPin,
  Settings2,
  Sprout,
  SunMedium,
  TreePine,
  Truck,
  Waves,
  Wheat,
  Wind,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_BY_CATEGORY: Record<string, LucideIcon> = {
  represa: Waves,
  marcacao: MapPin,
  poco: Droplet,
  bomba: Settings2,
  outro: CircleDot,
  irrigacao: CloudRain,
  irrigar: LocateFixed,
  eucalipto: TreePine,
  soja: Sprout,
  dessecada: SunMedium,
  adubo: Sprout,
  tubulacao: Wrench,
  implemento: Construction,
  transporte_insumo: Truck,
  perigo: AlertTriangle,
  incendio: Flame,
  queimada: Wind,
};

const DEFAULT_COLORS: Record<string, string> = {
  represa: '#38bdf8',
  marcacao: '#b7ff4a',
  poco: '#60a5fa',
  bomba: '#cbd5e1',
  outro: '#f59e0b',
  irrigacao: '#22d3ee',
  irrigar: '#0ea5e9',
  eucalipto: '#34d399',
  soja: '#a3e635',
  dessecada: '#f59e0b',
  adubo: '#4ade80',
  tubulacao: '#fb923c',
  implemento: '#fbbf24',
  transporte_insumo: '#f97316',
  perigo: '#ff6b6b',
  incendio: '#ff3b30',
  queimada: '#f97316',
};

export const ALERT_ICON_CATEGORIES = new Set(['perigo', 'incendio', 'queimada']);

export function getPoiIcon(category: string): LucideIcon {
  return ICON_BY_CATEGORY[category] || MapPin;
}

export function getPoiColor(category: string, fallback = '#b7ff4a'): string {
  return DEFAULT_COLORS[category] || fallback;
}

// Ícone do pegador de água: caminhão-pipa azul (transparente, sem quadrado).
// Quando a represa está baixa (água indisponível), usamos a versão com o X.
export const WATER_TRUCK_ICON = '/poi-water-truck-blue.png';
export const WATER_TRUCK_UNAVAILABLE_ICON = '/poi-water-truck-x.png';

interface PoiCategoryIconProps {
  category: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  transportMaterial?: string;
  waterAvailable?: boolean;
}

export function PoiCategoryIcon({
  category,
  size = 20,
  strokeWidth = 2.3,
  color,
  className,
  transportMaterial,
  waterAvailable = true,
}: PoiCategoryIconProps) {
  if (category === 'represa' || category === 'transporte_insumo') {
    const isTransport = category === 'transporte_insumo';
    const isMunckTransport = isTransport && (transportMaterial === 'reativo_bigbag' || transportMaterial === 'adubo');
    const waterSrc = waterAvailable ? WATER_TRUCK_ICON : WATER_TRUCK_UNAVAILABLE_ICON;
    return (
      <img
        src={isMunckTransport ? '/poi-pin-transport-munck-truck.png' : isTransport ? '/poi-pin-transport-dump-truck.png' : waterSrc}
        alt=""
        width={isTransport ? Math.round(size * 1.34) : size}
        height={size}
        className={className}
        aria-hidden="true"
        style={{
          width: isTransport ? Math.round(size * 1.34) : size,
          height: size,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    );
  }

  const Icon = getPoiIcon(category);
  return <Icon size={size} strokeWidth={strokeWidth} color={color || getPoiColor(category)} className={className} aria-hidden="true" />;
}

interface PoiMarkerIconProps {
  category: string;
  color?: string;
  title?: string;
  selected?: boolean;
  hovered?: boolean;
  hasPhoto?: boolean;
  transportMaterial?: string;
  waterAvailable?: boolean;
}

export function PoiMarkerIcon({
  category,
  color,
  title,
  selected = false,
  hovered = false,
  hasPhoto = false,
  transportMaterial,
  waterAvailable = true,
}: PoiMarkerIconProps) {
  const markerColor = color || getPoiColor(category);
  const isAlert = ALERT_ICON_CATEGORIES.has(category);
  const isWaterTruck = category === 'represa';
  const isTransportTruck = category === 'transporte_insumo';
  const isMunckTransport = isTransportTruck && (transportMaterial === 'reativo_bigbag' || transportMaterial === 'adubo');
  const isWaterUnavailable = isWaterTruck && !waterAvailable;
  const Icon = getPoiIcon(category);
  const label = title || category || 'Marcação';

  return (
    <div
      className={`bp-poi-marker ${isAlert ? 'bp-poi-marker-alert' : ''} ${isWaterTruck ? 'bp-poi-marker-water-truck' : ''} ${isWaterUnavailable ? 'bp-poi-marker-water-unavailable' : ''} ${isTransportTruck ? 'bp-poi-marker-transport-truck' : ''} ${isMunckTransport ? 'bp-poi-marker-transport-munck' : ''} ${category === 'incendio' ? 'bp-poi-marker-fire' : ''} ${selected ? 'is-selected' : ''} ${hovered ? 'is-hovered' : ''}`}
      style={{ '--poi-color': markerColor } as React.CSSProperties}
      title={label}
      aria-label={isWaterUnavailable ? `${label} (represa baixa, sem água)` : label}
      role="img"
    >
      <span className="bp-poi-marker-orbit bp-poi-marker-orbit-outer" />
      <span className="bp-poi-marker-orbit bp-poi-marker-orbit-inner" />
      <span className="bp-poi-marker-glow" />
      <span className="bp-poi-marker-core">
        {isWaterTruck || isTransportTruck ? (
          <img
            src={isMunckTransport ? '/poi-pin-transport-munck-truck.png' : isTransportTruck ? '/poi-pin-transport-dump-truck.png' : (waterAvailable ? WATER_TRUCK_ICON : WATER_TRUCK_UNAVAILABLE_ICON)}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <Icon size={isAlert ? 22 : 20} strokeWidth={isAlert ? 2.7 : 2.45} aria-hidden="true" />
        )}
      </span>
      <span className="bp-poi-marker-tip" />
      {isAlert && <span className="bp-poi-marker-alert-badge">!</span>}
      {hasPhoto && <span className="bp-poi-marker-photo-dot" aria-label="Contém foto" />}
    </div>
  );
}
