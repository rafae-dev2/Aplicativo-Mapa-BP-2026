/**
 * networkQualityMonitor — Utilitário de monitoramento de performance e qualidade
 * de conexão (Network Information API + amostragem real de RTT/latência).
 *
 * Detecta transições de rede (ex.: 4G → Wi-Fi, Wi-Fi → 3G/2G) e identifica
 * períodos de latência instável para pausar automaticamente o envio em lote
 * (batch) da fila IndexedDB, avisando o usuário e retomando automaticamente
 * assim que a conexão estabilizar.
 */

export type ConnectionQualityTier = 'offline' | 'unstable' | 'degraded' | 'good';

export interface RawNetworkInfo {
  online: boolean;
  type?: string; // 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown'
  effectiveType?: string; // 'slow-2g' | '2g' | '3g' | '4g'
  rtt?: number; // ms
  downlink?: number; // Mbps
  saveData?: boolean;
}

export interface LatencySample {
  rttMs: number;
  ok: boolean;
  timestamp: number;
}

export interface NetworkTransition {
  fromLabel: string;
  toLabel: string;
  fromTier: ConnectionQualityTier;
  toTier: ConnectionQualityTier;
  timestamp: number;
}

export interface NetworkQualityState {
  online: boolean;
  tier: ConnectionQualityTier;
  connectionLabel: string;
  effectiveType: string;
  connectionType: string;
  rttMs: number | null;
  downlinkMbps: number | null;
  saveData: boolean;
  shouldPauseSync: boolean;
  pauseReason: string | null;
  lastTransition: NetworkTransition | null;
  updatedAt: number;
}

export const LATENCY_THRESHOLDS = {
  /** RTT acima deste valor (ms) classifica latência como instável e pausa sync automático. */
  UNSTABLE_RTT_MS: 1800,
  /** RTT acima deste valor (ms) classifica a conexão como degradada (alerta leve). */
  DEGRADED_RTT_MS: 800,
  /** Oscilação (diferença pico-vale entre amostras recentes) que indica rede instável. */
  UNSTABLE_JITTER_MS: 1200,
  /** Downlink (Mbps) extremamente baixo combinado com RTT elevado indica risco de timeout. */
  VERY_LOW_DOWNLINK_MBPS: 0.25,
  /** Falhas consecutivas recentes de ping/rede que indicam instabilidade ativa. */
  CONSECUTIVE_FAILURES_FOR_UNSTABLE: 2,
  /** Janela de validade para amostras recentes de latência (ms). */
  SAMPLE_WINDOW_MS: 90_000,
} as const;

/** Formata rótulo legível do tipo de conexão (ex.: "Wi-Fi", "4G", "3G", "Ethernet"). */
export function formatConnectionLabel(info: Pick<RawNetworkInfo, 'online' | 'type' | 'effectiveType'>): string {
  if (!info.online) return 'Offline';
  const rawType = (info.type || '').toLowerCase();
  const eff = (info.effectiveType || '').toLowerCase();

  if (rawType === 'wifi') return 'Wi-Fi';
  if (rawType === 'ethernet') return 'Ethernet';
  if (rawType === 'none') return 'Offline';

  if (eff === 'slow-2g') return '2G Lento';
  if (eff === '2g') return '2G';
  if (eff === '3g') return '3G';
  if (eff === '4g') return rawType === 'cellular' ? '4G' : '4G / Banda Larga';

  if (rawType === 'cellular') return 'Rede Móvel';
  return 'Online';
}

/**
 * Avalia de forma determinística e pura a qualidade atual da conexão com base
 * nos metadados do navegador + amostras reais de RTT/falhas.
 */
export function evaluateConnectionQuality(
  info: RawNetworkInfo,
  recentSamples: readonly LatencySample[] = [],
  now = Date.now(),
  previousTransition: NetworkTransition | null = null
): NetworkQualityState {
  const connectionLabel = formatConnectionLabel(info);
  const effectiveType = (info.effectiveType || 'unknown').toLowerCase();
  const connectionType = (info.type || 'unknown').toLowerCase();
  const saveData = Boolean(info.saveData);
  const downlinkMbps = typeof info.downlink === 'number' && Number.isFinite(info.downlink) ? info.downlink : null;

  if (!info.online) {
    return {
      online: false,
      tier: 'offline',
      connectionLabel: 'Offline',
      effectiveType,
      connectionType,
      rttMs: null,
      downlinkMbps,
      saveData,
      shouldPauseSync: false,
      pauseReason: null,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  // Considera apenas amostras dentro da janela recente
  const freshSamples = recentSamples.filter((s) => now - s.timestamp <= LATENCY_THRESHOLDS.SAMPLE_WINDOW_MS);
  const okRtts = freshSamples.filter((s) => s.ok && Number.isFinite(s.rttMs)).map((s) => s.rttMs);
  const measuredAvgRtt =
    okRtts.length > 0 ? Math.round(okRtts.reduce((acc, v) => acc + v, 0) / okRtts.length) : null;
  const measuredJitter =
    okRtts.length >= 2 ? Math.round(Math.max(...okRtts) - Math.min(...okRtts)) : 0;

  let consecutiveFailures = 0;
  for (let i = freshSamples.length - 1; i >= 0; i -= 1) {
    if (!freshSamples[i].ok) consecutiveFailures += 1;
    else break;
  }

  const browserRtt = typeof info.rtt === 'number' && Number.isFinite(info.rtt) && info.rtt > 0 ? info.rtt : null;
  const effectiveRtt =
    measuredAvgRtt !== null && browserRtt !== null
      ? Math.max(measuredAvgRtt, browserRtt)
      : (measuredAvgRtt ?? browserRtt);

  // 1. Condições de latência instável → pausa sincronização automática
  if (effectiveType === 'slow-2g') {
    return {
      online: true,
      tier: 'unstable',
      connectionLabel,
      effectiveType,
      connectionType,
      rttMs: effectiveRtt,
      downlinkMbps,
      saveData,
      shouldPauseSync: true,
      pauseReason: `Conexão ${connectionLabel} com velocidade crítica — sincronização pausada automaticamente`,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  if (effectiveRtt !== null && effectiveRtt >= LATENCY_THRESHOLDS.UNSTABLE_RTT_MS) {
    return {
      online: true,
      tier: 'unstable',
      connectionLabel,
      effectiveType,
      connectionType,
      rttMs: effectiveRtt,
      downlinkMbps,
      saveData,
      shouldPauseSync: true,
      pauseReason: `Latência instável em ${connectionLabel} (${effectiveRtt} ms) — sincronização pausada automaticamente`,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  if (measuredJitter >= LATENCY_THRESHOLDS.UNSTABLE_JITTER_MS) {
    return {
      online: true,
      tier: 'unstable',
      connectionLabel,
      effectiveType,
      connectionType,
      rttMs: effectiveRtt,
      downlinkMbps,
      saveData,
      shouldPauseSync: true,
      pauseReason: `Oscilação alta de latência em ${connectionLabel} (variação de ${measuredJitter} ms)`,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  if (consecutiveFailures >= LATENCY_THRESHOLDS.CONSECUTIVE_FAILURES_FOR_UNSTABLE) {
    return {
      online: true,
      tier: 'unstable',
      connectionLabel,
      effectiveType,
      connectionType,
      rttMs: effectiveRtt,
      downlinkMbps,
      saveData,
      shouldPauseSync: true,
      pauseReason: `Falhas intermitentes consecutivas em ${connectionLabel} — aguardando estabilização`,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  if (
    effectiveType === '2g' &&
    downlinkMbps !== null &&
    downlinkMbps <= LATENCY_THRESHOLDS.VERY_LOW_DOWNLINK_MBPS
  ) {
    return {
      online: true,
      tier: 'unstable',
      connectionLabel,
      effectiveType,
      connectionType,
      rttMs: effectiveRtt,
      downlinkMbps,
      saveData,
      shouldPauseSync: true,
      pauseReason: `Sinal ${connectionLabel} muito fraco (${downlinkMbps.toFixed(2)} Mbps)`,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  // 2. Condição degradada (alerta apenas no console, sem pausar)
  if (
    effectiveType === '2g' ||
    effectiveType === '3g' ||
    (effectiveRtt !== null && effectiveRtt >= LATENCY_THRESHOLDS.DEGRADED_RTT_MS)
  ) {
    return {
      online: true,
      tier: 'degraded',
      connectionLabel,
      effectiveType,
      connectionType,
      rttMs: effectiveRtt,
      downlinkMbps,
      saveData,
      shouldPauseSync: false,
      pauseReason: null,
      lastTransition: previousTransition,
      updatedAt: now,
    };
  }

  // 3. Conexão saudável
  return {
    online: true,
    tier: 'good',
    connectionLabel,
    effectiveType,
    connectionType,
    rttMs: effectiveRtt,
    downlinkMbps,
    saveData,
    shouldPauseSync: false,
    pauseReason: null,
    lastTransition: previousTransition,
    updatedAt: now,
  };
}

interface NavigatorConnectionLike extends EventTarget {
  type?: string;
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
}

function getBrowserConnection(): NavigatorConnectionLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    mozConnection?: NavigatorConnectionLike;
    webkitConnection?: NavigatorConnectionLike;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function readBrowserNetworkInfo(): RawNetworkInfo {
  const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const conn = getBrowserConnection();
  return {
    online,
    type: conn?.type,
    effectiveType: conn?.effectiveType,
    rtt: typeof conn?.rtt === 'number' ? conn.rtt : undefined,
    downlink: typeof conn?.downlink === 'number' ? conn.downlink : undefined,
    saveData: Boolean(conn?.saveData),
  };
}

function logNetworkQualityEvent(
  level: 'transition' | 'paused' | 'recovered',
  message: string,
  details: Record<string, unknown>
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const styles: Record<typeof level, string> = {
    transition: 'background:#1e3a5f;color:#bae6fd;font-weight:700;padding:2px 6px;border-radius:4px;',
    paused: 'background:#7c2d12;color:#fed7aa;font-weight:700;padding:2px 6px;border-radius:4px;',
    recovered: 'background:#14532d;color:#bbf7d0;font-weight:700;padding:2px 6px;border-radius:4px;',
  };
  const logger = level === 'paused' ? console.warn : console.info;
  logger(`%c[NetworkQuality]%c ${message}`, styles[level], 'color:inherit;font-weight:600;', details);
}

class NetworkQualityMonitor {
  private state: NetworkQualityState;
  private samples: LatencySample[] = [];
  private listeners = new Set<(state: NetworkQualityState) => void>();
  private overrideInfo: Partial<RawNetworkInfo> | null = null;
  private started = false;

  constructor() {
    this.state = evaluateConnectionQuality(readBrowserNetworkInfo(), []);
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    const refresh = () => this.evaluate('browser-event');
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);

    const conn = getBrowserConnection();
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', refresh);
    }
  }

  getState(): NetworkQualityState {
    return { ...this.state };
  }

  subscribe(listener: (state: NetworkQualityState) => void): () => void {
    this.start();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  recordLatencySample(rttMs: number, ok: boolean): NetworkQualityState {
    const now = Date.now();
    this.samples.push({ rttMs: Math.max(0, Math.round(rttMs)), ok, timestamp: now });
    // Mantém somente as últimas 10 amostras recentes
    if (this.samples.length > 10) {
      this.samples = this.samples.slice(-10);
    }
    return this.evaluate('latency-sample');
  }

  clearSamples(): void {
    this.samples = [];
  }

  /**
   * Permite simular mudanças de qualidade de rede (ex.: 4G → Wi-Fi ou latência
   * instável) em testes automatizados e depuração sem alterar o app em produção.
   */
  simulateQualityChange(override: Partial<RawNetworkInfo> | null): NetworkQualityState {
    this.overrideInfo = override;
    if (override === null) {
      this.samples = [];
    } else if (override.rtt !== undefined && override.rtt < LATENCY_THRESHOLDS.DEGRADED_RTT_MS) {
      // Limpa amostras ruins antigas ao simular recuperação explícita de rede (ex.: entrada em Wi-Fi)
      this.samples = [];
    }
    return this.evaluate('simulated');
  }

  evaluate(source: 'browser-event' | 'latency-sample' | 'simulated' | 'manual' = 'manual'): NetworkQualityState {
    const prev = this.state;
    const raw = readBrowserNetworkInfo();
    const merged: RawNetworkInfo = this.overrideInfo ? { ...raw, ...this.overrideInfo } : raw;

    const now = Date.now();
    const candidate = evaluateConnectionQuality(merged, this.samples, now, prev.lastTransition);

    const labelChanged = prev.connectionLabel !== candidate.connectionLabel;
    const tierChanged = prev.tier !== candidate.tier;

    let nextState = candidate;
    if (labelChanged || tierChanged) {
      const transition: NetworkTransition = {
        fromLabel: prev.connectionLabel,
        toLabel: candidate.connectionLabel,
        fromTier: prev.tier,
        toTier: candidate.tier,
        timestamp: now,
      };
      nextState = { ...candidate, lastTransition: transition };

      if (labelChanged) {
        logNetworkQualityEvent(
          candidate.shouldPauseSync ? 'paused' : 'transition',
          `Mudança de conexão detectada: ${transition.fromLabel} → ${transition.toLabel}`,
          {
            source,
            from: transition.fromLabel,
            to: transition.toLabel,
            tier: candidate.tier,
            rttMs: candidate.rttMs,
            downlinkMbps: candidate.downlinkMbps,
            shouldPauseSync: candidate.shouldPauseSync,
          }
        );
      } else if (!prev.shouldPauseSync && candidate.shouldPauseSync) {
        logNetworkQualityEvent('paused', candidate.pauseReason || 'Sincronização pausada por latência instável', {
          source,
          connectionLabel: candidate.connectionLabel,
          rttMs: candidate.rttMs,
        });
      } else if (prev.shouldPauseSync && !candidate.shouldPauseSync && candidate.online) {
        logNetworkQualityEvent(
          'recovered',
          `Conexão estabilizada (${candidate.connectionLabel}) — sincronização liberada para retomada`,
          {
            source,
            connectionLabel: candidate.connectionLabel,
            rttMs: candidate.rttMs,
          }
        );
      }
    }

    this.state = nextState;

    if (
      labelChanged ||
      tierChanged ||
      prev.shouldPauseSync !== nextState.shouldPauseSync ||
      prev.pauseReason !== nextState.pauseReason
    ) {
      const copy = { ...nextState };
      this.listeners.forEach((listener) => {
        try {
          listener(copy);
        } catch {
          /* noop */
        }
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bp-network-quality-change', { detail: copy }));
      }
    }

    return { ...this.state };
  }
}

export const networkQualityMonitor = new NetworkQualityMonitor();

if (typeof window !== 'undefined') {
  networkQualityMonitor.start();
  (window as unknown as Record<string, unknown>).__BP_NET_QUALITY__ = networkQualityMonitor;
}
