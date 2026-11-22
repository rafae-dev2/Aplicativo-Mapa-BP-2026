/**
 * ShareModal v112 — Modal de compartilhamento de localização com Glass Liquid
 * Design dark moderno com glassmorphism, igual ao modal dos mapas
 */

import { useState } from 'react';
import { X, MessageCircle, MapPin, Copy, Check, ExternalLink, Share2 } from 'lucide-react';
import { POI } from './POIManager';
import { CATEGORY_MAP, ALERT_CATEGORIES } from './POIManager';
import { encodeUtf8Base64 } from '@/lib/base64';

const TRANSPORT_LABELS: Record<string, string> = {
  insumos: 'Insumos (outros)', torta: 'Torta', esterco: 'Esterco', calcario: 'Calcário', gesso: 'Gesso', composto: 'Composto', adubo: 'Adubo', reativo_bigbag: 'Reativo BigBag',
};

interface ShareModalProps {
  fundo: string | number;
  talhao: string | number;
  zona?: string;
  lng?: number;
  lat?: number;
  pois?: POI[];
  farmName?: string;
  onClose: () => void;
}

const APP_URL = 'https://mapasbrancoperes.netlify.app';

export default function ShareModal({ fundo, talhao, zona, lng, lat, pois, farmName, onClose }: ShareModalProps) {
  const [copied, setCopied]       = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const isUnmarkedArea = Number(fundo) === 0 && Number(talhao) === 0;

  const closeWithAnimation = () => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, 300);
  };

  // Gerar URL canônica: uma marcação existente recebe poiId e coordenadas,
  // evitando que o aparelho receptor tente inserir novamente o mesmo ID.
  let appShareUrl = '';
  const primaryPoi = pois && pois.length === 1 ? pois[0] : null;
  if (primaryPoi) {
    const sharedPoi = {
      id: primaryPoi.id,
      lat: primaryPoi.lat,
      lng: primaryPoi.lng,
      title: primaryPoi.title,
      description: primaryPoi.description,
      category: primaryPoi.category,
      type: primaryPoi.type,
      message: primaryPoi.message,
      fundo: primaryPoi.fundo,
      talhao: primaryPoi.talhao,
      implementoAgr: primaryPoi.implementoAgr,
      transportMaterial: primaryPoi.transportMaterial,
      transportFormula: primaryPoi.transportFormula,
      transportQuantity: primaryPoi.transportQuantity,
      transportUnit: primaryPoi.transportUnit,
      transportTrips: primaryPoi.transportTrips,
      createdAt: primaryPoi.createdAt,
    };
    const params = new URLSearchParams({
      poi: primaryPoi.id,
      lat: primaryPoi.lat.toFixed(6),
      lng: primaryPoi.lng.toFixed(6),
      fundo: String(primaryPoi.fundo || fundo || ''),
      talhao: String(primaryPoi.talhao || talhao || ''),
      poiData: encodeUtf8Base64(JSON.stringify(sharedPoi)),
    });
    appShareUrl = `${APP_URL}/?${params.toString()}`;
  } else if (pois && pois.length > 0) {
    // Compartilhar vários POIs — manter formato legado, agora com UTF-8 seguro.
    const poisForShare = pois.map(poi => ({
      id: poi.id,
      lat: poi.lat,
      lng: poi.lng,
      title: poi.title,
      description: poi.description,
      category: poi.category,
      type: poi.type,
      message: poi.message,
      fundo: poi.fundo,
      talhao: poi.talhao,
      implementoAgr: poi.implementoAgr,
      transportMaterial: poi.transportMaterial,
      transportFormula: poi.transportFormula,
      transportQuantity: poi.transportQuantity,
        transportUnit: poi.transportUnit,
        transportTrips: poi.transportTrips,
      createdAt: poi.createdAt,
    }));
    const poisEncoded = encodeUtf8Base64(JSON.stringify(poisForShare));
    appShareUrl = `${APP_URL}/?pois=${poisEncoded}`;
  } else if (isUnmarkedArea) {
    appShareUrl = (lat !== undefined && lng !== undefined
      ? `${APP_URL}/?lat=${lat?.toFixed(6)}&lng=${lng?.toFixed(6)}`
      : APP_URL);
  } else {
    if (pois && pois.length > 0) {
      const poisForShare = pois.map(poi => ({
        id: poi.id,
        lat: poi.lat,
        lng: poi.lng,
        title: poi.title,
        description: poi.description,
        category: poi.category,
        type: poi.type,
        message: poi.message,
        fundo: poi.fundo,
        talhao: poi.talhao,
        implementoAgr: poi.implementoAgr,
        transportMaterial: poi.transportMaterial,
        transportFormula: poi.transportFormula,
        transportQuantity: poi.transportQuantity,
        transportUnit: poi.transportUnit,
        transportTrips: poi.transportTrips,
        createdAt: poi.createdAt,
      }));
      const poisEncoded = encodeUtf8Base64(JSON.stringify(poisForShare));
      appShareUrl = `${APP_URL}/?fundo=${fundo}&talhao=${talhao}&pois=${poisEncoded}`;
    } else {
      appShareUrl = `${APP_URL}/?fundo=${fundo}&talhao=${talhao}`;
    }
  }

  const googleMapsUrl = (lng !== undefined && lat !== undefined)
    ? `https://www.google.com/maps/search/?api=1&query=${lat?.toFixed(6)},${lng?.toFixed(6)}`
    : null;

  const firstPoi      = pois && pois.length > 0 ? pois[0] : null;
  const isIncendio    = firstPoi?.category === 'incendio';
  const isAlert       = firstPoi ? ALERT_CATEGORIES.includes(firstPoi.category) : false;
  const hasPhoto      = Boolean((firstPoi as any)?.photo);
  const customMessage = firstPoi?.message || null;
  const implementoAgr = firstPoi?.implementoAgr || null;
  const transportMaterial = firstPoi?.transportMaterial || null;
  const transportFormula = firstPoi?.transportFormula || null;
  const transportQuantity = firstPoi?.transportQuantity ?? null;
  const transportUnit = firstPoi?.transportUnit || (transportMaterial === 'reativo_bigbag' ? 'bigbags' : transportMaterial ? 'toneladas' : null);
  const transportTrips = firstPoi?.transportTrips || [];
  const transportDelivered = transportUnit
    ? transportTrips.filter((trip) => trip.unit === transportUnit).reduce((sum, trip) => sum + Number(trip.weight || 0), 0)
    : 0;
  const transportRemaining = transportQuantity != null ? Math.max(Number(transportQuantity) - transportDelivered, 0) : null;
  const transportOverage = transportQuantity != null ? Math.max(transportDelivered - Number(transportQuantity), 0) : 0;
  const transportLabel = transportMaterial
    ? (CATEGORY_MAP.transporte_insumo ? (TRANSPORT_LABELS[transportMaterial] || transportMaterial) : transportMaterial)
    : null;
  const catInfo       = firstPoi ? (CATEGORY_MAP[firstPoi.category] || CATEGORY_MAP.marcacao) : null;
  const accentColor   = catInfo?.color || '#ADFF2F';

  // ── Texto WhatsApp ──────────────────────────────────────────────────────────
  let shareText = `🗺️ *MAPAS BRANCO PERES*\n`;
  if (isAlert && catInfo) {
    shareText += `\n${catInfo.emoji} *ALERTA: ${catInfo.title}*\n`;
    if (firstPoi?.description) shareText += `${firstPoi.description}\n`;
  } else if (firstPoi && !isUnmarkedArea) {
    shareText += `\n${catInfo?.emoji || '📍'} *${firstPoi.title || catInfo?.title || 'Localização'}*\n`;
    shareText += `🏷️ Fundo: *${fundo}*\n`;
    shareText += `🏷️ Talhão: *${talhao}*\n`;
    if (zona && zona !== 'N/A') shareText += `🌍 Zona: *${zona}*\n`;
  } else if (isUnmarkedArea) {
    shareText += `\n${catInfo?.emoji || '📍'} *Localização Personalizada*\n`;
  } else {
    shareText += `\n📍 *Localização da Fazenda*\n`;
    if (farmName) shareText += `🏡 Fazenda: *${farmName}*\n`;
    shareText += `🏷️ Fundo: *${fundo}*\n`;
    shareText += `🏷️ Talhão: *${talhao}*\n`;
    if (zona && zona !== 'N/A') shareText += `🌍 Zona: *${zona}*\n`;
  }
  if (lat !== undefined && lng !== undefined) {
    shareText += `\n📌 Coordenadas: ${lat?.toFixed(5)}, ${lng?.toFixed(5)}\n`;
  }
  if (hasPhoto) {
    shareText += `\n📷 *Foto anexada* — abra o link do app para visualizar\n`;
  }
  if (implementoAgr) {
    shareText += `\n🚜 *Nome Implemento Agr.:* ${implementoAgr}\n`;
  }
  if (transportLabel && transportQuantity != null) {
    shareText += `\n🚚 *Transporte de insumo:* ${transportLabel}\n`;
    shareText += `📦 *Carga planejada:* ${transportQuantity} ${transportUnit === 'bigbags' ? 'BigBags' : 'toneladas'}\n`;
    if (transportFormula && transportMaterial === 'adubo') shareText += `🧪 *Fórmula do Adubo:* ${transportFormula}\n`;
    if (transportTrips.length > 0) {
      shareText += transportOverage > 0
        ? `⚠️ *Entregue:* ${transportDelivered} ${transportUnit === 'bigbags' ? 'BigBags' : 't'} · *Passou:* ${transportOverage} ${transportUnit === 'bigbags' ? 'BigBags' : 't'}\n`
        : `✅ *Entregue:* ${transportDelivered} ${transportUnit === 'bigbags' ? 'BigBags' : 't'} · *Falta:* ${transportRemaining} ${transportUnit === 'bigbags' ? 'BigBags' : 't'}\n`;
      shareText += `🚛 *Viagens registradas:* ${transportTrips.length}\n`;
      transportTrips.slice(-5).forEach((trip, index) => {
        shareText += `  ${index + 1}. ${trip.weight} ${trip.unit === 'bigbags' ? 'BigBags' : 't'} · ${trip.fleet || 'Frota não informada'}\n`;
      });
    }
  }
  if (customMessage) {
    shareText += `\n💬 *Mensagem:*\n"${customMessage}"\n`;
  }
  if (pois && pois.length > 0) {
    shareText += `\n📌 *POIs Compartilhados:* ${pois.length}\n`;
    pois.slice(0, 3).forEach((poi, idx) => {
      const implementoInfo = poi.implementoAgr ? ` - ${poi.implementoAgr}` : '';
      shareText += `  ${idx + 1}. ${poi.category}${implementoInfo} - ${poi.lat?.toFixed(4)}, ${poi.lng?.toFixed(4)}\n`;
    });
    if (pois.length > 3) shareText += `  ... e mais ${pois.length - 3}\n`;
  }
  shareText += `\n🔗 *Ver no app:*\n${appShareUrl}\n`;
  if (googleMapsUrl) {
    shareText += `\n🗺️ *Google Maps:*\n${googleMapsUrl}`;
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleWhatsApp = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    if (navigator.share) {
      navigator.share({ title: 'MAPAS BRANCO PERES', text: shareText, url: appShareUrl })
        .catch((err) => { if (err.name !== 'AbortError') window.open(whatsappUrl, '_blank'); });
    } else {
      window.open(whatsappUrl, '_blank');
    }
    closeWithAnimation();
  };

  const handleGoogleMaps = () => {
    if (googleMapsUrl) window.open(googleMapsUrl, '_blank');
    closeWithAnimation();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(appShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(shareText);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  return (
    <div className={`bp-modal-backdrop bp-share-modal-backdrop ${isClosing ? 'is-closing' : ''}`} style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'radial-gradient(circle at 50% 20%, rgba(173,255,47,0.10), transparent 38%), rgba(0,0,0,0.64)',
      backdropFilter: 'blur(12px) saturate(140%)',
      WebkitBackdropFilter: 'blur(12px) saturate(140%)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) closeWithAnimation(); }}
    >
      <div className={`glass-liquid-strong bp-share-modal bp-modal-surface ${isClosing ? 'is-closing' : ''}`} style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bp-glass-bg-strong)',
        backdropFilter: 'blur(32px) saturate(185%)',
        WebkitBackdropFilter: 'blur(32px) saturate(185%)',
        border: '1px solid var(--bp-glass-border-accent)',
        borderRadius: '24px 24px 0 0',
        boxShadow: 'var(--bp-glass-shadow)',
        overflow: 'hidden',
        animation: 'slideUpModal 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '12px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Logo */}
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'rgba(173,255,47,0.10)', border: '1px solid rgba(173,255,47,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <img src="/header-logo.png" alt="Branco Peres" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(173,255,47,0.7)', textTransform: 'uppercase' }}>
              Mapas Branco Peres
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'white' }}>
              Compartilhar Localização
            </div>
          </div>

          <button
            onClick={closeWithAnimation}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.6)', flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Corpo */}
        <div className="bp-share-modal-body" style={{ padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Card de localização */}
          <div style={{
            background: `${accentColor}08`,
            border: `1px solid ${accentColor}20`,
            borderRadius: 16, padding: '12px 14px',
          }}>
            {isAlert && catInfo && (
              <div style={{
                fontSize: 13, fontWeight: 800, color: catInfo.color,
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
              }}>
                {catInfo.emoji} ALERTA: {catInfo.title}
              </div>
            )}

            {!isUnmarkedArea && !isAlert && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{catInfo?.emoji || '📍'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>
                    Fundo {fundo} — Talhão {talhao}
                  </div>
                  {farmName && !firstPoi && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.68)', marginTop: 3 }}>
                      {farmName}
                    </div>
                  )}
                  {zona && zona !== 'N/A' && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                      Zona {zona}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isUnmarkedArea && !isAlert && (
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                {catInfo?.emoji || '📍'} Localização Personalizada
              </div>
            )}

            {hasPhoto && (
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#60a5fa',
                background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
                borderRadius: 10, padding: '6px 10px', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                📷 Foto anexada (visível no app)
              </div>
            )}

            {pois && pois.length > 0 && (
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#ADFF2F',
                background: 'rgba(173,255,47,0.1)', border: '1px solid rgba(173,255,47,0.2)',
                borderRadius: 10, padding: '6px 10px', marginBottom: 6,
              }}>
                📌 {pois.length} POI{pois.length !== 1 ? 's' : ''} compartilhado{pois.length !== 1 ? 's' : ''}
              </div>
            )}

            {implementoAgr && (
              <div style={{
                fontSize: 12, color: '#f59e0b', fontWeight: 800,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)',
                borderRadius: 10, padding: '6px 10px', marginBottom: 6,
              }}>
                Nome Implemento Agr.: {implementoAgr}
              </div>
            )}

            {transportLabel && transportQuantity != null && (
              <div style={{
                fontSize: 12, color: '#f97316', fontWeight: 800,
                background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)',
                borderRadius: 10, padding: '7px 10px', marginBottom: 6,
              }}>
                🚚 Transporte: {transportLabel} · {transportQuantity} {transportUnit === 'bigbags' ? 'BigBags' : 'toneladas'}
                {transportFormula && transportMaterial === 'adubo' && ` · Fórmula ${transportFormula}`}
                {transportTrips.length > 0 && (transportOverage > 0
                  ? ` · ${transportTrips.length} viagem(ns) · passou ${transportOverage} ${transportUnit === 'bigbags' ? 'BigBags' : 't'}`
                  : ` · ${transportTrips.length} viagem(ns) · falta ${transportRemaining} ${transportUnit === 'bigbags' ? 'BigBags' : 't'}`)}
              </div>
            )}

            {customMessage && (
              <div style={{
                fontSize: 12, color: 'rgba(139,92,246,0.9)', fontStyle: 'italic',
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 10, padding: '6px 10px', marginBottom: 6,
              }}>
                "{customMessage}"
              </div>
            )}

            {lat !== undefined && lng !== undefined && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace',
              }}>
                <MapPin size={11} />
                {lat?.toFixed(5)}, {lng?.toFixed(5)}
              </div>
            )}
          </div>

          {/* Preview do link */}
          <div className="bp-share-link-preview" style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '8px 12px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Link do App
            </div>
            <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {appShareUrl}
            </div>
          </div>

          {/* Botões */}
          <div className="bp-share-actions" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* WhatsApp */}
            <ShareButton
              onClick={handleWhatsApp}
              bg="rgba(37,211,102,0.15)"
              border="rgba(37,211,102,0.35)"
              color="#25d366"
              icon={<MessageCircle size={18} />}
              label="Compartilhar no WhatsApp"
            />

            {/* Google Maps */}
            {googleMapsUrl && (
              <ShareButton
                onClick={handleGoogleMaps}
                bg="rgba(96,165,250,0.12)"
                border="rgba(96,165,250,0.3)"
                color="#60a5fa"
                icon={<MapPin size={18} />}
                label="Abrir no Google Maps"
              />
            )}

            {/* Copiar link */}
            <ShareButton
              onClick={handleCopyLink}
              bg="rgba(255,255,255,0.05)"
              border="rgba(255,255,255,0.12)"
              color={copied ? '#4ade80' : 'rgba(255,255,255,0.65)'}
              icon={copied ? <Check size={18} /> : <Copy size={18} />}
              label={copied ? 'Link copiado!' : 'Copiar link do app'}
            />

            {/* Copiar mensagem */}
            <ShareButton
              onClick={handleCopyMessage}
              bg="rgba(255,255,255,0.05)"
              border="rgba(255,255,255,0.12)"
              color={copiedMsg ? '#4ade80' : 'rgba(255,255,255,0.65)'}
              icon={copiedMsg ? <Check size={18} /> : <ExternalLink size={18} />}
              label={copiedMsg ? 'Mensagem copiada!' : 'Copiar mensagem completa'}
            />
          </div>

          {/* Nota */}
          <p className="bp-share-note" style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 2 }}>
            O logotipo aparece automaticamente no preview do WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Botão de compartilhamento ─────────────────────────────────────────────────
function ShareButton({ onClick, bg, border, color, icon, label }: {
  onClick: () => void;
  bg: string;
  border: string;
  color: string;
  icon: React.ReactNode;
  label: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', padding: '13px 16px',
        borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12,
        background: hover ? bg.replace('0.', '0.2') : bg,
        border: `1px solid ${border}`,
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        backdropFilter: 'blur(18px) saturate(160%)',
        boxShadow: '0 10px 26px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.10)',
        color, fontWeight: 700, fontSize: 14, cursor: 'pointer',
        transition: 'all 0.15s', textAlign: 'left',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
