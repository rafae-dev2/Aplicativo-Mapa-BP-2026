/**
 * poiIconCache — Configuração estratégica de cache dos ícones de caminhões e
 * represas com controle por assinatura da lista oficial de ativos.
 *
 * Otimização para redes móveis:
 *  - Gera uma assinatura determinística da lista oficial (`STRATEGIC_POI_ICONS`)
 *    combinada com `STRATEGIC_POI_ICONS_VERSION`.
 *  - Se a assinatura gravada localmente e no Cache Storage coincidir com a lista
 *    oficial atual e todos os ícones já estiverem no cache, NENHUMA requisição de
 *    rede é disparada.
 *  - Quando a lista oficial muda (novo ativo, substituição ou remoção), baixa
 *    somente os ícones adicionados/ausentes e remove ativos obsoletos do cache.
 */

export const POI_ICONS_CACHE_NAME = 'bp-poi-icons-v1';
export const POI_ICONS_MANIFEST_KEY = '/__poi-icons-manifest-meta__';
export const POI_ICONS_SIGNATURE_STORAGE_KEY = 'bp-poi-icons-manifest-sig-v1';

/** Versão explícita da lista oficial — incremente apenas se substituir um PNG mantendo o mesmo nome. */
export const STRATEGIC_POI_ICONS_VERSION = '2026-01';

/** Lista oficial estratégica de ícones de represas (caminhão-pipa) e caminhões de transporte. */
export const STRATEGIC_POI_ICONS: readonly string[] = [
  '/poi-water-truck-blue.png',
  '/poi-water-truck-x.png',
  '/poi-water-truck-transparent.png',
  '/poi-water-truck-unavailable.png',
  '/poi-pin-transport-dump-truck.png',
  '/poi-pin-transport-dump-truck-256.png',
  '/poi-pin-transport-munck-truck.png',
  '/poi-pin-fire.png',
  '/poi-pin-custom.png',
] as const;

const DYNAMIC_POI_ICON_PATTERN =
  /^\/poi-(?:water-truck|pin-transport|pin-fire|pin-custom)[^/]*\.(?:png|webp|svg)$/i;

export interface StrategicIconDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
  hasChanges: boolean;
}

export interface WarmPoiIconsResult {
  updated: boolean;
  fetchedCount: number;
  removedCount: number;
  cachedCount: number;
  signature: string;
  reason: 'manifest-unchanged' | 'updated' | 'offline' | 'unsupported';
}

export function isStrategicPoiIconPath(pathname: string): boolean {
  if (!pathname) return false;
  return STRATEGIC_POI_ICONS.includes(pathname) || DYNAMIC_POI_ICON_PATTERN.test(pathname);
}

/**
 * Calcula assinatura determinística independente da ordem da lista oficial.
 * Muda somente se algum ativo for adicionado, removido, renomeado ou se a versão mudar.
 */
export function computeStrategicIconsSignature(
  icons: readonly string[] = STRATEGIC_POI_ICONS,
  version: string = STRATEGIC_POI_ICONS_VERSION
): string {
  const canonical = Array.from(new Set(icons)).sort((a, b) => a.localeCompare(b));
  return `${version}::${canonical.join('|')}`;
}

/**
 * Compara a lista anterior cacheada com a lista oficial atual para baixar apenas
 * o delta e remover ativos obsoletos.
 */
export function diffStrategicIconLists(
  previousIcons: readonly string[],
  nextIcons: readonly string[]
): StrategicIconDiff {
  const prevSet = new Set(previousIcons);
  const nextSet = new Set(nextIcons);

  const added = Array.from(nextSet).filter((icon) => !prevSet.has(icon));
  const removed = Array.from(prevSet).filter((icon) => !nextSet.has(icon));
  const unchanged = Array.from(nextSet).filter((icon) => prevSet.has(icon));

  return {
    added,
    removed,
    unchanged,
    hasChanges: added.length > 0 || removed.length > 0,
  };
}

export const STRATEGIC_POI_ICONS_SIGNATURE = computeStrategicIconsSignature(
  STRATEGIC_POI_ICONS,
  STRATEGIC_POI_ICONS_VERSION
);

interface StoredIconManifest {
  signature: string;
  version: string;
  icons: string[];
  updatedAt: number;
}

async function readManifestFromCache(cache: Cache): Promise<StoredIconManifest | null> {
  try {
    const res = await cache.match(POI_ICONS_MANIFEST_KEY);
    if (!res) return null;
    const data = (await res.json()) as Partial<StoredIconManifest>;
    if (typeof data?.signature !== 'string' || !Array.isArray(data?.icons)) return null;
    return {
      signature: data.signature,
      version: typeof data.version === 'string' ? data.version : '',
      icons: data.icons,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

async function writeManifestToCache(cache: Cache, manifest: StoredIconManifest): Promise<void> {
  try {
    await cache.put(
      POI_ICONS_MANIFEST_KEY,
      new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch {
    /* noop */
  }
}

/**
 * Sincroniza o cache estratégico de ícones de POIs apenas quando há mudança
 * na lista oficial (`STRATEGIC_POI_ICONS` / `STRATEGIC_POI_ICONS_VERSION`) ou
 * quando algum ativo obrigatório ainda não está presente no cache.
 */
export async function warmStrategicPoiIconsCache(): Promise<WarmPoiIconsResult> {
  const signature = STRATEGIC_POI_ICONS_SIGNATURE;

  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return {
      updated: false,
      fetchedCount: 0,
      removedCount: 0,
      cachedCount: 0,
      signature,
      reason: 'unsupported',
    };
  }

  try {
    const cache = await caches.open(POI_ICONS_CACHE_NAME);
    const storedManifest = await readManifestFromCache(cache);
    const storedLocalSig = (() => {
      try {
        return localStorage.getItem(POI_ICONS_SIGNATURE_STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    // Verifica integridade dos ativos já presentes no cache (sem tráfego de rede)
    const presence = await Promise.all(
      STRATEGIC_POI_ICONS.map(async (iconPath) => ({
        iconPath,
        cached: Boolean(await cache.match(iconPath)),
      }))
    );
    const missingIcons = presence.filter((item) => !item.cached).map((item) => item.iconPath);

    // Caminho rápido (0 bytes de rede): assinatura oficial idêntica e todos os ícones presentes
    if (
      storedManifest?.signature === signature &&
      missingIcons.length === 0
    ) {
      if (storedLocalSig !== signature) {
        try {
          localStorage.setItem(POI_ICONS_SIGNATURE_STORAGE_KEY, signature);
        } catch {
          /* noop */
        }
      }
      return {
        updated: false,
        fetchedCount: 0,
        removedCount: 0,
        cachedCount: STRATEGIC_POI_ICONS.length,
        signature,
        reason: 'manifest-unchanged',
      };
    }

    if (navigator.onLine === false) {
      return {
        updated: false,
        fetchedCount: 0,
        removedCount: 0,
        cachedCount: STRATEGIC_POI_ICONS.length - missingIcons.length,
        signature,
        reason: 'offline',
      };
    }

    const versionChanged = Boolean(storedManifest && storedManifest.version !== STRATEGIC_POI_ICONS_VERSION);
    const diff = diffStrategicIconLists(storedManifest?.icons ?? [], STRATEGIC_POI_ICONS);
    const iconsToFetch = versionChanged
      ? [...STRATEGIC_POI_ICONS]
      : Array.from(new Set([...diff.added, ...missingIcons]));

    // Remove do cache ícones que saíram da lista oficial
    let removedCount = 0;
    for (const obsolete of diff.removed) {
      if (await cache.delete(obsolete)) {
        removedCount += 1;
      }
    }

    let fetchedCount = 0;
    await Promise.allSettled(
      iconsToFetch.map(async (iconPath) => {
        const response = await fetch(iconPath, {
          cache: versionChanged ? 'no-cache' : 'force-cache',
        });
        if (response && response.ok) {
          await cache.put(iconPath, response.clone());
          fetchedCount += 1;
        }
      })
    );

    const remainingMissing = (
      await Promise.all(STRATEGIC_POI_ICONS.map((iconPath) => cache.match(iconPath)))
    ).filter((match) => !match).length;

    if (remainingMissing === 0) {
      await writeManifestToCache(cache, {
        signature,
        version: STRATEGIC_POI_ICONS_VERSION,
        icons: [...STRATEGIC_POI_ICONS],
        updatedAt: Date.now(),
      });
      try {
        localStorage.setItem(POI_ICONS_SIGNATURE_STORAGE_KEY, signature);
      } catch {
        /* noop */
      }
    }

    // Notifica o Service Worker somente quando houve alteração real de manifesto
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_POI_ICONS',
          icons: [...STRATEGIC_POI_ICONS],
          version: STRATEGIC_POI_ICONS_VERSION,
          signature,
        });
      }
    } catch {
      /* noop */
    }

    return {
      updated: fetchedCount > 0 || removedCount > 0,
      fetchedCount,
      removedCount,
      cachedCount: STRATEGIC_POI_ICONS.length - remainingMissing,
      signature,
      reason: 'updated',
    };
  } catch {
    return {
      updated: false,
      fetchedCount: 0,
      removedCount: 0,
      cachedCount: 0,
      signature,
      reason: 'unsupported',
    };
  }
}
