import { useState } from 'react';
import { Share2, Copy, Mail } from 'lucide-react';
import type { SearchResult } from '@/hooks/useFazendas';

interface ShareLocationProps {
  result: SearchResult;
  onClose?: () => void;
}

export default function ShareLocation({ result, onClose }: ShareLocationProps) {
  const [copied, setCopied] = useState(false);

  const generateWhatsAppMessage = () => {
    const { fazenda } = result;
    const lat = 0;
    const lng = 0;
    const googleMapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    const appLink = `${window.location.origin}?fundo=${fazenda.FAZENDA}&talhao=${fazenda.TALHAO}`;

    return `🗺️ *MAPAS BRANCO PERES*

📍 *Localização da Fazenda*
Fundo: ${fazenda.FAZENDA}
Talhão: ${fazenda.TALHAO}

📊 Zona: ${fazenda.ZONA}

📌 Coordenadas: ${lat !== undefined && lat !== null ? lat.toFixed(4) : 'N/A'}, ${lng !== undefined && lng !== null ? lng.toFixed(4) : 'N/A'}

🗺️ Ver no mapa:
${googleMapsLink}

Ver no app:
${appLink}

Powered by Mapas Branco Peres`;
  };

  const message = generateWhatsAppMessage();

  const handleShareWhatsApp = () => {
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleShareEmail = () => {
    const subject = `Localização da Fazenda - Fundo ${result.fazenda.FAZENDA} Talhão ${result.fazenda.TALHAO}`;
    const body = message.replace(/\*/g, '').replace(/\n/g, '%0D%0A');
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
    window.location.href = mailtoUrl;
  };

  const handleCopyLink = () => {
    const appLink = `${window.location.origin}?fundo=${result.fazenda.FAZENDA}&talhao=${result.fazenda.TALHAO}`;
    navigator.clipboard.writeText(appLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bp-share-location-card glass-liquid-strong w-full max-w-[min(360px,calc(100vw-24px))] rounded-[22px] p-4 text-white shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="bp-share-location-title flex items-center gap-2 text-lg font-black text-white">
          <Share2 className="bp-share-location-icon h-5 w-5 text-[#ADFF2F]" />
          Compartilhar
        </h3>
        {onClose && (
          <button onClick={onClose} className="glass-liquid-button rounded-full px-2.5 py-1 text-sm text-white/85 hover:text-white">
            ✕
          </button>
        )}
      </div>

      <div className="glass-liquid-surface modal-scroll mb-3 max-h-44 overflow-y-auto rounded-2xl p-3">
        <p className="bp-share-location-message whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-white/78">{message}</p>
      </div>

      <div className="space-y-2">
        <button onClick={handleShareWhatsApp} className="glass-liquid-button flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold">
          Compartilhar no WhatsApp
        </button>
        <button onClick={handleShareEmail} className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-300/25 bg-sky-400/16 px-3 py-2.5 text-sm font-bold text-sky-50 backdrop-blur transition hover:bg-sky-400/24">
          <Mail className="h-4 w-4" />
          Enviar por Email
        </button>
        <button onClick={handleCopyLink} className={`bp-share-copy-button flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${copied ? 'is-copied border border-lime-300/35 bg-lime-300/16 text-lime-100' : 'border border-white/12 bg-white/8 text-white/82 hover:bg-white/12'}`}>
          <Copy className="h-4 w-4" />
          {copied ? 'Link Copiado!' : 'Copiar Link'}
        </button>
        <button onClick={handleCopyMessage} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/8 px-3 py-2.5 text-sm font-bold text-white/82 transition hover:bg-white/12">
          <Copy className="h-4 w-4" />
          Copiar Mensagem
        </button>
      </div>
    </div>
  );
}
