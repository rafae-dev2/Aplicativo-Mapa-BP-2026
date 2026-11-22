import { useCallback, useEffect, useState } from 'react';

interface FetchOptions { retries?: number; retryDelay?: number; timeout?: number; }
interface FetchState<T> { data: T | null; loading: boolean; error: Error | null; retry: () => void; }

/** Tentativas finitas e canceláveis; o botão retry sempre inicia uma nova busca. */
export function useFetchWithRetry<T>(url: string, options: FetchOptions = {}): FetchState<T> {
  const { retries = 1, retryDelay = 800, timeout = 12000 } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestId, setRequestId] = useState(0);
  const retry = useCallback(() => setRequestId(id => id + 1), []);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveDelay: (() => void) | undefined;
    setLoading(true);
    setError(null);
    const run = async () => {
      for (let attempt = 0; attempt <= retries && !cancelled; attempt++) {
        controller = new AbortController();
        const timeoutId = setTimeout(() => controller?.abort(), timeout);
        try {
          const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
          if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
          const result = await response.json() as T;
          if (!cancelled) { setData(result); setLoading(false); }
          return;
        } catch (cause) {
          if (cancelled) return;
          // Sem rede, não gastar mais um timeout inteiro tentando o mesmo recurso.
          if (attempt === retries || navigator.onLine === false) {
            setError(cause instanceof Error ? cause : new Error('Não foi possível carregar o mapa'));
            setLoading(false);
            return;
          }
        } finally { clearTimeout(timeoutId); }
        await new Promise<void>(resolve => {
          resolveDelay = resolve;
          timer = setTimeout(resolve, retryDelay * (attempt + 1));
        });
      }
    };
    void run();
    const onOnline = () => { if (!cancelled) retry(); };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timer);
      resolveDelay?.();
      window.removeEventListener('online', onOnline);
    };
  }, [url, retries, retryDelay, timeout, requestId, retry]);
  return { data, loading, error, retry };
}
