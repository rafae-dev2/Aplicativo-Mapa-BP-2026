const SERVICE_WORKER_PATH = '/service-worker.js';
const MAINTENANCE_VERSION_KEY = 'bp-cache-maintenance-version';

// Estes caches são deliberadamente intocáveis. A manutenção não enumera nem
// remove Cache Storage: isso preserva shell, mapdata/labels, tiles e qualquer
// cache relacionado ou desconhecido que possa pertencer a outra integração.
const PRESERVED_CACHES = new Set([
  'mapas-branco-peres-static',
  'mapas-branco-peres-data',
  'mapbox-tiles',
  'bp-map-tiles-v1',
  'bp-poi-icons-v1',
  'bp-config-metadata-v1',
]);

const PRESERVED_STORAGE_KEYS = [
  'mapas-pois',
  'mapas-pois-pending-v1',
  'mapas-pois-deleted-v1',
  'mapas-pois-recent-mutations-v1',
];

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function isDataKey(key: string): boolean {
  return PRESERVED_STORAGE_KEYS.includes(key) || key.startsWith('mapas-pois-');
}

function afterFirstRender(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();

  return new Promise((resolve) => {
    const schedule = () => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      } else {
        window.setTimeout(resolve, 0);
      }
    };

    if (document.readyState === 'loading') {
      window.addEventListener('load', schedule, { once: true });
    } else {
      schedule();
    }
  });
}

/**
 * Remove apenas metadados efêmeros de atualização. Cache Storage nunca é
 * apagado aqui: o shell estável, dados de campo, tiles e caches desconhecidos
 * devem sobreviver tanto à manutenção normal quanto ao force reload.
 */
export async function clearAppCaches(options: { force?: boolean } = {}): Promise<void> {
  const force = options.force ?? false;
  // Mantém a lista explícita como documentação executável do contrato de
  // preservação, sem chamar caches.keys()/caches.delete().
  void PRESERVED_CACHES;

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key || isDataKey(key)) continue;
      if (
        key === 'bp-app-version'
        || key === 'bp-geojson-version'
        || key.startsWith('bp-banner-shown-')
      ) {
        localStorage.removeItem(key);
      }
    }
    if (force) localStorage.setItem(MAINTENANCE_VERSION_KEY, 'manual');
  } catch (error) {
    console.warn('[PWA] Não foi possível atualizar metadados de manutenção:', error);
  }
}

/**
 * Registra somente /service-worker.js no escopo atual. Não procura nem
 * desregistra workers de outros escopos e não chama registration.update():
 * register() já agenda a atualização, e a promessa evita chamadas duplicadas.
 */
export function registerCurrentServiceWorker(version: string): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (registrationPromise) return registrationPromise;

  const task = (async () => {
    await afterFirstRender();
    const registration = await navigator.serviceWorker.register(
      `${SERVICE_WORKER_PATH}?v=${encodeURIComponent(version)}`,
      { updateViaCache: 'none' },
    );

    const activateWaitingWorker = () => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') activateWaitingWorker();
      });
    });

    activateWaitingWorker();
    return registration;
  })();

  registrationPromise = task.catch((error) => {
    registrationPromise = null;
    console.warn('[PWA] Registro do service worker falhou:', error);
    return null;
  });
  return registrationPromise;
}

/**
 * Executa a manutenção sem bloquear a primeira pintura. O limite cobre apenas
 * a tarefa do cliente; o browser continua a instalação do worker em background.
 */
export async function runPwaMaintenance(version: string): Promise<void> {
  const task = (async () => {
    let lastMaintenanceVersion: string | null = null;
    try {
      lastMaintenanceVersion = localStorage.getItem(MAINTENANCE_VERSION_KEY);
    } catch {
      // storage indisponível não impede o registro do worker
    }

    if (lastMaintenanceVersion !== version) {
      await clearAppCaches({ force: true });
      try {
        localStorage.setItem(MAINTENANCE_VERSION_KEY, version);
      } catch {
        // segue: a próxima abertura pode repetir apenas esta manutenção leve
      }
    }

    await registerCurrentServiceWorker(version);
  })();

  await Promise.race([
    task,
    new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
  ]);
}

export async function prepareForAppReload(): Promise<void> {
  const task = (async () => {
    await clearAppCaches({ force: true });
    try {
      // getRegistration() consulta apenas o escopo atual; nenhum outro worker
      // é tocado. O worker principal decide se há staging próprio para limpar.
      const registration = await navigator.serviceWorker?.getRegistration();
      registration?.active?.postMessage({ type: 'PURGE_OLD_CACHES' });
    } catch (error) {
      console.warn('[PWA] Não foi possível solicitar a limpeza segura:', error);
    }
  })();

  await Promise.race([
    task,
    new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
  ]);
}

let mapTilesSwPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registra o worker dedicado de tiles/dados (/sw-map-tiles.js) quando o worker
 * principal de produção não está ativo (ex.: preview/dev), sem interferir em
 * módulos Vite nem no Supabase.
 */
export function registerMapTilesServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (mapTilesSwPromise) return mapTilesSwPromise;

  mapTilesSwPromise = (async () => {
    await afterFirstRender();
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active?.scriptURL?.includes('service-worker.js')) {
      return existing;
    }
    return navigator.serviceWorker.register('/sw-map-tiles.js', { updateViaCache: 'none' });
  })().catch((error) => {
    mapTilesSwPromise = null;
    console.warn('[PWA] Registro de sw-map-tiles ignorado:', error);
    return null;
  });

  return mapTilesSwPromise;
}

