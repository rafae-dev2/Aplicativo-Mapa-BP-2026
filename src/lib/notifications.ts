import { SUPABASE_ENABLED, supabase } from './supabaseClient';
import { getDeviceId } from './poiService';
import type { POI } from '@/components/POIManager';

export type CriticalCategory = 'incendio' | 'perigo' | 'queimada';
export type NotificationPermissionState = 'unsupported' | 'default' | 'denied' | 'granted';

const CRITICAL_CATEGORIES: CriticalCategory[] = ['incendio', 'perigo', 'queimada'];
const NOTIFICATION_CONFIG_KEY = '__BP_NOTIFICATION_CONFIG__';

interface NotificationRuntimeConfig {
  vapidPublicKey?: string;
}

declare global {
  interface Window {
    __BP_NOTIFICATION_CONFIG__?: NotificationRuntimeConfig;
  }
}

function getRuntimeConfig(): NotificationRuntimeConfig {
  if (typeof window === 'undefined') return {};
  return window[NOTIFICATION_CONFIG_KEY] || {};
}

export function isCriticalCategory(category?: string): category is CriticalCategory {
  return Boolean(category && CRITICAL_CATEGORIES.includes(category as CriticalCategory));
}

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value.replace(/-/g, '+').replace(/_/g, '/')}${padding}`;
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map((character) => character.charCodeAt(0)));
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export interface NotificationSetupResult {
  ok: boolean;
  permission: NotificationPermissionState;
  remote: boolean;
  message: string;
}

/**
 * Solicita a permissão em uma ação explícita do usuário e registra o endpoint
 * do aparelho para que uma Edge Function possa enviar alertas em segundo plano.
 */
export async function enableCriticalNotifications(): Promise<NotificationSetupResult> {
  const supported = getNotificationPermission();
  if (supported === 'unsupported') {
    return { ok: false, permission: supported, remote: false, message: 'Este navegador não oferece notificações.' };
  }

  let permission: NotificationPermissionState = supported;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      permission,
      remote: false,
      message: permission === 'denied'
        ? 'As notificações foram bloqueadas neste navegador. Habilite-as nas configurações do site.'
        : 'A permissão de notificações não foi concedida.',
    };
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) {
    return { ok: true, permission, remote: false, message: 'Notificações locais habilitadas neste navegador.' };
  }

  const publicKey = getRuntimeConfig().vapidPublicKey?.trim();
  if (!publicKey) {
    return { ok: true, permission, remote: false, message: 'Notificações locais habilitadas; chave de entrega ainda não configurada.' };
  }

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey) as BufferSource,
      });
    }

    const subscriptionJson = subscription.toJSON();
    if (!subscriptionJson.endpoint || !subscriptionJson.keys) {
      return { ok: false, permission, remote: false, message: 'O navegador não retornou uma inscrição push válida.' };
    }

    if (!SUPABASE_ENABLED) {
      return { ok: true, permission, remote: false, message: 'Notificações locais habilitadas. Conecte o Supabase para alertas em outros aparelhos.' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: subscriptionJson.endpoint,
      subscription_json: subscriptionJson,
      device_id: getDeviceId(),
      user_agent: navigator.userAgent.slice(0, 500),
      enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

    if (error) {
      console.warn('[notifications] Não foi possível registrar o aparelho:', error.message);
      return { ok: true, permission, remote: false, message: 'Notificações locais habilitadas; o registro remoto ainda precisa ser configurado.' };
    }

    return { ok: true, permission, remote: true, message: 'Alertas de incêndio e perigo habilitados neste aparelho.' };
  } catch (error) {
    console.warn('[notifications] Falha ao habilitar push:', error);
    return { ok: true, permission, remote: false, message: 'Notificações locais habilitadas, mas o registro remoto falhou.' };
  }
}

/** Mostra o alerta imediatamente quando o realtime entrega uma marcação crítica. */
export async function notifyCriticalPoi(poi: POI): Promise<void> {
  if (!isCriticalCategory(poi.category) || getNotificationPermission() !== 'granted') return;
  const registration = await getServiceWorkerRegistration();
  if (!registration) return;

  const label = poi.category === 'perigo' ? 'PERIGO' : poi.category === 'queimada' ? 'ÁREA QUEIMADA' : 'INCÊNDIO';
  const location = poi.fundo || poi.talhao
    ? `Fundo ${poi.fundo || 'N/A'} · Talhão ${poi.talhao || 'N/A'}`
    : `${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}`;
  const url = `/?poi=${encodeURIComponent(poi.id)}&lat=${poi.lat.toFixed(6)}&lng=${poi.lng.toFixed(6)}&fundo=${encodeURIComponent(poi.fundo || '')}&talhao=${encodeURIComponent(poi.talhao || '')}`;

  await registration.showNotification(`ALERTA DE ${label}`, {
    body: `${poi.title || label} · ${location}${poi.message ? `\n${poi.message}` : ''}`,
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-96.png',
    tag: `critical-poi-${poi.id}`,
    requireInteraction: true,
    data: { url, poiId: poi.id, lat: poi.lat, lng: poi.lng },
    ...( { renotify: true } as Record<string, unknown> ),
  } as NotificationOptions);
}
