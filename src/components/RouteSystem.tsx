/**
 * RouteSystem — Sistema de Rotas para Carreadores
 * 
 * Funcionalidades:
 * - Visualização de rotas no mapa
 * - Integração com Waze
 * - Integração com Google Maps
 * - Controle de rotas por fazenda
 * - Compartilhamento de rotas
 */

import React, { useState, useCallback, useMemo } from 'react';
import { MapPin, Navigation, Share2, Eye, EyeOff, Truck, X } from 'lucide-react';
import { COLORS } from '@/config/constants';

export interface Route {
  id: string;
  fazenda: number;
  zona?: number;
  nome?: string;
  coordenadas: [number, number][];
  distancia?: number;
  tempo?: number;
  tipo: 'carreador' | 'entrega' | 'coleta';
  ativo: boolean;
}

interface RouteSystemProps {
  rotas: Route[];
  onRotaSelect?: (rota: Route) => void;
  onRotaVisualize?: (rota: Route, visible: boolean) => void;
  onWazeNavigation?: (rota: Route) => void;
  onGoogleMapsNavigation?: (rota: Route) => void;
}

export const RouteSystem: React.FC<RouteSystemProps> = ({
  rotas,
  onRotaSelect,
  onRotaVisualize,
  onWazeNavigation,
  onGoogleMapsNavigation,
}) => {
  const [selectedRota, setSelectedRota] = useState<Route | null>(null);
  const [visibleRotas, setVisibleRotas] = useState<Set<string>>(new Set());
  const [expandedFazenda, setExpandedFazenda] = useState<number | null>(null);

  // Agrupar rotas por fazenda
  const rotasPorFazenda = useMemo(() => {
    const grouped: Record<number, Route[]> = {};
    rotas.forEach((rota) => {
      if (!grouped[rota.fazenda]) {
        grouped[rota.fazenda] = [];
      }
      grouped[rota.fazenda].push(rota);
    });
    return grouped;
  }, [rotas]);

  // Alternar visibilidade de rota
  const toggleRotaVisibility = useCallback(
    (rota: Route) => {
      const newVisible = new Set(visibleRotas);
      if (newVisible.has(rota.id)) {
        newVisible.delete(rota.id);
      } else {
        newVisible.add(rota.id);
      }
      setVisibleRotas(newVisible);
      onRotaVisualize?.(rota, newVisible.has(rota.id));
    },
    [visibleRotas, onRotaVisualize]
  );

  // Navegar com Waze
  const handleWazeNavigation = useCallback(
    (rota: Route) => {
      if (rota.coordenadas.length > 0) {
        const [lng, lat] = rota.coordenadas[rota.coordenadas.length - 1];
        const wazeUrl = `https://waze.com/ul?navigate=yes&ll=${lat},${lng}`;
        window.open(wazeUrl, '_blank');
        onWazeNavigation?.(rota);
      }
    },
    [onWazeNavigation]
  );

  // Navegar com Google Maps
  const handleGoogleMapsNavigation = useCallback(
    (rota: Route) => {
      if (rota.coordenadas.length > 0) {
        const [lng, lat] = rota.coordenadas[rota.coordenadas.length - 1];
        const googleMapsUrl = `https://www.google.com/maps/search/${lat},${lng}`;
        window.open(googleMapsUrl, '_blank');
        onGoogleMapsNavigation?.(rota);
      }
    },
    [onGoogleMapsNavigation]
  );

  // Compartilhar rota
  const handleShareRoute = useCallback((rota: Route) => {
    const rotaData = encodeURIComponent(JSON.stringify({
      fazenda: rota.fazenda,
      nome: rota.nome,
      tipo: rota.tipo,
      coordenadas: rota.coordenadas,
    }));

    const shareUrl = `${window.location.origin}?rota=${rotaData}`;

    if (navigator.share) {
      navigator.share({
        title: `Rota - Fazenda ${rota.fazenda}`,
        text: `Rota de ${rota.tipo} para a Fazenda ${rota.fazenda}`,
        url: shareUrl,
      }).catch(() => {
        // Fallback
        navigator.clipboard.writeText(shareUrl);
      });
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('Link copiado para a área de transferência!');
    }
  }, []);

  // Calcular distância entre pontos
  const calcularDistancia = useCallback((coords: [number, number][]): number => {
    if (coords.length < 2) return 0;

    let distancia = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];

      const R = 6371; // Raio da Terra em km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distancia += R * c;
    }

    return distancia;
  }, []);

  return (
    <div className="route-system-container">
      {/* Header */}
      <div className="route-system-header">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5" style={{ color: COLORS.GLASS_GREEN }} />
          <h3 className="text-lg font-semibold">Sistema de Rotas</h3>
        </div>
        <span className="text-sm text-gray-400">
          {rotas.length} rotas disponíveis
        </span>
      </div>

      {/* Lista de Rotas por Fazenda */}
      <div className="route-system-list">
        {Object.entries(rotasPorFazenda).map(([fazendaId, rotasFazenda]) => (
          <div key={fazendaId} className="route-fazenda-group">
            {/* Header da Fazenda */}
            <button
              onClick={() =>
                setExpandedFazenda(
                  expandedFazenda === Number(fazendaId) ? null : Number(fazendaId)
                )
              }
              className="route-fazenda-header"
            >
              <div className="flex items-center gap-2 flex-1">
                <MapPin className="w-4 h-4" style={{ color: COLORS.GLASS_GREEN }} />
                <span className="font-medium">Fazenda {fazendaId}</span>
                <span className="text-xs text-gray-400">
                  ({rotasFazenda.length} {rotasFazenda.length === 1 ? 'rota' : 'rotas'})
                </span>
              </div>
              <span className="text-xs">
                {expandedFazenda === Number(fazendaId) ? '▼' : '▶'}
              </span>
            </button>

            {/* Rotas da Fazenda */}
            {expandedFazenda === Number(fazendaId) && (
              <div className="route-fazenda-rotas">
                {rotasFazenda.map((rota) => (
                  <div
                    key={rota.id}
                    className={`route-item ${
                      selectedRota?.id === rota.id ? 'selected' : ''
                    }`}
                    onClick={() => {
                      setSelectedRota(rota);
                      onRotaSelect?.(rota);
                    }}
                  >
                    {/* Informações da Rota */}
                    <div className="route-item-info">
                      <div className="route-item-header">
                        <span className="route-item-name">
                          {rota.nome || `Rota ${rota.tipo}`}
                        </span>
                        <span className="route-item-type">{rota.tipo}</span>
                      </div>

                      {/* Detalhes */}
                      <div className="route-item-details">
                        {rota.coordenadas.length > 0 && (
                          <>
                            <span className="text-xs text-gray-400">
                              {rota.coordenadas.length} pontos
                            </span>
                            <span className="text-xs text-gray-400">
                              {calcularDistancia(rota.coordenadas).toFixed(2)} km
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Controles */}
                    <div className="route-item-controls">
                      {/* Visibilidade */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRotaVisibility(rota);
                        }}
                        className="route-control-btn"
                        title={
                          visibleRotas.has(rota.id)
                            ? 'Ocultar rota'
                            : 'Mostrar rota'
                        }
                      >
                        {visibleRotas.has(rota.id) ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>

                      {/* Waze */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWazeNavigation(rota);
                        }}
                        className="route-control-btn"
                        title="Navegar com Waze"
                      >
                        <Navigation className="w-4 h-4" />
                      </button>

                      {/* Google Maps */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGoogleMapsNavigation(rota);
                        }}
                        className="route-control-btn"
                        title="Navegar com Google Maps"
                      >
                        <MapPin className="w-4 h-4" />
                      </button>

                      {/* Compartilhar */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareRoute(rota);
                        }}
                        className="route-control-btn"
                        title="Compartilhar rota"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detalhe da Rota Selecionada */}
      {selectedRota && (
        <div className="route-system-detail">
          <div className="route-detail-header">
            <h4>Detalhes da Rota</h4>
            <button
              onClick={() => setSelectedRota(null)}
              className="route-detail-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="route-detail-content">
            <div className="route-detail-item">
              <span className="label">Fazenda:</span>
              <span className="value">{selectedRota.fazenda}</span>
            </div>

            {selectedRota.zona && (
              <div className="route-detail-item">
                <span className="label">Zona:</span>
                <span className="value">{selectedRota.zona}</span>
              </div>
            )}

            <div className="route-detail-item">
              <span className="label">Tipo:</span>
              <span className="value">{selectedRota.tipo}</span>
            </div>

            <div className="route-detail-item">
              <span className="label">Pontos:</span>
              <span className="value">{selectedRota.coordenadas.length}</span>
            </div>

            <div className="route-detail-item">
              <span className="label">Distância:</span>
              <span className="value">
                {calcularDistancia(selectedRota.coordenadas).toFixed(2)} km
              </span>
            </div>

            {/* Botões de Ação */}
            <div className="route-detail-actions">
              <button
                onClick={() => toggleRotaVisibility(selectedRota)}
                className="route-action-btn primary"
              >
                {visibleRotas.has(selectedRota.id) ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Ocultar no Mapa
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Mostrar no Mapa
                  </>
                )}
              </button>

              <button
                onClick={() => handleWazeNavigation(selectedRota)}
                className="route-action-btn"
              >
                <Navigation className="w-4 h-4" />
                Waze
              </button>

              <button
                onClick={() => handleGoogleMapsNavigation(selectedRota)}
                className="route-action-btn"
              >
                <MapPin className="w-4 h-4" />
                Google Maps
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estilos */}
      <style>{`
        .route-system-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          background: rgba(26, 35, 51, 0.97);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          backdrop-filter: blur(20px);
          max-height: 600px;
          overflow-y: auto;
        }

        .route-system-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .route-system-header h3 {
          margin: 0;
          color: #fff;
        }

        .route-system-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .route-fazenda-group {
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          overflow: hidden;
        }

        .route-fazenda-header {
          width: 100%;
          padding: 0.75rem;
          background: rgba(173, 255, 47, 0.05);
          border: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
          color: #fff;
        }

        .route-fazenda-header:hover {
          background: rgba(173, 255, 47, 0.1);
        }

        .route-fazenda-rotas {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.5rem;
          background: rgba(0, 0, 0, 0.2);
        }

        .route-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .route-item:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(173, 255, 47, 0.3);
        }

        .route-item.selected {
          background: rgba(173, 255, 47, 0.15);
          border-color: rgba(173, 255, 47, 0.5);
        }

        .route-item-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .route-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }

        .route-item-name {
          font-weight: 500;
          color: #fff;
          font-size: 0.9rem;
        }

        .route-item-type {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          background: rgba(173, 255, 47, 0.2);
          color: #adff2f;
          border-radius: 4px;
        }

        .route-item-details {
          display: flex;
          gap: 0.5rem;
          font-size: 0.8rem;
        }

        .route-item-controls {
          display: flex;
          gap: 0.5rem;
          margin-left: 0.5rem;
        }

        .route-control-btn {
          padding: 0.4rem;
          background: rgba(173, 255, 47, 0.1);
          border: 1px solid rgba(173, 255, 47, 0.3);
          border-radius: 4px;
          cursor: pointer;
          color: #adff2f;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .route-control-btn:hover {
          background: rgba(173, 255, 47, 0.2);
          border-color: rgba(173, 255, 47, 0.6);
        }

        .route-system-detail {
          margin-top: 1rem;
          padding: 1rem;
          background: rgba(173, 255, 47, 0.1);
          border: 1px solid rgba(173, 255, 47, 0.3);
          border-radius: 8px;
        }

        .route-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(173, 255, 47, 0.2);
        }

        .route-detail-header h4 {
          margin: 0;
          color: #adff2f;
        }

        .route-detail-close {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          padding: 0.25rem;
        }

        .route-detail-content {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .route-detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.9rem;
        }

        .route-detail-item .label {
          color: #999;
        }

        .route-detail-item .value {
          color: #adff2f;
          font-weight: 500;
        }

        .route-detail-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.75rem;
          flex-wrap: wrap;
        }

        .route-action-btn {
          flex: 1;
          min-width: 100px;
          padding: 0.6rem;
          background: rgba(173, 255, 47, 0.15);
          border: 1px solid rgba(173, 255, 47, 0.4);
          border-radius: 6px;
          color: #adff2f;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s ease;
        }

        .route-action-btn:hover {
          background: rgba(173, 255, 47, 0.25);
          border-color: rgba(173, 255, 47, 0.7);
        }

        .route-action-btn.primary {
          background: rgba(173, 255, 47, 0.25);
          border-color: rgba(173, 255, 47, 0.6);
        }

        @media (max-width: 768px) {
          .route-system-container {
            max-height: 400px;
            padding: 0.75rem;
          }

          .route-item-controls {
            gap: 0.25rem;
          }

          .route-control-btn {
            padding: 0.3rem;
          }

          .route-detail-actions {
            flex-direction: column;
          }

          .route-action-btn {
            min-width: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default RouteSystem;
