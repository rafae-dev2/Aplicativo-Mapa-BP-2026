/**
 * configMetadataCache — Manifesto oficial e aquecimento Cache-First para
 * arquivos de configuração e metadados do aplicativo.
 *
 * Minimiza chamadas de rede na inicialização em modo offline garantindo que
 * `manifest.json`, `runtime-config.js`, `notification-config.js`, `version.json`
 * e metadados JSON locais sejam servidos imediatamente do Cache Storage
 * (`bp-config-metadata-v1`), com pré-cache controlado por assinatura.
 */

export const CONFIG_METADATA_CACHE_NAME = 'bp-config-metadata-v1';
export const CONFIG_METADATA_VERSION = '2026-01';
export const CONFIG_METADATA_MANIFEST_KEY = '/__config-metadata-manifest__';

/**
 * Lista oficial de arquivos de configuração e metadados servidos com estratégia
 * Cache-First para inicialização offline sem chamadas de rede bloqueantes.
 */
export const CONFIG_AND_METADATA_ASSETS: readonly string[] = [
  '/manifest.json',
  '/runtime-config.js',
  '/notification-config.js',
  '/version.json',
  '/planning_data.json',
  '/planejamento_colheita.json',
  '/experimentos_2026.json',
];

const CONFIG_METADATA_EXACT_SET = new Set<string>([
  ...CONFIG_AND_METADATA_ASSETS,
  '/app-shell-assets.json',
  '/pwa-icon-generation-report.json',
]);

const CONFIG_METADATA_PATTERN =
  /^\/(?:(?:runtime|notification|app)-config\.js|manifest(?:-[^/]+)?\.json|version\.json|app-shell-assets\.json|(?:planning_data|planejamento_colheita|experimentos_\d+)\.json)$/i;

/** Verifica se o pathname pertence aos arquivos de configuração/metadados elegíveis para Cache-First. */
export function isConfigOrMetadataPath(pathname: string): boolean {
  if (!pathname) return false;
  const clean = pathname.split('?')[0];
  return CONFIG_METADATA_EXACT_SET.has(clean) || CONFIG_METADATA_PATTERN.test(clean);
}

/** Assinatura determinística usada para evitar re-download desnecessário dos arquivos de configuração. */
export function computeConfigMetadataSignature(
  assets: readonly string[] = CONFIG_AND_METADATA_ASSETS,
  version: string = CONFIG_METADATA_VERSION
): string {
  const canonical = Array.from(new Set(assets)).sort((a, b) => a.localeCompare(b));
  return `${version}::${canonical.join('|')}`;
}

export interface WarmConfigMetadataResult {
  skipped: boolean;
  cachedCount: number;
  fetchedCount: number;
  signature: string;
}

/**
 * Aquece o cache dedicado `bp-config-metadata-v1` no primeiro acesso online e
 * solicita ao Service Worker ativo que sincronize apenas se a assinatura mudar
 * ou houver algum arquivo obrigatório faltando no cache.
 */
export async function warmConfigMetadataCache(): Promise<WarmConfigMetadataResult> {
  const signature = computeConfigMetadataSignature(CONFIG_AND_METADATA_ASSETS, CONFIG_METADATA_VERSION);

  if (typeof window === 'undefined' || !('caches' in window)) {
    return { skipped: true, cachedCount: 0, fetchedCount: 0, signature };
  }

  let alreadyUpToDate = false;
  let fetchedCount = 0;
  let cachedCount = 0;

  try {
    const cache = await caches.open(CONFIG_METADATA_CACHE_NAME);

    let storedSignature = '';
    try {
      const metaRes = await cache.match(CONFIG_METADATA_MANIFEST_KEY);
      if (metaRes) {
        const meta = (await metaRes.json()) as { signature?: string };
        if (typeof meta?.signature === 'string') storedSignature = meta.signature;
      }
    } catch {
      /* noop */
    }

    const presence = await Promise.all(
      CONFIG_AND_METADATA_ASSETS.map(async (assetPath) => ({
        assetPath,
        present: Boolean(await cache.match(assetPath)),
      }))
    );
    const missing = presence.filter((item) => !item.present).map((item) => item.assetPath);

    if (storedSignature === signature && missing.length === 0) {
      alreadyUpToDate = true;
      cachedCount = CONFIG_AND_METADATA_ASSETS.length;
    } else if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const toFetch = storedSignature && storedSignature !== signature ? [...CONFIG_AND_METADATA_ASSETS] : missing;
      await Promise.allSettled(
        toFetch.map(async (assetPath) => {
          try {
            const res = await fetch(assetPath, { cache: 'force-cache' });
            if (res && res.ok) {
              await cache.put(assetPath, res.clone());
              fetchedCount += 1;
            }
          } catch {
            /* offline ou indisponível: mantém o que já existe no cache */
          }
        })
      );

      const finalMatches = await Promise.all(CONFIG_AND_METADATA_ASSETS.map((p) => cache.match(p)));
      cachedCount = finalMatches.filter(Boolean).length;

      if (cachedCount === CONFIG_AND_METADATA_ASSETS.length) {
        await cache.put(
          CONFIG_METADATA_MANIFEST_KEY,
          new Response(
            JSON.stringify({
              signature,
              version: CONFIG_METADATA_VERSION,
              assets: [...CONFIG_AND_METADATA_ASSETS],
              updatedAt: Date.now(),
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
    } else {
      cachedCount = CONFIG_AND_METADATA_ASSETS.length - missing.length;
    }
  } catch {
    return { skipped: true, cachedCount: 0, fetchedCount: 0, signature };
  }

  // Notifica o SW somente quando houve ausência ou troca de assinatura
  if (!alreadyUpToDate) {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const target = navigator.serviceWorker?.controller ?? registration?.active;
      target?.postMessage({
        type: 'CACHE_CONFIG_METADATA',
        assets: [...CONFIG_AND_METADATA_ASSETS],
        version: CONFIG_METADATA_VERSION,
      });
    } catch {
      /* noop */
    }
  }

  return {
    skipped: alreadyUpToDate,
    cachedCount,
    fetchedCount,
    signature,
  };
}
