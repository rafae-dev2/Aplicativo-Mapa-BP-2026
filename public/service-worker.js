/**
 * Service Worker - Mapas Branco Peres v180 — Modais ampliados
 *
 * MELHORIAS v180:
 * - Modais laterais e painel de transporte ampliados para leitura integral; ações como Compartilhar não são mais comprimidas, e o compartilhamento ganhou corpo rolável.
 *
 * MELHORIAS v161:
 * - Interface de transporte redesenhada com identidade visual operacional e os assets reais de caminhão caçamba/munck nas viagens.
 *
 * MELHORIAS v160:
 * - Adubo pode ser salvo e atualizado online mesmo antes da migration de transport_formula, com fallback compatível; formulário permite toneladas ou BigBags.
 *
 * MELHORIAS v159:
 * - Relatório de transporte elevado a documento operacional executivo, com indicadores de execução, rastreabilidade por frota, barra de atendimento e conclusão sem aparência genérica.
 *
 * MELHORIAS v158:
 * - Relatório exportável redesenhado em branco, com estética corporativa multinacional, hierarquia executiva e leitura de dados reforçada.
 *
 * MELHORIAS v157:
 * - Relatório visual de transporte exportável em PNG com um clique, logo, material, viagens por frota, pesos e comparação final com o pedido.
 *
 * MELHORIAS v156:
 * - Cartão de status do transporte ajustado para manter “Ultrapassado” dentro da caixa, com quebra segura e painel lateral mais largo.
 *
 * MELHORIAS v155:
 * - Legendas das marcações de transporte exibem somente Calcário, Gesso, Insumos, Torta, Composto, Reativo ou Adubo, sem o prefixo “Transporte”.
 *
 * MELHORIAS v154:
 * - Excesso de entrega destacado por unidade, com quantidade ultrapassada visível sem bloquear novas viagens.
 * - Adubo com fórmula e seleção automática do caminhão munck para Adubo e Reativo.
 * - Caminhão caçamba preservado para os demais materiais e novo asset munck incluído no precache.
 *
 * MELHORIAS v153:
 * - Rótulo Compartilhar encapsulado em span responsivo, com quebra de linha segura e centralização dentro da caixa em telas estreitas.
 *
 * MELHORIAS v152:
 * - Giro circular aplicado ao wrapper do logotipo; a imagem interna permanece estática para evitar conflitos de transformação.
 * - Marcações ao vivo permanece com superfície glass alinhada aos controles do mapa.
 *
 * MELHORIAS v151:
 * - Aviso de atualização reduzido a cartão compacto com resumo curto e botão Atualizar agora; o changelog completo não é exibido.
 * - Giro circular frontal do logotipo reforçado diretamente no símbolo do cabeçalho.
 *
 * MELHORIAS v150:
 * - Giro circular frontal 2D reforçado diretamente na imagem do logotipo, sempre ativo e sem perspectiva lateral.
 * - Cartão Marcações ao vivo alinhado visualmente ao glass dos controles, da busca e do seletor de estilo.
 *
 * MELHORIAS v149:
 * - Animação do logotipo corrigida para giro circular frontal 2D, sem perspectiva ou rotação lateral.
 *
 * MELHORIAS v148:
 * - Aro externo do logotipo removido; a rotação robusta acontece diretamente no símbolo.
 * - GPS reposicionado abaixo do seletor Satélite/Rua com acabamento glass; Marcações ao vivo e Buscar fundo reforçados visualmente.
 *
 * MELHORIAS v147:
 * - Painel lateral compacto para fazendas e marcações gerais; painel amplo exclusivo para transporte de insumo.
 * - Rotação premium visível no logotipo e acabamento glass em Marcações ao vivo e Buscar fundo.
 *
 * MELHORIAS v146:
 * - Satélite e rua foram reunidos em um seletor glass abaixo do botão Expandir.
 *
 * MELHORIAS v145:
 * - Controles de satélite, modo rua e minha localização ficam visíveis diretamente sobre o mapa.
 *
 * MELHORIAS v144:
 * - Ícone de Transporte de Insumo substituído pelo caminhão caçamba e precacheado para uso offline.
 *
 * MELHORIAS v143 (integração seletiva da base geográfica MAPAGERAL):
 * - 85 geometrias relevantes atualizadas, com 1.603 pares existentes preservados.
 * - 52 pares antigos ausentes no arquivo e 40 pares novos mantidos no conjunto final.
 * - Cache do mapa renovado sem apagar marcações, tombstones ou fila offline.
 *
 * MELHORIAS v132 (medição GPS avançada de área queimada e contraste temático):
 * - Trilha GPS a pé com filtro de precisão, cálculo de polígono, hectares e perímetro.
 * - Camadas de fundos/talhões com paleta dinâmica e controles reposicionados.
 *
 * MELHORIAS v131 (transporte de insumos para caminhões caçamba e menu de ferramentas recolhível):
 * - Dados de insumo, quantidade e unidade mantidos no cache/localStorage e nos links compartilhados.
 * - Nova categoria de caminhão caçamba com seleção pesquisável, toneladas e BigBags.
 * - Ferramentas do mapa agrupadas em uma gaveta premium e responsiva.
 *
 * MELHORIAS v126 (ícone exclusivo de caminhão-pipa para Pegador de Água/Represa):
 * - Nova imagem transparente precacheada para a categoria represa.
 * - Demais categorias permanecem com seus ícones atuais.
 *
 * MELHORIAS v125 (folha inferior com gesto descendente determinístico e portal único):
 * - Fechamento do snap máximo tratado antes do release interno do Vaul.
 * - Remontagem forçada da folha removida para evitar sensação de dois modais.
 *
 * MELHORIAS v124 (limpeza de cache coordenada e atualização segura):
 * - Limpeza automática de caches antigos durante a ativação.
 * - Runtime config revalidado na rede para recuperar o Supabase correto.
 * - Fila offline, tombstones e marcações locais preservados.
 *
 * MELHORIAS v123 (Ícones PWA com fundo transparente, encaixe circular seguro):
 * - Suporte offline completo com GPS funcionando
 * - Cache de tiles Mapbox pré-carregado e robusto (até 5000 tiles)
 * - IndexedDB com versionamento para GeoJSON
 * - Estratégia de cache otimizada para fazendas
 * - Suporte a POIs compartilhados offline
 * - Notificações de status offline/online
 * - Sincronização de dados em background
 *
 * Estratégia de cache:
 * - App Shell: Cache First (crítico para PWA)
 * - GeoJSON: IndexedDB com versioning (22MB+)
 * - Tiles Mapbox: Cache-first; rede somente em miss e poda throttled
 * - POIs: IndexedDB com sincronização
 * - version.json: Network First (sempre da rede)
 */

const CACHE_VERSION   = 'v189-selecao-consistente';
// Caches ESTÁVEIS (não incluem a versão no nome): assim uma atualização do app
// NUNCA apaga os mapas/dados já baixados. É isso que garante abrir offline no
// campo mesmo depois de uma nova publicação.
const STATIC_CACHE    = 'mapas-branco-peres-static'; // shell (index.html) + bundles JS/CSS + ícones
const DATA_CACHE      = 'mapas-branco-peres-data';   // dados de campo (.mapdata, .mbtiles, labels)
const TILES_CACHE     = 'mapbox-tiles';              // tiles/estilo/fontes do Mapbox
// O worker dedicado de tiles usa este nome. Ele é relacionado ao app e nunca
// deve ser removido por este worker, assim como caches que não conhecemos.
const RELATED_CACHES  = [STATIC_CACHE, DATA_CACHE, TILES_CACHE, 'bp-map-tiles-v1'];
const STAGING_PREFIX  = `${STATIC_CACHE}::staging:`;
const CACHE_NAME      = STATIC_CACHE; // compatibilidade com trechos existentes

const IDB_NAME        = 'mapas-geojson-db';
const IDB_STORE       = 'geojson-store';
const IDB_POIS_STORE  = 'pois-store';
const IDB_KEY         = 'branco-peres';
const IDB_VERSION_KEY = 'geojson-version';
const IDB_SW_KEY      = 'sw-version';
const IDB_TILES_META  = 'tiles-metadata';

const GEOJSON_URL     = '/branco-peres.geojson';
const VERSION_URL     = '/version.json';
const MAPDATA_PATH     = '/branco-peres.mapdata';
const APP_SHELL_MANIFEST = '/app-shell-assets.json';
const NAVIGATION_TIMEOUT = 15000;
const INSTALL_TIMEOUT    = 20000;
const MAX_TILES           = 6000;
const TILE_PRUNE_MISSES   = 64;
const TILE_PRUNE_INTERVAL = 60 * 1000;
let tileMissesSincePrune  = 0;
let lastTilePruneAt       = 0;

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/runtime-config.js',
  '/notification-config.js',
  '/app-shell-assets.json',
  '/icon-logo.svg',
  '/icon-logo.png',
  '/pwa-apple-touch-icon.png',
];

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 3); // v3 para suporte a POIs e tiles metadata
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_POIS_STORE)) {
        db.createObjectStore(IDB_POIS_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_TILES_META)) {
        db.createObjectStore(IDB_TILES_META);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function idbGet(key, store = IDB_STORE) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function idbSet(key, value, store = IDB_STORE) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function idbDelete(key, store = IDB_STORE) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Notificar clientes ────────────────────────────────────────────────────────
async function notifyClientsWithRetry(type, data = {}) {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  });
  console.log(`[SW ${CACHE_VERSION}] Notificando ${clients.length} cliente(s): ${type}`);
  clients.forEach((client) => client.postMessage({ type, ...data }));
}

// ── Verificar e aplicar atualização do GeoJSON ────────────────────────────────
async function checkAndUpdateGeoJSON(notifyIfSame = false) {
  try {
    const versionRes = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!versionRes.ok) return null;

    const versionData  = await versionRes.json();
    const serverVersion = String(versionData.geojsonVersion || versionData.version || '0');
    const storedVersion = await idbGet(IDB_VERSION_KEY);

    console.log(`[SW ${CACHE_VERSION}] GeoJSON — servidor: ${serverVersion}, local: ${storedVersion || 'nenhuma'}`);

    // O app atual usa o mapdata versionado como fonte principal. Se essa
    // versão já estiver no DATA_CACHE, não baixe um GeoJSON paralelo (e
    // possivelmente mais antigo) só porque CHECK_UPDATE chegou em paralelo.
    if (storedVersion !== serverVersion && await hasCurrentMapData()) {
      console.log(`[SW ${CACHE_VERSION}] Mapdata do manifesto já está no cache; GeoJSON não será rebaixado.`);
      return { updated: false, version: serverVersion, skipped: 'mapdata-current' };
    }

    if (storedVersion && storedVersion !== serverVersion && isNumericVersion(storedVersion, serverVersion)
      && Number(storedVersion) > Number(serverVersion)) {
      return { updated: false, version: storedVersion, skipped: 'local-newer' };
    }

    if (storedVersion !== serverVersion) {
      console.log(`[SW ${CACHE_VERSION}] Nova versão detectada! Baixando GeoJSON...`);

      const geojsonRes = await fetch(GEOJSON_URL, { cache: 'no-store' });
      if (!geojsonRes.ok) throw new Error(`HTTP ${geojsonRes.status}`);

      const geojsonText = await geojsonRes.text();
      await idbSet(IDB_KEY, geojsonText);
      await idbSet(IDB_VERSION_KEY, serverVersion);

      console.log(`[SW ${CACHE_VERSION}] GeoJSON v${serverVersion} salvo no IndexedDB.`);

      await notifyClientsWithRetry('GEOJSON_UPDATED', {
        version:   serverVersion,
        features:  versionData.features,
        changelog: versionData.changelog || '',
      });

      return { updated: true, version: serverVersion, data: versionData };
    }

    return { updated: false, version: serverVersion };
  } catch (err) {
    console.warn(`[SW ${CACHE_VERSION}] Erro ao verificar GeoJSON:`, err);
    return null;
  }
}

function isNumericVersion(left, right) {
  return /^\d+(?:\.\d+)?$/.test(String(left)) && /^\d+(?:\.\d+)?$/.test(String(right));
}

async function hasCurrentMapData() {
  try {
    const dataCache = await caches.open(DATA_CACHE);
    const staticCache = await caches.open(STATIC_CACHE);
    const manifestResponse = await staticCache.match(APP_SHELL_MANIFEST);

    // O manifesto de build é a fonte de verdade do app versionado. Isso
    // separa a versão das geometrias legadas (version.json/geojsonVersion)
    // da versão do mapdata usado pela abertura atual (v186, por exemplo).
    if (manifestResponse) {
      const manifest = parseAssetManifest(await manifestResponse.clone().json());
      const manifestMapdata = [...manifest.dataAssets].filter((url) => {
        try { return new URL(url, self.location.origin).pathname === MAPDATA_PATH; } catch { return false; }
      });
      for (const url of manifestMapdata) {
        if (await dataCache.match(url)) return true;
      }
      return false;
    }

    // Compatibilidade com instalações anteriores ao manifesto: só considere
    // uma chave mapdata explicitamente versionada, jamais a chave sem query.
    const requests = await dataCache.keys();
    return requests.some((request) => {
      const url = new URL(request.url);
      return url.pathname === MAPDATA_PATH
        && Boolean(url.searchParams.get('v') || url.searchParams.get('version'));
    });
  } catch {
    return false;
  }
}

// ── Limpar somente staging criado por este worker; caches desconhecidos ficam ─
//    intactos, assim como static/data/tiles e o cache do worker dedicado. ─────
async function cleanupLegacyCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => !RELATED_CACHES.includes(name) && name.startsWith(STAGING_PREFIX))
      .map((name) => {
        console.log(`[SW ${CACHE_VERSION}] Removendo staging próprio: ${name}`);
        return caches.delete(name);
      })
  );
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}-timeout`)), milliseconds);
    }),
  ]);
}

async function safeCachePut(cache, request, response) {
  try {
    await cache.put(request, response.clone());
    return true;
  } catch (error) {
    // Quota/eviction não pode converter uma resposta de rede válida em 504.
    console.warn(`[SW ${CACHE_VERSION}] Cache put ignorado (${String(request)}):`, error);
    return false;
  }
}

function isUsableResponse(response) {
  return Boolean(response && response.ok && (!response.type || response.type === 'basic'));
}

function normalizeSameOriginAsset(value) {
  if (typeof value !== 'string' || !value || value.startsWith('data:')) return null;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function collectManifestEntries(value, output) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectManifestEntries(entry, output));
    return;
  }
  const normalized = normalizeSameOriginAsset(value);
  if (normalized) output.add(normalized);
}

function parseAssetManifest(payload) {
  const assets = new Set();
  const dataAssets = new Set();
  if (!payload || typeof payload !== 'object') return { assets, dataAssets };

  collectManifestEntries(payload.assets, assets);
  collectManifestEntries(payload.files, assets);
  collectManifestEntries(payload.js, assets);
  collectManifestEntries(payload.css, assets);
  collectManifestEntries(payload.dataAssets, dataAssets);
  return { assets, dataAssets };
}

function parseIndexAssetReferences(html) {
  const assets = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = re.exec(html || ''))) {
    const normalized = normalizeSameOriginAsset(match[1]);
    if (normalized) assets.add(normalized);
  }
  return assets;
}

async function fetchInstallAsset(url, cacheMode = 'no-store', timeout = INSTALL_TIMEOUT) {
  const absoluteUrl = new URL(url, self.location.origin).href;
  const response = await withTimeout(
    fetch(new Request(absoluteUrl, { cache: cacheMode })),
    timeout,
    `asset-${url}`
  );
  if (!isUsableResponse(response)) throw new Error(`asset-${url}-http-${response?.status || 0}`);
  return response;
}

function installAssetCacheMode(url) {
  try {
    const pathname = new URL(url, self.location.origin).pathname;
    const alwaysFresh = pathname === '/'
      || pathname.endsWith('/index.html')
      || pathname.endsWith('/runtime-config.js')
      || pathname.endsWith('/notification-config.js')
      || pathname.endsWith('/manifest.json')
      || pathname.endsWith('/app-shell-assets.json');
    if (alwaysFresh) return 'no-store';
    if (/\/assets\/[^/]+\.(?:js|css)$/i.test(pathname)) return 'force-cache';
    if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?|ttf|otf)$/i.test(pathname)) return 'force-cache';
  } catch {
    return 'no-store';
  }
  return 'no-store';
}

async function readInstallManifest() {
  try {
    const response = await fetchInstallAsset(APP_SHELL_MANIFEST, 'no-store');
    return { ...parseAssetManifest(await response.clone().json()), response };
  } catch {
    // Compatibilidade com builds ainda sem o manifesto: o index é uma
    // alternativa segura, mas a instalação nunca troca o shell sem validar
    // os bundles descobertos.
    return { assets: new Set(), dataAssets: new Set(), response: null };
  }
}

async function stageAndPromoteStaticCache() {
  const stagingName = `${STAGING_PREFIX}${CACHE_VERSION}`;
  const staging = await caches.open(stagingName);
  const manifest = await readInstallManifest();
  const required = new Set(APP_SHELL.filter((url) => url !== APP_SHELL_MANIFEST));
  manifest.assets.forEach((url) => required.add(url));

  const fetched = new Map();
  await Promise.all([...required].map(async (url) => {
    const response = await fetchInstallAsset(url, installAssetCacheMode(url));
    fetched.set(url, response);
  }));

  // O manifesto é parte do shell, mas pode não existir em builds antigos.
  try {
    fetched.set(APP_SHELL_MANIFEST, manifest.response || await fetchInstallAsset(APP_SHELL_MANIFEST, 'no-store'));
  } catch {
    // fallback abaixo usa as referências do index
  }

  const indexResponse = fetched.get('/index.html');
  if (indexResponse) {
    const indexAssets = parseIndexAssetReferences(await indexResponse.clone().text());
    await Promise.all([...indexAssets].filter((url) => !fetched.has(url)).map(async (url) => {
      fetched.set(url, await fetchInstallAsset(url, installAssetCacheMode(url)));
    }));
  }

  const bundleEntries = [...fetched.keys()].filter((url) => /\.(?:js|css)(?:\?|$)/i.test(url));
  if (!bundleEntries.length) throw new Error('shell-sem-bundles-essenciais');
  bundleEntries.forEach((url) => {
    if (!isUsableResponse(fetched.get(url))) throw new Error(`bundle-invalido-${url}`);
  });

  await Promise.all([...fetched.entries()].map(([url, response]) => staging.put(url, response.clone())));

  // Copie primeiro bundles/recursos; o index só entra por último. Assim uma
  // falha no meio nunca deixa um HTML novo apontando para bundles ausentes.
  const stagedRequests = await staging.keys();
  const documentRequests = stagedRequests.filter((request) => {
    const pathname = new URL(request.url).pathname;
    return pathname === '/' || pathname.endsWith('/index.html');
  });
  const assetRequests = stagedRequests.filter((request) => !documentRequests.includes(request));
  const stable = await caches.open(STATIC_CACHE);
  await Promise.all(assetRequests.map(async (request) => {
    const response = await staging.match(request);
    if (response) await stable.put(request, response);
  }));
  await Promise.all(documentRequests.map(async (request) => {
    const response = await staging.match(request);
    if (response) await stable.put(request, response);
  }));
  await caches.delete(stagingName);
  return { dataAssets: manifest.dataAssets };
}

async function precacheEssentialData(dataAssets) {
  const candidates = [...dataAssets].filter((url) => /(?:\.mapdata|-[^/]+\.json)(?:\?|$)/i.test(url));
  if (!candidates.length) return;
  const cache = await caches.open(DATA_CACHE);
  await Promise.allSettled(candidates.map(async (url) => {
    try {
      if (await cache.match(url)) return;
      const response = await fetchInstallAsset(url, 'force-cache', 45000);
      await safeCachePut(cache, url, response);
    } catch (error) {
      console.warn(`[SW ${CACHE_VERSION}] Pré-cache de dado falhou (${url}):`, error);
    }
  }));
}

// A limpeza é deliberadamente explícita: não enumera nem remove tiles por
// requisição. A interface permanece para compatibilidade com o app.
async function cleanupExpiredTiles() {
  console.log(`[SW ${CACHE_VERSION}] Limpeza de tiles ignorada; cache preservado.`);
}

async function pruneTilesIfNeeded(cache) {
  tileMissesSincePrune += 1;
  const now = Date.now();
  if (tileMissesSincePrune < TILE_PRUNE_MISSES && now - lastTilePruneAt < TILE_PRUNE_INTERVAL) return;
  tileMissesSincePrune = 0;
  lastTilePruneAt = now;
  try {
    const keys = await cache.keys();
    const excess = Math.max(0, keys.length - MAX_TILES);
    // Só remove excesso do cache de tiles, em lote pequeno e no máximo uma
    // vez por minuto; nunca enumera nem toca static/data/desconhecidos.
    await Promise.all(keys.slice(0, Math.min(excess, TILE_PRUNE_MISSES)).map((key) => cache.delete(key)));
  } catch (error) {
    console.warn(`[SW ${CACHE_VERSION}] Poda throttled de tiles falhou:`, error);
  }
}

// ── Eventos do Service Worker ─────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log(`[SW ${CACHE_VERSION}] Instalando...`);
  event.waitUntil(
    (async () => {
      try {
        const { dataAssets } = await stageAndPromoteStaticCache();
        // Só depois de validar/promover o shell tente o dado essencial. MBTiles
        // não entram no manifesto de pré-cache e não são baixados aqui.
        await precacheEssentialData(dataAssets);
        console.log(`[SW ${CACHE_VERSION}] Shell, bundles e dados essenciais preparados.`);
      } catch (err) {
        console.warn(`[SW ${CACHE_VERSION}] Instalação staged não concluída; shell atual preservado:`, err);
        throw err;
      }
      console.log(`[SW ${CACHE_VERSION}] skipWaiting() após validação staged.`);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  console.log(`[SW ${CACHE_VERSION}] Ativando...`);
  event.waitUntil(
    (async () => {
      // Nenhuma rede é necessária para ativar. Apenas staging próprio pode ser
      // removido; static/data/tiles e caches desconhecidos permanecem intactos.
      try { await cleanupLegacyCaches(); } catch (error) {
        console.warn(`[SW ${CACHE_VERSION}] Limpeza de staging falhou:`, error);
      }

      try {
        await self.clients.claim();
        console.log(`[SW ${CACHE_VERSION}] clients.claim() executado.`);
      } catch (error) {
        console.warn(`[SW ${CACHE_VERSION}] clients.claim() falhou:`, error);
      }

      try { await idbSet(IDB_SW_KEY, CACHE_VERSION); } catch (error) {
        console.warn(`[SW ${CACHE_VERSION}] Registro de versão no IDB falhou:`, error);
      }

      try { await notifyClientsWithRetry('SW_UPDATED', { version: CACHE_VERSION }); } catch (error) {
        console.warn(`[SW ${CACHE_VERSION}] Notificação de atualização falhou:`, error);
      }

      console.log(`[SW ${CACHE_VERSION}] Ativação concluída.`);
    })()
  );
});

// ── Mensagens dos clientes ────────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  const type = event.data?.type;

  if (type === 'CHECK_UPDATE') {
    console.log(`[SW ${CACHE_VERSION}] CHECK_UPDATE recebido.`);
    const result = await checkAndUpdateGeoJSON();
    if (event.source) {
      event.source.postMessage({
        type: 'CHECK_UPDATE_RESULT',
        swVersion: CACHE_VERSION,
        geojsonResult: result,
      });
    }
  }

  if (type === 'SKIP_WAITING') {
    console.log(`[SW ${CACHE_VERSION}] SKIP_WAITING recebido.`);
    self.skipWaiting();
  }

  if (type === 'GET_VERSION') {
    if (event.source) {
      event.source.postMessage({
        type: 'VERSION_RESPONSE',
        swVersion: CACHE_VERSION,
      });
    }
  }

  if (type === 'SAVE_POI') {
    // Salvar POI no IndexedDB para sincronização offline
    try {
      const poi = event.data.poi;
      await idbSet(`poi-${Date.now()}`, poi, IDB_POIS_STORE);
      if (event.source) {
        event.source.postMessage({
          type: 'POI_SAVED',
          success: true,
        });
      }
    } catch (err) {
      console.error(`[SW ${CACHE_VERSION}] Erro ao salvar POI:`, err);
    }
  }

  if (type === 'CLEANUP_TILES') {
    console.log(`[SW ${CACHE_VERSION}] CLEANUP_TILES recebido.`);
    await cleanupExpiredTiles();
    if (event.source) {
      event.source.postMessage({
        type: 'CLEANUP_COMPLETE',
      });
    }
  }

  if (type === 'PURGE_OLD_CACHES') {
    console.log(`[SW ${CACHE_VERSION}] PURGE_OLD_CACHES recebido.`);
    event.waitUntil((async () => {
      try {
        await cleanupLegacyCaches();
        event.source?.postMessage({ type: 'PURGE_OLD_CACHES_COMPLETE', version: CACHE_VERSION });
      } catch (error) {
        console.warn(`[SW ${CACHE_VERSION}] Falha ao limpar caches antigos:`, error);
      }
    })());
  }
});

// ── Handlers de fetch ─────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BYPASS TOTAL: Nada relativo ao banco de dados (Supabase) ou APIs externas
  // pode passar pelo service worker. Isso garante que ao voltar a internet, a
  // conexão com o banco reconecta imediatamente, sem qualquer resposta em
  // cache atrapalhando o fluxo AO VIVO.
  // ──────────────────────────────────────────────────────────────────────────
  if (
    url.hostname.endsWith('supabase.co')
    || url.hostname.endsWith('supabase.in')
    || url.hostname.endsWith('supabase.net')
    || url.hostname === 'events.mapbox.com'   // telemetria — não cachear
    || url.protocol === 'ws:'
    || url.protocol === 'wss:'
  ) {
    return; // deixa o navegador tratar diretamente na rede
  }

  // Também não interceptamos NADA cross-origin que não seja tile do Mapbox.
  const isSameOrigin = url.origin === self.location.origin;
  const isMapboxTile = url.hostname.includes('mapbox.com') || url.hostname.includes('mapbox.cn');
  if (!isSameOrigin && !isMapboxTile) {
    return;
  }

  // runtime-config.js é cached-first: a URL versionada do index nunca deve
  // atrasar a abertura enquanto a rede decide se responde.
  if (url.pathname.endsWith('/runtime-config.js')) {
    event.respondWith(handleRuntimeConfig(event.request, event));
    return;
  }

  // version.json continua Network First para CHECK_UPDATE, com fallback local.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const cachePromise = caches.open(STATIC_CACHE).then((cache) => safeCachePut(cache, event.request, response));
            event.waitUntil(cachePromise);
          }
          return response;
        })
        .catch(() => caches.open(STATIC_CACHE).then((cache) => cache.match(event.request)))
    );
    return;
  }

  // GeoJSON → IndexedDB com versioning
  if (url.pathname.endsWith('.geojson')) {
    event.respondWith(handleGeoJSON(event.request));
    return;
  }

  // Dados de campo pesados (.mapdata, .mbtiles, labels) → Cache-first estável.
  // Assim o mapa abre e desenha os talhões SEM internet, e sobrevive a updates.
  if (
    url.pathname.endsWith('.mapdata')
    || url.pathname.endsWith('.mbtiles')
    || url.pathname.endsWith('-labels.json')
  ) {
    event.respondWith(handleDataAsset(event.request));
    return;
  }

  // Tiles Mapbox → Cache-first robusto (permite mapa mostrar sem sinal)
  if (isMapboxTile) {
    event.respondWith(handleMapboxTile(event.request));
    return;
  }

  // Navegação (abrir o app) → shell imediato quando disponível e refresh
  // confiável em segundo plano.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(handleNavigation(event.request, event));
    return;
  }

  // Bundles JS/CSS (hash imutável) → Cache-first (abertura instantânea offline).
  if (/\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(handleCodeAsset(event.request));
    return;
  }

  // App Shell → Cache First
  event.respondWith(handleAppShell(event.request));
});

async function handleRuntimeConfig(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = (await cache.match(request)) || (await cache.match('/runtime-config.js'));
  if (cached) {
    event.waitUntil((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (isUsableResponse(response)) {
          await safeCachePut(cache, '/runtime-config.js', response);
          await safeCachePut(cache, request, response);
        }
      } catch { /* cache atual continua válido */ }
    })());
    return cached;
  }

  try {
    const response = await withTimeout(fetch(request, { cache: 'force-cache' }), NAVIGATION_TIMEOUT, 'runtime-config');
    if (isUsableResponse(response)) {
      await safeCachePut(cache, '/runtime-config.js', response);
      await safeCachePut(cache, request, response);
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'offline-uncached-runtime-config' });
  }
}

// Cache-first para dados de campo versionados. A query string faz parte da
// identidade: nunca sirva mapdata v185 para uma solicitação v186.
async function handleDataAsset(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await withTimeout(fetch(request, { cache: 'force-cache' }), NAVIGATION_TIMEOUT, 'data-asset');
    if (isUsableResponse(response)) await safeCachePut(cache, request, response);
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'offline-uncached-data' });
  }
}

function offlineNavigationResponse() {
  return new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mapas Branco Peres — sem conexão</title>
<style>body{font-family:system-ui,sans-serif;background:#07111d;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center}main{max-width:30rem}button{border:0;border-radius:10px;background:#f4c542;color:#07111d;font-weight:700;padding:12px 18px;cursor:pointer}</style></head>
<body><main><h1>Sem conexão no momento</h1><p>O mapa ainda não está disponível neste dispositivo. Vamos tentar novamente quando a conexão voltar.</p><button onclick="location.reload()">Tentar novamente</button></main>
<script>(function(){var key='bp-sw-navigation-retry';var retried=false;function retry(){if(retried)return;retried=true;try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,String(Date.now()));}catch(_){ }setTimeout(function(){location.reload();},150);}window.addEventListener('online',retry,{once:true});try{if(navigator.onLine&&!sessionStorage.getItem(key))setTimeout(retry,12000);}catch(_){}})();</script></body></html>`, {
    status: 503,
    statusText: 'offline-uncached-navigation',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function cacheNavigationResponse(cache, request, response) {
  if (!isUsableResponse(response)) return;
  await safeCachePut(cache, '/index.html', response);
  await safeCachePut(cache, '/', response);
  if (request.url) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/' && !pathname.endsWith('/index.html')) {
      await safeCachePut(cache, request, response);
    }
  }
}

async function navigationBundlesAreCached(cache, response) {
  try {
    const contentType = response.headers?.get('content-type') || '';
    if (contentType && !contentType.includes('text/html')) return false;
    const assets = parseIndexAssetReferences(await response.clone().text());
    const availability = await Promise.all([...assets].map((url) => cache.match(url, { ignoreVary: true })));
    return availability.every(Boolean);
  } catch {
    return false;
  }
}

async function refreshNavigation(request) {
  try {
    const response = await withTimeout(fetch(request, { cache: 'no-store' }), NAVIGATION_TIMEOUT, 'navigation-refresh');
    const cache = await caches.open(STATIC_CACHE);
    if (isUsableResponse(response) && await navigationBundlesAreCached(cache, response)) {
      await cacheNavigationResponse(cache, request, response);
    }
  } catch { /* shell já entregue; rede pode continuar indisponível */ }
}

async function handleNavigation(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedIndex = (await cache.match('/index.html')) || (await cache.match('/'));
  if (cachedIndex) {
    // Entrega imediata e mantém o refresh dentro do lifetime do fetch event.
    event.waitUntil(refreshNavigation(request));
    return cachedIndex;
  }

  try {
    // Sem shell, espera a rede por um limite razoável; 3s era curto demais
    // para conexões online lentas e gerava falso 503.
    const response = await withTimeout(fetch(request, { cache: 'no-store' }), NAVIGATION_TIMEOUT, 'navigation');
    if (isUsableResponse(response)) {
      if (await navigationBundlesAreCached(cache, response)) {
        await cacheNavigationResponse(cache, request, response);
      }
      return response;
    }
    return offlineNavigationResponse();
  } catch {
    return offlineNavigationResponse();
  }
}

// Bundles com hash → imutáveis: cache-first é seguro e rápido.
async function handleCodeAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  // Vite/preview pode responder bundles com Vary: Origin. O hash e a query
  // continuam exatos; apenas a variação de headers não deve invalidar o hit.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await withTimeout(fetch(request, { cache: 'force-cache' }), NAVIGATION_TIMEOUT, 'code-asset');
    if (isUsableResponse(response)) await safeCachePut(cache, request, response);
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'offline-uncached-asset' });
  }
}

async function handleGeoJSON(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    if (networkResponse.ok) {
      networkResponse.clone().text().then(async (text) => {
        try {
          await idbSet(IDB_KEY, text);
          const versionRes = await fetch(VERSION_URL, { cache: 'no-store' });
          if (versionRes.ok) {
            const vd = await versionRes.json();
            await idbSet(IDB_VERSION_KEY, String(vd.geojsonVersion || vd.version || '0'));
          }
          console.log(`[SW ${CACHE_VERSION}] GeoJSON salvo no IndexedDB.`);
        } catch (err) {
          console.warn(`[SW ${CACHE_VERSION}] Erro ao salvar GeoJSON:`, err);
        }
      });
      return networkResponse;
    }
    throw new Error(`HTTP ${networkResponse.status}`);
  } catch {
    try {
      const cached = await idbGet(IDB_KEY);
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json' } });
      }
    } catch (idbError) {
      console.error(`[SW ${CACHE_VERSION}] IndexedDB falhou:`, idbError);
    }
    return new Response(
      JSON.stringify({ type: 'FeatureCollection', features: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function normalizeTileKey(href) {
  try {
    const u = new URL(href);
    u.searchParams.delete('sku');
    u.searchParams.delete('access_token');
    const params = Array.from(u.searchParams.entries()).sort();
    const search = params.length ? '?' + params.map(function (p) { return p[0] + '=' + p[1]; }).join('&') : '';
    return u.origin + u.pathname + search;
  } catch (e) {
    return href;
  }
}

async function handleMapboxTile(request) {
  const cache  = await caches.open(TILES_CACHE);
  const key    = normalizeTileKey(request.url);
  const cached = await cache.match(key);
  // Hit é definitivo: não rebaixe tiles nem enumere Cache Storage/IDB a cada
  // frame do mapa. A limpeza explícita permanece disponível via mensagem.
  if (cached) return cached;
  try {
    const response = await withTimeout(fetch(request, { cache: 'force-cache' }), NAVIGATION_TIMEOUT, 'mapbox-tile');
    if (response && response.ok) {
      await safeCachePut(cache, key, response);
      void pruneTilesIfNeeded(cache);
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'offline-uncached-tile' });
  }
}

async function handleAppShell(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');
  const cached = (await cache.match(request)) || (url.search ? await cache.match(url.pathname) : null);
  if (cached) return cached;

  try {
    const response = await withTimeout(fetch(request, { cache: 'force-cache' }), NAVIGATION_TIMEOUT, 'app-shell');
    if (isUsableResponse(response)) {
      await safeCachePut(cache, request, response);
    }
    return response;
  } catch {
    if (isNavigation) {
      const fallback = await cache.match('/index.html');
      return fallback || offlineNavigationResponse();
    }
    return new Response('', { status: 504, statusText: 'offline-uncached-app-shell' });
  }
}


// ── Notificações críticas de incêndio/perigo ───────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : 'Nova ocorrência crítica no mapa.' };
  }

  const title = payload.title || 'ALERTA OPERACIONAL';
  const options = {
    body: payload.body || 'Uma nova marcação crítica foi registrada.',
    icon: payload.icon || '/pwa-icon-192.png',
    badge: payload.badge || '/pwa-icon-96.png',
    tag: payload.tag || `critical-poi-${payload.data?.poiId || Date.now()}`,
    renotify: Boolean(payload.renotify ?? true),
    requireInteraction: Boolean(payload.requireInteraction ?? true),
    vibrate: [220, 120, 220, 120, 420],
    data: payload.data || { url: '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('navigate' in client) await client.navigate(targetUrl);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
