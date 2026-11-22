/**
 * UpdateBanner v90 — Notificação de atualização disponível
 *
 * CORREÇÃO DO PROBLEMA DE DUPLICAÇÃO NO PWA:
 *
 * O problema anterior: o SW enviava SW_UPDATED com retry (0s, 1s, 3s, 6s)
 * E o cliente verificava version.json independentemente. O controllerchange
 * resetava shownRef.current = false, causando 3 exibições consecutivas.
 *
 * SOLUÇÃO v90:
 * - Chave `bp-banner-shown-VERSION` no localStorage: uma vez que o banner
 *   for exibido para uma versão específica, ele NÃO aparece novamente até
 *   que o usuário recarregue ou uma NOVA versão seja detectada.
 * - O SW só envia SW_UPDATED UMA VEZ (sem retry) — o retry foi removido do SW.
 * - O canal 2 (version.json) só exibe o banner se a versão mudou E o banner
 *   ainda não foi mostrado para essa versão.
 * - O visibilitychange e controllerchange NÃO resetam mais o estado de exibição.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { prepareForAppReload } from '@/lib/pwaMaintenance';

interface UpdateInfo {
  type: 'SW_UPDATED' | 'GEOJSON_UPDATED' | 'VERSION_CHANGED';
  version?: string;
  features?: number;
  changelog?: string;
}

const LS_APP_VERSION     = 'bp-app-version';
const LS_GEOJSON_VERSION = 'bp-geojson-version';
const LS_BANNER_SHOWN    = 'bp-banner-shown'; // chave anti-duplicação
const CHECK_INTERVAL_MS  = 5 * 60 * 1000;    // 5 minutos

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed]   = useState(false);
  const intervalRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Verificar se o banner já foi exibido para esta versão ─────────────────
  const wasBannerShown = useCallback((version: string): boolean => {
    return localStorage.getItem(`${LS_BANNER_SHOWN}-${version}`) === '1';
  }, []);

  const markBannerShown = useCallback((version: string) => {
    localStorage.setItem(`${LS_BANNER_SHOWN}-${version}`, '1');
  }, []);

  // ── Mostrar banner (evita duplicatas por versão) ───────────────────────────
  const showBanner = useCallback((info: UpdateInfo) => {
    const version = info.version || 'unknown';

    // Se já mostrou para esta versão, ignorar
    if (wasBannerShown(version)) {
      console.log(`[UpdateBanner] Banner já exibido para v${version} — ignorando.`);
      return;
    }

    markBannerShown(version);
    console.log('[UpdateBanner] Exibindo banner:', info);
    setUpdateInfo(info);
    setDismissed(false);
  }, [wasBannerShown, markBannerShown]);

  // ── CANAL 2: Verificação ativa do version.json ─────────────────────────────
  const checkVersionJson = useCallback(async () => {
    try {
      const res = await fetch('/version.json', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!res.ok) return;

      const data = await res.json();
      const serverAppVersion     = String(data.version || '0');
      const serverGeojsonVersion = String(data.geojsonVersion || data.version || '0');

      const knownAppVersion     = localStorage.getItem(LS_APP_VERSION);
      const knownGeojsonVersion = localStorage.getItem(LS_GEOJSON_VERSION);

      console.log(`[UpdateBanner] version.json — app: ${serverAppVersion} (local: ${knownAppVersion})`);

      // Primeira vez (sem versão local): apenas salvar, não mostrar banner
      if (!knownAppVersion && !knownGeojsonVersion) {
        localStorage.setItem(LS_APP_VERSION, serverAppVersion);
        localStorage.setItem(LS_GEOJSON_VERSION, serverGeojsonVersion);
        console.log('[UpdateBanner] Versão inicial registrada:', serverAppVersion);
        return;
      }

      // GeoJSON atualizado?
      if (knownGeojsonVersion && knownGeojsonVersion !== serverGeojsonVersion) {
        localStorage.setItem(LS_APP_VERSION, serverAppVersion);
        localStorage.setItem(LS_GEOJSON_VERSION, serverGeojsonVersion);
        showBanner({
          type:      'GEOJSON_UPDATED',
          version:   serverGeojsonVersion,
          features:  data.features,
          changelog: data.changelog || '',
        });
        return;
      }

      // App atualizado (novo SW)?
      if (knownAppVersion && knownAppVersion !== serverAppVersion) {
        localStorage.setItem(LS_APP_VERSION, serverAppVersion);
        localStorage.setItem(LS_GEOJSON_VERSION, serverGeojsonVersion);
        showBanner({
          type:    'SW_UPDATED',
          version: serverAppVersion,
          changelog: data.changelog || '',
        });
        return;
      }

      // Tudo igual — atualizar silenciosamente
      localStorage.setItem(LS_APP_VERSION, serverAppVersion);
      localStorage.setItem(LS_GEOJSON_VERSION, serverGeojsonVersion);

    } catch (err) {
      console.warn('[UpdateBanner] Erro ao verificar version.json:', err);
    }
  }, [showBanner]);

  // ── CANAL 1: Escutar postMessage do Service Worker ─────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const { type, version, features, changelog } = event.data || {};

      if (type === 'SW_UPDATED') {
        console.log(`[UpdateBanner] SW_UPDATED recebido: ${version}`);
        const cleanVersion = version ? String(version).replace('v', '') : 'unknown';
        if (cleanVersion !== 'unknown') {
          localStorage.setItem(LS_APP_VERSION, cleanVersion);
        }
        showBanner({ type: 'SW_UPDATED', version: cleanVersion });
      }

      if (type === 'GEOJSON_UPDATED') {
        console.log(`[UpdateBanner] GEOJSON_UPDATED recebido: v${version}`);
        const cleanVersion = version ? String(version) : 'unknown';
        if (cleanVersion !== 'unknown') {
          localStorage.setItem(LS_GEOJSON_VERSION, cleanVersion);
          localStorage.setItem(LS_APP_VERSION, cleanVersion);
        }
        showBanner({ type: 'GEOJSON_UPDATED', version: cleanVersion, features, changelog });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [showBanner]);

  // ── Inicialização: verificar versão imediatamente e depois a cada 5 min ─────
  useEffect(() => {
    const initialTimer = setTimeout(() => { if (navigator.onLine) void checkVersionJson(); }, 15000);
    intervalRef.current = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void checkVersionJson();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkVersionJson]);

  // ── Detectar quando um novo SW assume o controle (PWA) ────────────────────
  // NOTA: NÃO resetamos mais o estado de exibição aqui — apenas verificamos
  // se há nova versão. O showBanner() cuida de não duplicar.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      console.log('[UpdateBanner] controllerchange — verificando versão...');
      checkVersionJson();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, [checkVersionJson]);

  // ── Detectar quando o PWA volta ao foco ───────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[UpdateBanner] App voltou ao foco — verificando...');
        checkVersionJson();
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) reg.update().catch(() => {});
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [checkVersionJson]);

  // ── Recarregamento coordenado: limpa caches de bundles, mas preserva POIs ───
  const reloadWithMaintenance = useCallback(async () => {
    await prepareForAppReload();
    window.location.reload();
  }, []);

  // A atualização é sempre manual: o usuário decide quando recarregar o aplicativo.

  const handleReload = useCallback(() => {
    void reloadWithMaintenance();
  }, [reloadWithMaintenance]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // NÃO resetamos o estado — o banner não reaparece para a mesma versão
  }, []);

  if (!updateInfo || dismissed) return null;

  const isGeojson = updateInfo.type === 'GEOJSON_UPDATED';

  const banner = (
    <div
      className="bp-update-banner"
      role="status"
      aria-live="polite"
      style={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        zIndex:     99999,
        background: isGeojson
          ? 'linear-gradient(135deg, #1a472a 0%, #2d6a4f 100%)'
          : 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        color:      'white',
        padding:    '8px 14px',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap:        10,
        boxShadow:  '0 2px 16px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize:   13,
        flexWrap:   'nowrap',
        paddingTop: 'max(10px, env(safe-area-inset-top, 10px))',
        animation:  'slideInFromTop 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 22 }}>{isGeojson ? '🗺️' : '🔄'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25 }}>
            {isGeojson
              ? `Mapa atualizado${updateInfo.features ? ` · ${updateInfo.features.toLocaleString('pt-BR')} talhões` : ''}`
              : `Nova versão disponível · v${updateInfo.version || '90'}`}
            <div style={{ fontSize: 11, opacity: 0.78, marginTop: 2, fontWeight: 500 }}>
              Toque em Atualizar agora para aplicar.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleReload}
          style={{
            background:   'white',
            color:        isGeojson ? '#1a472a' : '#1e3a5f',
            border:       'none',
            borderRadius: 8,
            padding:      '7px 16px',
            fontWeight:   700,
            fontSize:     13,
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            boxShadow:    '0 1px 4px rgba(0,0,0,0.2)',
          }}
        >
            Atualizar agora
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background:   'transparent',
            color:        'rgba(255,255,255,0.75)',
            border:       '1px solid rgba(255,255,255,0.35)',
            borderRadius: 8,
            padding:      '7px 11px',
            fontSize:     13,
            cursor:       'pointer',
            whiteSpace:   'nowrap',
          }}
          title="Dispensar"
        >
          ✕
        </button>
      </div>
    </div>
  );

  return createPortal(banner, document.body);
}
