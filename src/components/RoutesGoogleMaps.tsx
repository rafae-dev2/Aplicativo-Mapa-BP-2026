import React, { useState, useEffect } from 'react';
import { MapPin, Globe, X } from 'lucide-react';
import { useRouteManager } from '@/hooks/useRouteManager';

interface RoutesGoogleMapsProps {
  selectedFundo?: number;
  selectedTalhao?: number;
  geojsonData: any;
  isFullscreen?: boolean;
  onClose?: () => void;
}

export const RoutesGoogleMaps: React.FC<RoutesGoogleMapsProps> = ({
  selectedFundo,
  selectedTalhao,
  geojsonData,
  isFullscreen = false,
  onClose,
}) => {
  const { rotas } = useRouteManager({
    geojsonData,
    autoExtract: true,
  }) as { rotas: any[] };

  const [showOptions, setShowOptions] = useState(false);

  // Filtrar rotas da fazenda selecionada
  const fazendaRotas = rotas.filter(
    (rota) => rota.fazenda === selectedFundo
  );

  if (!selectedFundo || !selectedTalhao || fazendaRotas.length === 0 || isFullscreen) {
    return null;
  }

  // Gerar URL do Google Maps com as rotas
  const generateGoogleMapsUrl = () => {
    if (fazendaRotas.length === 0) return '';

    const waypoints = fazendaRotas
      .map((rota) => {
        if (rota.coordenadas && rota.coordenadas.length > 0) {
          const [lng, lat] = rota.coordenadas[0];
          return `${lat},${lng}`;
        }
        return null;
      })
      .filter(Boolean);

    if (waypoints.length === 0) return '';

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const middleWaypoints = waypoints.slice(1, -1).join('|');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (middleWaypoints) {
      url += `&waypoints=${middleWaypoints}`;
    }
    url += '&travelmode=driving';

    return url;
  };

  // Gerar URL do Google Earth
  const generateGoogleEarthUrl = () => {
    if (fazendaRotas.length === 0) return '';

    const firstRota = fazendaRotas[0];
    if (!firstRota.coordenadas || firstRota.coordenadas.length === 0) return '';

    const [lng, lat] = firstRota.coordenadas[0];
    return `https://earth.google.com/web/@${lat},${lng},100a,1000000d,35y,0h,0t,0r`;
  };

  const handleOpenGoogleMaps = () => {
    const url = generateGoogleMapsUrl();
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleOpenGoogleEarth = () => {
    const url = generateGoogleEarthUrl();
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Botão Principal */}
      <button
        onClick={() => setShowOptions(!showOptions)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(34,139,34,0.8), rgba(50,205,50,0.8))',
          border: '2px solid rgba(144,238,144,0.6)',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3), 0 0 16px rgba(34,139,34,0.4)',
          color: '#fff',
          transition: 'all 0.3s ease',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 12px 32px rgba(0,0,0,0.4), 0 0 20px rgba(34,139,34,0.6)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 8px 24px rgba(0,0,0,0.3), 0 0 16px rgba(34,139,34,0.4)';
        }}
        title={`${fazendaRotas.length} rotas encontradas`}
      >
        <MapPin size={24} />
        {fazendaRotas.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              background: '#FF6B35',
              color: '#fff',
              borderRadius: '50%',
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 'bold',
              border: '2px solid rgba(255,255,255,0.8)',
            }}
          >
            {fazendaRotas.length}
          </span>
        )}
      </button>

      {/* Menu de Opções */}
      {showOptions && (
        <div
          style={{
            position: 'absolute',
            bottom: 70,
            right: 0,
            background: 'rgba(20,28,42,0.98)',
            backdropFilter: 'blur(20px)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            minWidth: 200,
            zIndex: 50,
            animation: 'slideUp 0.2s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(144,238,144,0.8)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Rotas da Fazenda
            </span>
            <button
              onClick={() => setShowOptions(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Opções */}
          <button
            onClick={handleOpenGoogleMaps}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 14,
              fontWeight: 500,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(34,139,34,0.2)';
              (e.currentTarget as HTMLButtonElement).style.color = '#90EE90';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)';
            }}
          >
            <MapPin size={16} />
            Google Maps
          </button>

          <button
            onClick={handleOpenGoogleEarth}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 14,
              fontWeight: 500,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(34,139,34,0.2)';
              (e.currentTarget as HTMLButtonElement).style.color = '#90EE90';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)';
            }}
          >
            <Globe size={16} />
            Google Earth
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
