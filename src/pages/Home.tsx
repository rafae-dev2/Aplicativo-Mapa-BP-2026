import { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Minimize2 } from 'lucide-react';
import { COLORS, PERFORMANCE, MAP_CONFIG } from '@/config/constants';
import Header from '@/components/Header';
import SearchDrawerLeft from '@/components/SearchDrawerLeft';
import MapContainer from '@/components/MapContainer';
import InstallPrompt from '@/components/InstallPrompt';
import POIManager, { POIManagerProvider } from '@/components/POIManager';
import { useFetchWithRetry } from '@/hooks/useFetchWithRetry';
import { validateGeoJSON, hasFeatures, type Fazenda, type GeoJSONData } from '@/lib/geojson-validator';
import { decodeUtf8Base64 } from '@/lib/base64';
import StartupOverlay from '@/components/StartupOverlay';
import { mapPerformanceMonitor } from '@/lib/mapPerformanceMonitor';
import { hotTalhoesCache } from '@/lib/hotTalhoesCache';
import { registerBenchmarkMapInstance } from '@/lib/talhoesStressSimulator';

const MenuLateral = lazy(() => import('@/components/MenuLateral'));

interface SearchResult {
  fundo: number;
  talhao: number;
  nome?: string;
}

export default function Home() {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedFundo, setSelectedFundo] = useState<number | undefined>();
  const [selectedTalhao, setSelectedTalhao] = useState<number | undefined>();
  const [selectionFocusVersion, setSelectionFocusVersion] = useState(0);
  const [selectionFocusZoom, setSelectionFocusZoom] = useState<number | undefined>();
  const [mapInstance, setMapInstance] = useState<any | null>(null);
  const initialSelectionHandledRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Modo imersivo: 1 botão esconde TUDO (cabeçalho + ícones/menus), deixando só
  // o mapa. Um botão pequeno restaura. A preferência fica salva no aparelho.
  const [immersive, setImmersive] = useState<boolean>(() => {
    try { return localStorage.getItem('mapas-bp-immersive') === '1'; } catch { return false; }
  });
  const toggleImmersive = useCallback(() => {
    setImmersive((v) => {
      const next = !v;
      try { localStorage.setItem('mapas-bp-immersive', next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);


  // Cache persistente (IndexedDB) dos polígonos dos talhões mais acessados
  // para renderização quase instantânea ao abrir o app ou voltar de rede instável.
  const [hotTalhoesGeoJSON, setHotTalhoesGeoJSON] = useState<GeoJSONData | null>(null);

  useEffect(() => {
    let active = true;
    void hotTalhoesCache.loadFeatureCollection().then((fc) => {
      if (active && fc && fc.features.length > 0) {
        setHotTalhoesGeoJSON(fc);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Fetch GeoJSON com hidratação imediata do IndexedDB + revalidação em segundo plano
  const { data: rawGeoJSON, loading, error, source: geoSource, retry } = useFetchWithRetry<unknown>(
    '/branco-peres.mapdata?v=186',
    { retries: 1, retryDelay: 800, timeout: 12000, offlineKey: 'branco-peres-mapdata' }
  );

  // Validar e processar GeoJSON completo
  const fullGeoJSONData = useMemo<GeoJSONData | null>(() => {
    if (!rawGeoJSON) return null;
    const validated = validateGeoJSON(rawGeoJSON);
    if (!validated) {
      console.error('GeoJSON inválido');
      return null;
    }
    if (!hasFeatures(validated)) {
      console.error('GeoJSON não contém features');
      return null;
    }
    return validated;
  }, [rawGeoJSON]);

  // Enquanto o pacote completo ainda está carregando em rede instável, exibe
  // imediatamente os polígonos dos talhões mais acessados salvos no IndexedDB.
  const geoJSONData = fullGeoJSONData ?? hotTalhoesGeoJSON;

  // Pré-aquece o cache persistente de talhões prioritários na primeira carga completa
  useEffect(() => {
    if (!fullGeoJSONData?.features?.length) return;
    void hotTalhoesCache.seedIfEmpty(fullGeoJSONData.features, 24);
  }, [fullGeoJSONData]);

  // Extrair fazendas do GeoJSON
  const fazendas = useMemo<Fazenda[]>(() => {
    if (!geoJSONData) return [];
    return geoJSONData.features.map(f => f.properties);
  }, [geoJSONData]);

  // Monitor de performance: mede carregamento + validação dos polígonos das fazendas
  const geoPerfMeasuredRef = useRef(false);
  useEffect(() => {
    mapPerformanceMonitor.startPhase('farm-geojson-load');
  }, []);

  useEffect(() => {
    if (!geoJSONData || geoPerfMeasuredRef.current) return;
    geoPerfMeasuredRef.current = true;
    mapPerformanceMonitor.endPhase('farm-geojson-load', {
      featureCount: geoJSONData.features.length,
      source: fullGeoJSONData ? geoSource : 'hot-talhoes-idb',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    });
  }, [geoJSONData, fullGeoJSONData, geoSource]);




  // Abrir a pesquisa entrega o controle ao usuário: o carregamento inicial
  // não pode terminar depois e disparar um voo padrão durante a digitação.
  useEffect(() => {
    const takeControl = () => { initialSelectionHandledRef.current = true; };
    window.addEventListener('bp-open-farm-search', takeControl);
    return () => window.removeEventListener('bp-open-farm-search', takeControl);
  }, []);

  // Carregar fazenda via URL parameters ou inicializar com fundo 25 talhao 1
  useEffect(() => {
    if (!mapInstance || !geoJSONData || initialSelectionHandledRef.current) return;
    initialSelectionHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const fundoParam = params.get('fundo');
    const talhaoParam = params.get('talhao');
    const poisParam = params.get('pois');
    const poiDataParam = params.get('poiData');

    // Se ha fundo e talhao, selecionar a area (mesmo se houver POIs)
    if (fundoParam && talhaoParam) {
      const fundo = parseInt(fundoParam, 10);
      const talhao = parseInt(talhaoParam, 10);
      if (!isNaN(fundo) && !isNaN(talhao)) {
        handleSelectResult(fundo, talhao, undefined, false);
      }
    } else {
      // Inicializar com fundo 25 talhao 1 (respeitando o zoom de abertura salvo, se houver)
      let openZoom: number | undefined;
      try {
        const v = parseFloat(localStorage.getItem('mapas-bp-default-zoom') || '');
        if (Number.isFinite(v)) openZoom = v;
      } catch { /* noop */ }
      handleSelectResult(25, 1, openZoom, false);
    }

    // Uma marcação individual tem prioridade: centralizar exatamente na coordenada
    // serializada, mesmo antes de o Supabase terminar de carregar.
    if (poiDataParam) {
      try {
        const decodedPoi = JSON.parse(decodeUtf8Base64(poiDataParam));
        const sharedPoi = Array.isArray(decodedPoi) ? decodedPoi[0] : decodedPoi;
        if (sharedPoi && Number.isFinite(Number(sharedPoi.lat)) && Number.isFinite(Number(sharedPoi.lng))) {
          handleLocateCoordinates(Number(sharedPoi.lat), Number(sharedPoi.lng));
        }
      } catch (error) {
        console.error('Erro ao decodificar a marcação individual compartilhada:', error);
      }
    }

    // Se há vários POIs compartilhados, centralizar no primeiro
    if (!poiDataParam && poisParam) {
      try {
        const decodedPois = JSON.parse(decodeUtf8Base64(poisParam));
        console.log('POIs decodificados:', decodedPois);
        
        // Se ha POIs, redirecionar para o primeiro POI
        if (Array.isArray(decodedPois) && decodedPois.length > 0) {
          const firstPoi = decodedPois[0];
          if (firstPoi.lat !== undefined && firstPoi.lng !== undefined) {
            // Redirecionar para as coordenadas do POI (mas mantém a area selecionada)
            handleLocateCoordinates(firstPoi.lat, firstPoi.lng);
            console.log('Redirecionando para POI:', firstPoi);
          }
        }
      } catch (error) {
        console.error('Erro ao decodificar POIs:', error);
      }
    }
  }, [mapInstance, geoJSONData]);

  const handleSearch = (query: string) => {
    initialSelectionHandledRef.current = true;
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length < 1) {
      setSearchResults([]);
      return;
    }

    const numericQuery = /^\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null;
    
    // Sistema de scoring para priorização de resultados
    interface ScoredResult {
      fazenda: Fazenda;
      score: number;
      type: 'exact_fundo' | 'exact_talhao' | 'starts_fundo' | 'starts_talhao' | 'contains_fundo' | 'contains_talhao';
    }
    
    const scoredResults: ScoredResult[] = [];
    
    fazendas.forEach((f) => {
      const fundo = f.FAZENDA.toString();
      const talhao = f.TALHAO.toString();
      // Também comparar com zero-padding para fundos 01-09
      const fundoPadded = f.FAZENDA < 10 ? '0' + fundo : fundo;
      const talhaoPadded = f.TALHAO < 10 ? '0' + talhao : talhao;
      
      // Prioridade 1: Fundo corresponde exatamente (com ou sem zero-padding)
      if ((numericQuery !== null && f.FAZENDA === numericQuery) || fundo === normalizedQuery || fundoPadded === normalizedQuery) {
        scoredResults.push({ fazenda: f, score: 1000, type: 'exact_fundo' });
      }
      // Prioridade 2: Fundo começa com a query
      else if (fundo.startsWith(normalizedQuery) || fundoPadded.startsWith(normalizedQuery)) {
        scoredResults.push({ fazenda: f, score: 950, type: 'starts_fundo' });
      }
      // Prioridade 3: Talhão corresponde exatamente (com ou sem zero-padding)
      else if (talhao === normalizedQuery || talhaoPadded === normalizedQuery) {
        scoredResults.push({ fazenda: f, score: 900, type: 'exact_talhao' });
      }
      // Prioridade 4: Talhão começa com a query
      else if (talhao.startsWith(normalizedQuery) || talhaoPadded.startsWith(normalizedQuery)) {
        scoredResults.push({ fazenda: f, score: 850, type: 'starts_talhao' });
      }
      // Prioridade 5: Fundo contém a query
      else if (fundo.includes(normalizedQuery) || fundoPadded.includes(normalizedQuery)) {
        scoredResults.push({ fazenda: f, score: 700, type: 'contains_fundo' });
      }
      // Prioridade 6: Talhão contém a query
      else if (talhao.includes(normalizedQuery) || talhaoPadded.includes(normalizedQuery)) {
        scoredResults.push({ fazenda: f, score: 600, type: 'contains_talhao' });
      }
    });
    
    // Ordenar por score (decrescente) e depois por fundo/talhão (crescente)
    scoredResults.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.fazenda.FAZENDA !== b.fazenda.FAZENDA) {
        return a.fazenda.FAZENDA - b.fazenda.FAZENDA;
      }
      return a.fazenda.TALHAO - b.fazenda.TALHAO;
    });
    
    // Consulta numérica exata de fundo: incluir todos os talhões desse fundo.
    // Buscas parciais e por talhão continuam limitadas para manter a lista útil.
    const exactFundResults = numericQuery !== null
      ? scoredResults.filter((result) => result.type === 'exact_fundo')
      : [];
    const visibleResults = exactFundResults.length > 0
      ? exactFundResults
      : scoredResults.slice(0, 20);

    setSearchResults(
      visibleResults.map((r) => ({
        fundo: r.fazenda.FAZENDA,
        talhao: r.fazenda.TALHAO,
      }))
    );

    // Pesquisar apenas filtra a lista. O voo acontece em handleSelectResult,
    // depois de selecionar explicitamente um resultado com fundo e talhão.

  };

  const updateSelectionUrl = (fundo: number, talhao: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('fundo', String(fundo));
    url.searchParams.set('talhao', String(talhao));
    // Uma nova escolha explícita substitui o destino de um link de marcação.
    // Outros parâmetros de configuração/diagnóstico permanecem na URL.
    for (const key of ['poi', 'poiId', 'poiData', 'pois']) url.searchParams.delete(key);
    window.history.replaceState({}, '', url.toString());
  };

  const handleSelectResult = (fundo: number, talhao: number, zoomOverride?: number, updateUrl = true) => {
    if (!geoJSONData) {
      console.error('GeoJSON das fazendas ainda não carregado');
      return;
    }

    // Encontrar a feature no GeoJSON
    const feature = geoJSONData.features.find(
      (f) => f.properties.FAZENDA === fundo && f.properties.TALHAO === talhao
    );

    if (!feature) {
      console.error('Feature não encontrada para fundo:', fundo, 'talhao:', talhao);
      return;
    }

    initialSelectionHandledRef.current = true;
    if (updateUrl) updateSelectionUrl(fundo, talhao);
    setSelectedFundo(fundo);
    setSelectedTalhao(talhao);
    setSelectionFocusZoom(zoomOverride);
    setSelectionFocusVersion((version) => version + 1);
    // Persiste o polígono acessado no cache IndexedDB de talhões mais frequentes
    void hotTalhoesCache.recordAccess(feature);

    // O MapContainer executa o voo com sua própria instância Mapbox, após
    // confirmar que o mapa e a geometria selecionada estão prontos.
  };

  const handleMapReady = useCallback((map: any) => {
    setMapInstance(map);
    registerBenchmarkMapInstance(map);
  }, []);

  const handleLocateCoordinates = (lat: number, lng: number) => {
    if (mapInstance && !isNaN(lat) && !isNaN(lng)) {
      mapInstance.flyTo({
        center: [lng, lat],
        zoom: MAP_CONFIG.SELECTED_ZOOM,
        duration: MAP_CONFIG.FLY_DURATION,
      });
    }
  };



  const handleAreaClick = (fundo: number, talhao: number) => {
    setSelectedFundo(fundo);
    setSelectedTalhao(talhao);
    
    // Atualizar URL sem recarregar página
    initialSelectionHandledRef.current = true;
    updateSelectionUrl(fundo, talhao);

    const clickedFeature = geoJSONData?.features.find(
      (f) => f.properties.FAZENDA === fundo && f.properties.TALHAO === talhao
    );
    if (clickedFeature) {
      void hotTalhoesCache.recordAccess(clickedFeature);
    }
  };

  // Listener para eventos customizados
  useEffect(() => {
    const handleOpenPoiModal = (event: CustomEvent) => {
      console.log('Evento openPoiModal:', event.detail);
    };
    window.addEventListener('openPoiModal', handleOpenPoiModal as EventListener);
    return () => window.removeEventListener('openPoiModal', handleOpenPoiModal as EventListener);
  }, []);

  // O mapa base e os controles aparecem em paralelo ao download dos talhões.
  // Uma falha de dados não desmonta o mapa nem bloqueia as marcações locais.
  return (
    <POIManagerProvider>
      <StartupOverlay ready={!!geoJSONData && !!mapInstance} failed={!!error} />
      <InstallPrompt />
      <div className="bp-app-shell w-full h-screen flex flex-col overflow-hidden">
        {/* Header - Oculto em fullscreen ou modo imersivo */}
        {!isFullscreen && !immersive && <Header onMenuToggle={(open) => { if (open) setMenuMounted(true); setMenuOpen(open); }} />}

        {/* Menu Lateral */}
        {!isFullscreen && !immersive && menuMounted && (
          <Suspense fallback={null}>
          <MenuLateral
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            onNavigateToTalhao={(fundo, talhao) => {
              handleSelectResult(fundo, talhao);
            }}
          />
          </Suspense>
        )}

        {/* Barra de busca lateral (esquerda) — abre pelo botão ☰ */}
        {!immersive && (
          <SearchDrawerLeft
            onSearch={handleSearch}
            onSelectResult={handleSelectResult}
            results={searchResults}
            onFullscreenChange={setIsFullscreen}
          />
        )}

        {/* Botão para RESTAURAR a interface quando em modo imersivo */}
        {immersive && (
          <button
            data-testid="restore-ui-btn"
            onClick={toggleImmersive}
            title="Mostrar menus e ícones"
            aria-label="Mostrar menus e ícones"
            className="glass-liquid-button bp-immersive-restore"
            style={{
              position: 'fixed', top: 12, right: 12, zIndex: 60,
              width: 46, height: 46, borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(26,35,51,0.82)',
              border: '1.5px solid rgba(173,255,47,0.35)',
              color: '#ADFF2F', cursor: 'pointer',
              backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <Minimize2 size={22} strokeWidth={2.5} />
          </button>
        )}

        {/* Mapa - Ocupa todo o espaço restante */}
        <div className="flex-1 relative">
          {!geoJSONData && (loading || error) && (
            <div role="status" aria-live="polite" style={{ position: 'absolute', top: 90, left: 12, zIndex: 45, maxWidth: 'min(310px, calc(100vw - 84px))', padding: '10px 14px', borderRadius: 12, background: 'var(--bp-glass-bg-strong, #142333)', color: 'var(--bp-text-primary, #fff)', boxShadow: '0 4px 18px rgba(0,0,0,.25)', fontSize: 13 }}>
              {loading ? 'Carregando os talhões… O mapa já pode ser usado.' : <>
                <p style={{ margin: '0 0 8px' }}>Não foi possível carregar os talhões. Verifique a conexão ou o download offline.</p>
                <button type="button" onClick={retry} style={{ padding: '7px 12px', borderRadius: 8, border: 0, background: '#ADFF2F', color: '#07111d', fontWeight: 700 }}>Tentar novamente</button>
              </>}
            </div>
          )}
          <MapContainer
            onMapReady={handleMapReady}
            geojsonData={geoJSONData}
            selectedFundo={selectedFundo}
            selectedTalhao={selectedTalhao}
            selectionFocusVersion={selectionFocusVersion}
            selectionFocusZoom={selectionFocusZoom}
            onAreaClick={handleAreaClick}
            immersive={immersive}
            onToggleImmersive={toggleImmersive}
          />
          
          {/* POI Manager */}
          <POIManager onLocateCoordinates={handleLocateCoordinates} hidden={immersive} />
        </div>
      </div>
    </POIManagerProvider>
  );
}
