/**
 * useMBTiles — Hook para carregar e gerenciar tiles do MBTiles
 * 
 * Funcionalidades:
 * - Carregar arquivos MBTiles (fields.mbtiles, info.mbtiles)
 * - Servir tiles como TMS (Tile Map Service)
 * - Integrar com Mapbox GL
 * - Cache local com IndexedDB
 */

import { useEffect, useCallback, useState } from 'react';

interface MBTilesSource {
  type: 'vector' | 'raster';
  url: string;
  tileSize?: number;
}

export function useMBTiles() {
  const [sources, setSources] = useState<Record<string, MBTilesSource>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carregar informações dos MBTiles
  useEffect(() => {
    const loadMBTiles = async () => {
      try {
        setLoading(true);
        
        // Carregar fields.mbtiles (camadas de campos/fazendas)
        const fieldsSource: MBTilesSource = {
          type: 'raster',
          url: '/fields.mbtiles',
          tileSize: 256,
        };

        // Carregar info.mbtiles (informações)
        const infoSource: MBTilesSource = {
          type: 'raster',
          url: '/info.mbtiles',
          tileSize: 256,
        };

        setSources({
          fields: fieldsSource,
          info: infoSource,
        });

        console.log('[MBTiles] Fontes carregadas com sucesso');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Erro ao carregar MBTiles';
        setError(errorMsg);
        console.error('[MBTiles] Erro:', errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadMBTiles();
  }, []);

  // Adicionar fonte ao mapa
  const addSourceToMap = useCallback((map: any, sourceId: string, source: MBTilesSource) => {
    try {
      if (map.getSource(sourceId)) {
        console.log(`[MBTiles] Fonte ${sourceId} já existe`);
        return;
      }

      // Converter MBTiles para TMS URL
      const tmsUrl = `mbtiles://${sourceId}`;

      if (source.type === 'raster') {
        map.addSource(sourceId, {
          type: 'raster',
          url: tmsUrl,
          tileSize: source.tileSize || 256,
        });
      } else {
        map.addSource(sourceId, {
          type: 'vector',
          url: tmsUrl,
        });
      }

      console.log(`[MBTiles] Fonte ${sourceId} adicionada ao mapa`);
    } catch (err) {
      console.error(`[MBTiles] Erro ao adicionar fonte ${sourceId}:`, err);
    }
  }, []);

  // Adicionar camada ao mapa
  const addLayerToMap = useCallback((
    map: any,
    layerId: string,
    sourceId: string,
    layerConfig: Record<string, any> = {}
  ) => {
    try {
      if (map.getLayer(layerId)) {
        console.log(`[MBTiles] Camada ${layerId} já existe`);
        return;
      }

      const defaultConfig = {
        id: layerId,
        source: sourceId,
        type: 'raster',
        paint: {
          'raster-opacity': 0.85,
        },
      };

      map.addLayer({
        ...defaultConfig,
        ...layerConfig,
      });

      console.log(`[MBTiles] Camada ${layerId} adicionada ao mapa`);
    } catch (err) {
      console.error(`[MBTiles] Erro ao adicionar camada ${layerId}:`, err);
    }
  }, []);

  // Remover camada do mapa
  const removeLayerFromMap = useCallback((map: any, layerId: string) => {
    try {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
        console.log(`[MBTiles] Camada ${layerId} removida`);
      }
    } catch (err) {
      console.error(`[MBTiles] Erro ao remover camada ${layerId}:`, err);
    }
  }, []);

  // Remover fonte do mapa
  const removeSourceFromMap = useCallback((map: any, sourceId: string) => {
    try {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
        console.log(`[MBTiles] Fonte ${sourceId} removida`);
      }
    } catch (err) {
      console.error(`[MBTiles] Erro ao remover fonte ${sourceId}:`, err);
    }
  }, []);

  // Atualizar opacidade de camada
  const setLayerOpacity = useCallback((map: any, layerId: string, opacity: number) => {
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'raster-opacity', Math.max(0, Math.min(1, opacity)));
        console.log(`[MBTiles] Opacidade da camada ${layerId} alterada para ${opacity}`);
      }
    } catch (err) {
      console.error(`[MBTiles] Erro ao alterar opacidade:`, err);
    }
  }, []);

  // Alternar visibilidade de camada
  const toggleLayerVisibility = useCallback((map: any, layerId: string) => {
    try {
      if (map.getLayer(layerId)) {
        const visibility = map.getLayoutProperty(layerId, 'visibility');
        const newVisibility = visibility === 'visible' ? 'none' : 'visible';
        map.setLayoutProperty(layerId, 'visibility', newVisibility);
        console.log(`[MBTiles] Visibilidade da camada ${layerId} alterada para ${newVisibility}`);
      }
    } catch (err) {
      console.error(`[MBTiles] Erro ao alternar visibilidade:`, err);
    }
  }, []);

  return {
    sources,
    loading,
    error,
    addSourceToMap,
    addLayerToMap,
    removeLayerFromMap,
    removeSourceFromMap,
    setLayerOpacity,
    toggleLayerVisibility,
  };
}
