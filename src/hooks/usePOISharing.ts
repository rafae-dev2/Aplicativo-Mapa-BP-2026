/**
 * usePOISharing — Hook para gerenciar compartilhamento de POIs entre dispositivos
 * 
 * Funcionalidades:
 * - Codificar/decodificar POIs para URL
 * - Sincronizar POIs via URL parameters
 * - Detectar POIs compartilhados na URL
 * - Suporte offline com localStorage
 */

import { useEffect, useCallback } from 'react';
import { POI } from '@/components/POIManager';

interface POISharingOptions {
  onPOIsReceived?: (pois: POI[]) => void;
  onLocateCoordinates?: (lat: number, lng: number) => void;
}

export function usePOISharing(options: POISharingOptions = {}) {
  const { onPOIsReceived, onLocateCoordinates } = options;

  // Codificar POIs para URL
  const encodePOIs = useCallback((pois: POI[]): string => {
    try {
      const poisData = pois.map(poi => ({
        lat: poi.lat,
        lng: poi.lng,
        title: poi.title,
        category: poi.category,
        description: poi.description,
        type: poi.type,
        message: poi.message,
        fundo: poi.fundo,
        talhao: poi.talhao,
        transportMaterial: poi.transportMaterial,
        transportFormula: poi.transportFormula,
        transportQuantity: poi.transportQuantity,
        transportUnit: poi.transportUnit,
        transportTrips: poi.transportTrips,
      }));
      return btoa(JSON.stringify(poisData));
    } catch (err) {
      console.error('Erro ao codificar POIs:', err);
      return '';
    }
  }, []);

  // Decodificar POIs da URL
  const decodePOIs = useCallback((encoded: string): POI[] => {
    try {
      const decoded = JSON.parse(atob(encoded));
      if (!Array.isArray(decoded)) return [];
      
      return decoded.map((poi: any, idx: number) => ({
        id: `poi-shared-${Date.now()}-${idx}`,
        lat: Number(poi.lat),
        lng: Number(poi.lng),
        title: String(poi.title || 'POI Compartilhado'),
        description: String(poi.description || ''),
        category: String(poi.category || 'marcacao'),
        type: poi.type || 'default',
        message: poi.message,
        fundo: poi.fundo,
        talhao: poi.talhao,
        transportMaterial: poi.transportMaterial,
        transportFormula: typeof poi.transportFormula === 'string' ? poi.transportFormula : undefined,
        transportQuantity: poi.transportQuantity == null ? undefined : Number(poi.transportQuantity),
        transportUnit: poi.transportUnit || (poi.transportMaterial === 'reativo_bigbag' ? 'bigbags' : poi.transportMaterial ? 'toneladas' : undefined),
        transportTrips: Array.isArray(poi.transportTrips) ? poi.transportTrips : undefined,
        createdAt: Date.now(),
      }));
    } catch (err) {
      console.error('Erro ao decodificar POIs:', err);
      return [];
    }
  }, []);

  // Gerar URL com POIs
  const generateShareURL = useCallback((pois: POI[]): string => {
    const encoded = encodePOIs(pois);
    if (!encoded) return window.location.origin;
    return `${window.location.origin}/?pois=${encoded}`;
  }, [encodePOIs]);

  // Detectar e processar POIs na URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const poisParam = params.get('pois');

    if (poisParam) {
      try {
        const pois = decodePOIs(poisParam);
        
        if (pois.length > 0) {
          console.log(`[POI Sharing] ${pois.length} POI(s) detectado(s) na URL`);
          
          // Salvar no localStorage para sincronização offline
          try {
            const existingPOIs = localStorage.getItem('mapas-pois-shared');
            const shared = existingPOIs ? JSON.parse(existingPOIs) : [];
            const merged = [...shared, ...pois];
            localStorage.setItem('mapas-pois-shared', JSON.stringify(merged));
          } catch (err) {
            console.warn('Erro ao salvar POIs compartilhados:', err);
          }

          // Chamar callback
          onPOIsReceived?.(pois);

          // Navegar para o primeiro POI
          if (pois[0]?.lat !== undefined && pois[0]?.lng !== undefined) {
            onLocateCoordinates?.(pois[0].lat, pois[0].lng);
          }

          // Limpar URL (remover parâmetro pois)
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('pois');
          window.history.replaceState({}, '', newUrl.toString());
        }
      } catch (err) {
        console.error('Erro ao processar POIs compartilhados:', err);
      }
    }
  }, [decodePOIs, onPOIsReceived, onLocateCoordinates]);

  // Compartilhar POIs via URL
  const sharePOIs = useCallback((pois: POI[]): string => {
    const shareURL = generateShareURL(pois);
    
    // Copiar para clipboard
    navigator.clipboard.writeText(shareURL).catch(err => {
      console.warn('Erro ao copiar URL:', err);
    });

    // Usar Web Share API se disponível
    if (navigator.share) {
      navigator.share({
        title: 'MAPAS BRANCO PERES',
        text: `Compartilhando ${pois.length} POI(s)`,
        url: shareURL,
      }).catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Erro ao compartilhar:', err);
        }
      });
    }

    return shareURL;
  }, [generateShareURL]);

  // Sincronizar POIs offline
  const syncOfflinePOIs = useCallback((): POI[] => {
    try {
      const shared = localStorage.getItem('mapas-pois-shared');
      return shared ? JSON.parse(shared) : [];
    } catch (err) {
      console.warn('Erro ao sincronizar POIs offline:', err);
      return [];
    }
  }, []);

  // Limpar POIs compartilhados
  const clearSharedPOIs = useCallback((): void => {
    try {
      localStorage.removeItem('mapas-pois-shared');
    } catch (err) {
      console.warn('Erro ao limpar POIs compartilhados:', err);
    }
  }, []);

  return {
    encodePOIs,
    decodePOIs,
    generateShareURL,
    sharePOIs,
    syncOfflinePOIs,
    clearSharedPOIs,
  };
}
