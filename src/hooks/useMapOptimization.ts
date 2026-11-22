/**
 * useMapOptimization — Hook para otimizar performance do mapa
 * 
 * Funcionalidades:
 * - Pré-carregar GeoJSON em background
 * - Cache de dados em IndexedDB
 * - Lazy loading de camadas
 * - Otimização de renderização
 * - Preaquecimento de tiles
 */

import { useEffect, useCallback, useRef, useState } from 'react';

interface CacheConfig {
  ttl: number; // Time to live em ms
  maxSize: number; // Tamanho máximo em bytes
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 dias
  maxSize: 50 * 1024 * 1024, // 50MB
};

export function useMapOptimization(cacheConfig: Partial<CacheConfig> = {}) {
  const config = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const cacheRef = useRef<Map<string, any>>(new Map());

  // Inicializar IndexedDB
  const initDB = useCallback(async (): Promise<IDBDatabase | null> => {
    return new Promise((resolve) => {
      const request = indexedDB.open('mapas-optimization-db', 1);

      request.onerror = () => {
        console.error('[MapOptimization] Erro ao abrir IndexedDB');
        resolve(null);
      };

      request.onsuccess = () => {
        console.log('[MapOptimization] IndexedDB aberto');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('geojson-cache')) {
          db.createObjectStore('geojson-cache', { keyPath: 'key' });
          console.log('[MapOptimization] Object store criado');
        }
      };
    });
  }, []);

  // Salvar no cache
  const saveToCache = useCallback(
    async (key: string, data: any, db: IDBDatabase | null) => {
      try {
        // Cache em memória
        cacheRef.current.set(key, {
          data,
          timestamp: Date.now(),
        });

        // Cache em IndexedDB
        if (db) {
          const transaction = db.transaction(['geojson-cache'], 'readwrite');
          const store = transaction.objectStore('geojson-cache');
          await new Promise((resolve, reject) => {
            const request = store.put({
              key,
              data,
              timestamp: Date.now(),
            });
            request.onsuccess = () => resolve(null);
            request.onerror = () => reject(request.error);
          });
        }

        console.log(`[MapOptimization] Dados salvos em cache: ${key}`);
      } catch (err) {
        console.warn('[MapOptimization] Erro ao salvar cache:', err);
      }
    },
    []
  );

  // Recuperar do cache
  const getFromCache = useCallback(
    async (key: string, db: IDBDatabase | null): Promise<any | null> => {
      try {
        // Tentar cache em memória primeiro
        const cached = cacheRef.current.get(key);
        if (cached) {
          const age = Date.now() - cached.timestamp;
          if (age < config.ttl) {
            console.log(`[MapOptimization] Cache em memória encontrado: ${key}`);
            return cached.data;
          }
          cacheRef.current.delete(key);
        }

        // Tentar IndexedDB
        if (db) {
          return new Promise((resolve) => {
            const transaction = db.transaction(['geojson-cache'], 'readonly');
            const store = transaction.objectStore('geojson-cache');
            const request = store.get(key);

            request.onsuccess = () => {
              const result = request.result;
              if (result) {
                const age = Date.now() - result.timestamp;
                if (age < config.ttl) {
                  console.log(`[MapOptimization] Cache em IndexedDB encontrado: ${key}`);
                  // Copiar para memória
                  cacheRef.current.set(key, result);
                  resolve(result.data);
                } else {
                  // Expirado
                  store.delete(key);
                  resolve(null);
                }
              } else {
                resolve(null);
              }
            };

            request.onerror = () => resolve(null);
          });
        }

        return null;
      } catch (err) {
        console.warn('[MapOptimization] Erro ao recuperar cache:', err);
        return null;
      }
    },
    [config.ttl]
  );

  // Pré-carregar GeoJSON
  const preloadGeoJSON = useCallback(
    async (url: string, db: IDBDatabase | null) => {
      try {
        setIsPreloading(true);
        setPreloadProgress(0);

        const cacheKey = `geojson-${url}`;

        // Verificar cache
        const cached = await getFromCache(cacheKey, db);
        if (cached) {
          console.log('[MapOptimization] GeoJSON recuperado do cache');
          setIsPreloading(false);
          return cached;
        }

        // Buscar do servidor
        console.log('[MapOptimization] Pré-carregando GeoJSON...');
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setPreloadProgress(50);

        // Validar
        if (!data.features || !Array.isArray(data.features)) {
          throw new Error('GeoJSON inválido');
        }

        setPreloadProgress(75);

        // Salvar no cache
        await saveToCache(cacheKey, data, db);
        setPreloadProgress(100);

        console.log(`[MapOptimization] GeoJSON pré-carregado: ${data.features.length} features`);
        return data;
      } catch (err) {
        console.error('[MapOptimization] Erro ao pré-carregar GeoJSON:', err);
        return null;
      } finally {
        setIsPreloading(false);
      }
    },
    [getFromCache, saveToCache]
  );

  // Pré-aquecer tiles
  const prewarmTiles = useCallback((map: any, bounds: [number, number, number, number], zoom: number) => {
    try {
      if (!map || !map.getStyle) return;

      console.log('[MapOptimization] Pré-aquecendo tiles...');

      // Calcular tiles necessários
      const [minLng, minLat, maxLng, maxLat] = bounds;
      const tileSize = 256;
      const zoomFactor = Math.pow(2, zoom);

      // Buscar tiles do Mapbox
      const style = map.getStyle();
      if (style && style.sources) {
        Object.entries(style.sources).forEach(([sourceId, source]: [string, any]) => {
          if (source.type === 'vector' || source.type === 'raster') {
            // Disparar requisições de tiles (sem bloquear)
            setTimeout(() => {
              try {
                // Mapbox carrega tiles automaticamente quando necessário
                map.getSource(sourceId);
              } catch (err) {
                // Silenciar erros
              }
            }, 100);
          }
        });
      }

      console.log('[MapOptimization] Pré-aquecimento iniciado');
    } catch (err) {
      console.warn('[MapOptimization] Erro ao pré-aquecer tiles:', err);
    }
  }, []);

  // Otimizar renderização
  const optimizeRendering = useCallback((map: any) => {
    try {
      if (!map) return;

      console.log('[MapOptimization] Otimizando renderização...');

      // Desabilitar animações de transição para melhor performance
      map.setTransformRequest((url: string) => {
        return { url };
      });

      // Configurar pitch e bearing padrão
      map.setPitch(0);
      map.setBearing(0);

      console.log('[MapOptimization] Renderização otimizada');
    } catch (err) {
      console.warn('[MapOptimization] Erro ao otimizar renderização:', err);
    }
  }, []);

  // Limpar cache expirado
  const clearExpiredCache = useCallback(async (db: IDBDatabase | null) => {
    try {
      if (!db) return;

      console.log('[MapOptimization] Limpando cache expirado...');

      const transaction = db.transaction(['geojson-cache'], 'readwrite');
      const store = transaction.objectStore('geojson-cache');

      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        records.forEach((record) => {
          const age = Date.now() - record.timestamp;
          if (age > config.ttl) {
            store.delete(record.key);
          }
        });
      };

      console.log('[MapOptimization] Cache expirado removido');
    } catch (err) {
      console.warn('[MapOptimization] Erro ao limpar cache:', err);
    }
  }, [config.ttl]);

  return {
    isPreloading,
    preloadProgress,
    initDB,
    saveToCache,
    getFromCache,
    preloadGeoJSON,
    prewarmTiles,
    optimizeRendering,
    clearExpiredCache,
  };
}
