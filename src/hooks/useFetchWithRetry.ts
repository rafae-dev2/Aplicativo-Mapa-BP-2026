import { useCallback, useEffect, useRef, useState } from 'react';
import { loadOfflineDataset, saveOfflineDataset } from '@/lib/offlineMapEngine';

interface FetchOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  offlineKey?: string;
}

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  source: 'none' | 'indexeddb' | 'network';
  retry: () => void;
}

function deriveOfflineKey(url: string, explicitKey?: string): string {
  if (explicitKey) return explicitKey;
  const clean = url.split('?')[0].replace(/^\/+/, '').replace(/[^a-z0-9-_]+/gi, '-');
  return clean || 'dataset';
}

/**
 * Carregamento resiliente com hidratação imediata via IndexedDB (stale-while-revalidate).
 *
 * - Ao abrir o app ou retornar de instabilidade de rede, carrega primeiro a cópia
 *   persistida no IndexedDB em poucos milissegundos — sem bloquear o mapa esperando
 *   timeout de rede lenta na roça.
 * - Quando online, revalida silenciosamente em segundo plano sem apagar os dados
 *   já renderizados e atualiza o IndexedDB para a próxima abertura offline.
 */
export function useFetchWithRetry<T>(url: string, options: FetchOptions = {}): FetchState<T> {
  const { retries = 1, retryDelay = 800, timeout = 12000, offlineKey } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [source, setSource] = useState<'none' | 'indexeddb' | 'network'>('none');
  const [requestId, setRequestId] = useState(0);
  const hasDataRef = useRef(false);
  const retry = useCallback(() => setRequestId((id) => id + 1), []);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveDelay: (() => void) | undefined;
    const storageKey = deriveOfflineKey(url, offlineKey);

    if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);

    const run = async () => {
      // 1. Hidratação imediata do IndexedDB (tanto offline quanto em rede instável)
      let hydratedFromIdb = hasDataRef.current;
      try {
        const cached = await loadOfflineDataset<T>(storageKey);
        if (cached && !cancelled) {
          hasDataRef.current = true;
          hydratedFromIdb = true;
          setData(cached);
          setSource((prev) => (prev === 'network' ? prev : 'indexeddb'));
          setLoading(false);
        }
      } catch {
        /* segue para rede */
      }

      // Sem internet: se já hidratamos do IndexedDB, encerramos imediatamente sem erros
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!hydratedFromIdb && !cancelled) {
          setError(new Error('Sem conexão e sem cópia local do mapa salva neste aparelho.'));
          setLoading(false);
        }
        return;
      }

      // 2. Revalidação / primeira carga via rede (nunca limpa dados já hidratados)
      for (let attempt = 0; attempt <= retries && !cancelled; attempt++) {
        controller = new AbortController();
        const timeoutId = setTimeout(() => controller?.abort(), timeout);
        try {
          const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
          if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
          const result = (await response.json()) as T;
          if (!cancelled) {
            hasDataRef.current = true;
            setData(result);
            setSource('network');
            setLoading(false);
            setError(null);
          }
          void saveOfflineDataset(storageKey, result);
          return;
        } catch (cause) {
          if (cancelled) return;
          if (attempt === retries || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
            if (!hydratedFromIdb) {
              const fallback = await loadOfflineDataset<T>(storageKey);
              if (fallback && !cancelled) {
                hasDataRef.current = true;
                setData(fallback);
                setSource('indexeddb');
                setLoading(false);
                return;
              }
              setError(cause instanceof Error ? cause : new Error('Não foi possível carregar o mapa'));
              setLoading(false);
            }
            return;
          }
        } finally {
          clearTimeout(timeoutId);
        }
        await new Promise<void>((resolve) => {
          resolveDelay = resolve;
          timer = setTimeout(resolve, retryDelay * (attempt + 1));
        });
      }
    };

    void run();
    const onOnline = () => {
      if (!cancelled) retry();
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timer);
      resolveDelay?.();
      window.removeEventListener('online', onOnline);
    };
  }, [url, retries, retryDelay, timeout, offlineKey, requestId, retry]);

  return { data, loading, error, source, retry };
}
