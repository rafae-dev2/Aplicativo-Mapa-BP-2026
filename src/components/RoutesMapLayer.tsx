/**
 * RoutesMapLayer — Camada de Rotas no Mapa
 * 
 * Funcionalidades:
 * - Renderizar rotas no mapa
 * - Mostrar/ocultar rotas
 * - Destacar rotas selecionadas
 * - Integração com Mapbox GL
 */

import React, { useEffect, useCallback } from 'react';
import { Source, Layer } from 'react-map-gl';
import type { Route } from '@/components/RouteSystem';

interface RoutesMapLayerProps {
  map: any;
  rotas: Route[];
  visibleRotas: Set<string>;
  selectedRota?: Route | null;
  onRotaClick?: (rota: Route) => void;
}

export const RoutesMapLayer: React.FC<RoutesMapLayerProps> = ({
  map,
  rotas,
  visibleRotas,
  selectedRota,
  onRotaClick,
}) => {
  // Cores por tipo de rota
  const corsPorTipo = {
    carreador: '#FF6B35', // Laranja
    entrega: '#4ECDC4', // Teal
    coleta: '#95E1D3', // Verde claro
  };

  // Converter rotas para GeoJSON
  const rotasGeoJSON = useCallback(() => {
    const features = rotas
      .filter((rota) => visibleRotas.has(rota.id))
      .map((rota) => ({
        type: 'Feature',
        id: rota.id,
        properties: {
          rotaId: rota.id,
          fazenda: rota.fazenda,
          tipo: rota.tipo,
          nome: rota.nome,
          ativo: rota.ativo,
          selecionada: selectedRota?.id === rota.id,
        },
        geometry: {
          type: 'LineString',
          coordinates: rota.coordenadas,
        },
      }));

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [rotas, visibleRotas, selectedRota]);

  // Adicionar camadas ao mapa
  useEffect(() => {
    if (!map) return;

    try {
      const sourceId = 'rotas-source';
      const layerId = 'rotas-layer';
      const layerIdSelecionada = 'rotas-layer-selecionada';

      // Remover camadas existentes
      if (map.getLayer(layerIdSelecionada)) {
        map.removeLayer(layerIdSelecionada);
      }
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }

      // Adicionar source
      map.addSource(sourceId, {
        type: 'geojson',
        data: rotasGeoJSON(),
      });

      // Camada de rotas normais
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        filter: ['!', ['boolean', ['feature-state', 'selecionada'], false]],
        paint: {
          'line-color': [
            'match',
            ['get', 'tipo'],
            'carreador',
            corsPorTipo.carreador,
            'entrega',
            corsPorTipo.entrega,
            'coleta',
            corsPorTipo.coleta,
            '#999',
          ],
          'line-width': 3,
          'line-opacity': 0.7,
        },
      });

      // Camada de rota selecionada
      map.addLayer({
        id: layerIdSelecionada,
        type: 'line',
        source: sourceId,
        filter: ['boolean', ['feature-state', 'selecionada'], false],
        paint: {
          'line-color': '#ADFF2F',
          'line-width': 5,
          'line-opacity': 1,
        },
      });

      // Event listeners
      map.on('click', layerId, (e: any) => {
        if (e.features && e.features.length > 0) {
          const rotaId = e.features[0].properties.rotaId;
          const rota = rotas.find((r) => r.id === rotaId);
          if (rota) {
            onRotaClick?.(rota);
          }
        }
      });

      // Mudar cursor ao passar sobre rotas
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });

      return () => {
        // Cleanup
        map.off('click', layerId);
        map.off('mouseenter', layerId);
        map.off('mouseleave', layerId);
      };
    } catch (error) {
      console.error('[RoutesMapLayer] Erro ao adicionar camadas:', error);
    }
  }, [map, rotas, visibleRotas, selectedRota, onRotaClick, rotasGeoJSON]);

  // Atualizar dados quando rotas mudam
  useEffect(() => {
    if (!map) return;

    try {
      const sourceId = 'rotas-source';
      const source = map.getSource(sourceId);

      if (source) {
        source.setData(rotasGeoJSON());
      }
    } catch (error) {
      console.error('[RoutesMapLayer] Erro ao atualizar dados:', error);
    }
  }, [map, rotasGeoJSON]);

  return null; // Componente apenas gerencia camadas, não renderiza nada
};

export default RoutesMapLayer;
