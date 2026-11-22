/**
 * useRouteManager — Hook para gerenciar rotas de carreadores
 * 
 * Funcionalidades:
 * - Extrair rotas do GeoJSON
 * - Gerenciar estado das rotas
 * - Calcular distâncias e tempos
 * - Integração com Waze e Google Maps
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Route } from '@/components/RouteSystem';

interface RouteManagerOptions {
  geojsonData?: any;
  autoExtract?: boolean;
}

export function useRouteManager(options: RouteManagerOptions = {}) {
  const { geojsonData, autoExtract = true } = options;
  const [rotas, setRotas] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Extrair rotas do GeoJSON
  const extractRotasFromGeoJSON = useCallback((geojson: any) => {
    try {
      setIsLoading(true);
      const rotasExtraidas: Route[] = [];
      let rotaId = 0;

      if (!geojson || !geojson.features) {
        return [];
      }

      geojson.features.forEach((feature: any, index: number) => {
        const geom = feature.geometry;
        const props = feature.properties || {};

        // Verificar se é uma possível rota (MultiPolygon com poucos pontos)
        if (geom.type === 'MultiPolygon') {
          const totalPontos = geom.coordinates.reduce(
            (sum: number, poly: any[]) => sum + (poly[0]?.length || 0),
            0
          );

          // Se tem entre 5 e 50 pontos, provavelmente é uma rota
          if (totalPontos > 5 && totalPontos < 50) {
            // Extrair coordenadas
            const coordenadas: [number, number][] = [];
            geom.coordinates.forEach((poly: any[]) => {
              if (poly[0]) {
                poly[0].forEach((coord: any[]) => {
                  if (Array.isArray(coord) && coord.length >= 2) {
                    coordenadas.push([coord[0], coord[1]]);
                  }
                });
              }
            });

            if (coordenadas.length > 0) {
              rotasExtraidas.push({
                id: `rota-${rotaId++}`,
                fazenda: props.FAZENDA || 0,
                zona: props.ZONA,
                nome: `Rota ${props.FAZENDA || 'Desconhecida'}`,
                coordenadas,
                tipo: 'carreador',
                ativo: true,
              });
            }
          }
        }
      });

      setIsLoading(false);
      return rotasExtraidas;
    } catch (error) {
      console.error('[RouteManager] Erro ao extrair rotas:', error);
      setIsLoading(false);
      return [];
    }
  }, []);

  // Auto-extrair rotas quando GeoJSON mudar
  useEffect(() => {
    if (autoExtract && geojsonData) {
      const rotasExtraidas = extractRotasFromGeoJSON(geojsonData);
      setRotas(rotasExtraidas);
    }
  }, [geojsonData, autoExtract, extractRotasFromGeoJSON]);

  // Calcular distância entre dois pontos (Haversine)
  const calcularDistancia = useCallback(
    (coords: [number, number][]): number => {
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
    },
    []
  );

  // Estimar tempo de viagem (baseado em velocidade média)
  const estimarTempo = useCallback((distancia: number, velocidadeMedia: number = 40): number => {
    // Velocidade em km/h, retorna tempo em minutos
    return Math.round((distancia / velocidadeMedia) * 60);
  }, []);

  // Gerar URL do Waze
  const gerarWazeUrl = useCallback((rota: Route): string => {
    if (rota.coordenadas.length === 0) return '';

    const [lng, lat] = rota.coordenadas[rota.coordenadas.length - 1];
    return `https://waze.com/ul?navigate=yes&ll=${lat},${lng}`;
  }, []);

  // Gerar URL do Google Maps
  const gerarGoogleMapsUrl = useCallback((rota: Route): string => {
    if (rota.coordenadas.length === 0) return '';

    const [lng, lat] = rota.coordenadas[rota.coordenadas.length - 1];
    return `https://www.google.com/maps/search/${lat},${lng}`;
  }, []);

  // Gerar URL de compartilhamento
  const gerarUrlCompartilhamento = useCallback((rota: Route): string => {
    const rotaData = encodeURIComponent(
      JSON.stringify({
        fazenda: rota.fazenda,
        nome: rota.nome,
        tipo: rota.tipo,
        coordenadas: rota.coordenadas,
      })
    );

    return `${window.location.origin}?rota=${rotaData}`;
  }, []);

  // Adicionar rota manualmente
  const adicionarRota = useCallback((rota: Route) => {
    setRotas((prev) => [...prev, rota]);
  }, []);

  // Remover rota
  const removerRota = useCallback((rotaId: string) => {
    setRotas((prev) => prev.filter((r) => r.id !== rotaId));
  }, []);

  // Atualizar rota
  const atualizarRota = useCallback((rotaId: string, updates: Partial<Route>) => {
    setRotas((prev) =>
      prev.map((r) => (r.id === rotaId ? { ...r, ...updates } : r))
    );
  }, []);

  // Filtrar rotas por fazenda
  const rotasPorFazenda = useCallback(
    (fazenda: number): Route[] => {
      return rotas.filter((r) => r.fazenda === fazenda);
    },
    [rotas]
  );

  // Filtrar rotas por tipo
  const rotasPorTipo = useCallback(
    (tipo: Route['tipo']): Route[] => {
      return rotas.filter((r) => r.tipo === tipo);
    },
    [rotas]
  );

  // Obter estatísticas
  const estatisticas = useMemo(() => {
    return {
      total: rotas.length,
      ativas: rotas.filter((r) => r.ativo).length,
      inativas: rotas.filter((r) => !r.ativo).length,
      distanciaTotal: rotas.reduce((sum, r) => sum + calcularDistancia(r.coordenadas), 0),
      tempoTotal: rotas.reduce(
        (sum, r) => sum + estimarTempo(calcularDistancia(r.coordenadas)),
        0
      ),
      porTipo: {
        carreador: rotas.filter((r) => r.tipo === 'carreador').length,
        entrega: rotas.filter((r) => r.tipo === 'entrega').length,
        coleta: rotas.filter((r) => r.tipo === 'coleta').length,
      },
    };
  }, [rotas, calcularDistancia, estimarTempo]);

  return {
    rotas,
    isLoading,
    extractRotasFromGeoJSON,
    calcularDistancia,
    estimarTempo,
    gerarWazeUrl,
    gerarGoogleMapsUrl,
    gerarUrlCompartilhamento,
    adicionarRota,
    removerRota,
    atualizarRota,
    rotasPorFazenda,
    rotasPorTipo,
    estatisticas,
  };
}
