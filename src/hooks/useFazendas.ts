import { useState, useEffect } from 'react';

export interface Fazenda {
  FAZENDA: number;
  ZONA: number;
  TALHAO: number;
  geometry?: {
    type: string;
    coordinates: number[][][];
  };
}

export interface SearchResult {
  fazenda: Fazenda;
  label: string;
  type: 'fundo' | 'talhao' | 'combined';
}

export function useFazendas() {
  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFazendas = async () => {
      try {
        const response = await fetch('/branco-peres.geojson');
        const data = await response.json();
        
        if (data.features) {
          const features = data.features.map((feature: any) => ({
            ...feature.properties,
            geometry: feature.geometry,
          }));
          setFazendas(features);
        }
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar fazendas');
        setLoading(false);
      }
    };

    loadFazendas();
  }, []);

  const searchFazendas = (query: string): SearchResult[] => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    fazendas.forEach((fazenda) => {
      // Buscar por número do fundo
      if (fazenda.FAZENDA.toString().includes(lowerQuery)) {
        results.push({
          fazenda,
          label: `Fundo ${fazenda.FAZENDA}`,
          type: 'fundo',
        });
      }

      // Buscar por talhão
      if (fazenda.TALHAO.toString().includes(lowerQuery)) {
        results.push({
          fazenda,
          label: `Talhão ${fazenda.TALHAO}`,
          type: 'talhao',
        });
      }

      // Buscar por "Fundo X Talhão Y"
      const combinedLabel = `Fundo ${fazenda.FAZENDA} Talhão ${fazenda.TALHAO}`;
      if (combinedLabel.toLowerCase().includes(lowerQuery)) {
        results.push({
          fazenda,
          label: combinedLabel,
          type: 'combined',
        });
      }
    });

    // Remover duplicatas
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r.label, r])).values()
    );

    return uniqueResults.slice(0, 10); // Limitar a 10 resultados
  };

  const getFazendaCenter = (fazenda: Fazenda): [number, number] | null => {
    if (!fazenda.geometry || fazenda.geometry.type !== 'MultiPolygon') {
      return null;
    }

    const coords = fazenda.geometry.coordinates;
    if (!coords || coords.length === 0) return null;

    // Calcular centróide aproximado
    let totalLng = 0;
    let totalLat = 0;
    let count = 0;

    coords.forEach((polygon: any) => {
      polygon.forEach((ring: any) => {
        ring.forEach((coord: any) => {
          totalLng += coord[0];
          totalLat += coord[1];
          count++;
        });
      });
    });

    if (count === 0) return null;

    return [totalLng / count, totalLat / count] as [number, number]
  };

  return {
    fazendas,
    loading,
    error,
    searchFazendas,
    getFazendaCenter,
  };
}
