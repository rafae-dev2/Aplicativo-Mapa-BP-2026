/**
 * supabaseClient — Cliente Supabase para o banco de dados em tempo real.
 *
 * Utiliza a configuração pública anon do projeto existente. Esta atualização
 * não altera políticas de acesso nem o esquema do banco. Veja
 * LEIA-ME-ATUALIZACAO-v189.md para configurar o deploy sem expor service_role.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __BP_RUNTIME_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

const runtimeConfig = typeof window !== 'undefined' ? (window.__BP_RUNTIME_CONFIG__ || {}) : {};
const configuredSupabaseUrl = String(
  runtimeConfig.supabaseUrl || (import.meta as any).env?.VITE_SUPABASE_URL || ''
).trim();
const configuredSupabaseAnonKey = String(
  runtimeConfig.supabaseAnonKey || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''
).trim();

function isUsableSupabaseConfig(url: string, key: string): boolean {
  return /^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(url)
    && key.length >= 100
    && key.split('.').length === 3;
}

const hasSupabaseConfig = isUsableSupabaseConfig(configuredSupabaseUrl, configuredSupabaseAnonKey);
// O cliente precisa de valores sintaticamente válidos para ser criado mesmo
// quando a implantação ainda não recebeu as variáveis. As guardas
// SUPABASE_ENABLED impedem qualquer chamada com estes valores locais.
const SUPABASE_URL = hasSupabaseConfig ? configuredSupabaseUrl : 'https://offline-placeholder.supabase.co';
const SUPABASE_ANON_KEY = hasSupabaseConfig
  ? configuredSupabaseAnonKey
  : 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJvZmZsaW5lLXBsYWNlaG9sZGVyIn0.';

const REQUEST_TIMEOUT_MS = 15_000;
const fetchWithTimeout: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const requestInit = init ?? {};
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const signal = requestInit.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([requestInit.signal, controller.signal])
      : controller.signal;
    return await fetch(input, { ...requestInit, signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

// Sem fallback inválido: se o build não recebeu o .env, o app informa offline
// rapidamente em vez de entrar em retry infinito com uma chave rejeitada.
export const SUPABASE_ENABLED = hasSupabaseConfig;
export const POIS_TABLE = 'pois';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
