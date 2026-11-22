import { useState } from 'react';
import { X, MapPin, Copy, Check, Flame, LocateFixed } from 'lucide-react';

interface UnmarkedAreaPopupProps {
  lng: number;
  lat: number;
  onClose: () => void;
  onAddPoi: () => void;
  onFireAlert?: () => void;
  onBurnedArea?: () => void;
  presentation?: 'popup' | 'sheet';
}

export default function UnmarkedAreaPopup({ lng, lat, onClose, onAddPoi, onFireAlert, onBurnedArea, presentation = 'popup' }: UnmarkedAreaPopupProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCoordinates = () => {
    const coordinatesText = `${lat !== undefined && lat !== null ? lat.toFixed(6) : 'N/A'}, ${lng !== undefined && lng !== null ? lng.toFixed(6) : 'N/A'}`;
    navigator.clipboard.writeText(coordinatesText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`bp-unmarked-area-popup glass-liquid-strong relative w-full overflow-hidden p-4 text-white ${presentation === 'sheet' ? '' : 'max-w-[min(342px,calc(100vw-22px))] rounded-[22px] shadow-2xl'}`}
      onClick={(event) => event.stopPropagation()}
    >
      {presentation !== 'sheet' && (
        <button
          onClick={(event) => { event.stopPropagation(); onClose(); }}
          onPointerDown={(event) => event.stopPropagation()}
          className="bp-unmarked-close glass-liquid-button absolute top-2.5 right-2.5 rounded-full p-1.5 text-white/80 transition-all hover:text-white"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
      )}

      <div className="flex justify-center pt-2 pb-3">
        <img src="/logo-poi-share.png" alt="Logotipo Branco Peres" className="bp-unmarked-logo h-14 object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.45)]" />
      </div>

      <h3 className="bp-unmarked-title mb-2 text-center text-lg font-black text-[#FFEB3B] drop-shadow">Área Não Demarcada</h3>

      <div className="bp-unmarked-coordinates-card glass-liquid-surface mb-3 rounded-2xl p-3">
        <p className="bp-unmarked-coordinates-label mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/65">Coordenadas</p>
        <div className="bp-unmarked-coordinates-row flex items-center justify-between rounded-xl border border-white/10 bg-white/8 p-2">
          <p className="bp-unmarked-coordinate-value font-mono text-xs text-white/90">
            {lat !== undefined && lat !== null ? lat.toFixed(6) : 'N/A'}, {lng !== undefined && lng !== null ? lng.toFixed(6) : 'N/A'}
          </p>
          <button
            onClick={handleCopyCoordinates}
            className="bp-unmarked-copy-btn rounded-lg p-1.5 text-[#ADFF2F] transition-colors hover:bg-white/10 hover:text-[#FFEB3B]"
            title="Copiar coordenadas"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </div>

      <p className="bp-unmarked-description mb-3 text-center text-xs leading-relaxed text-white/72">
        Clique abaixo para adicionar um POI com o logo pulsante da empresa ou um alerta de incêndio nesta localização.
      </p>

      <button
        onClick={onAddPoi}
        className="bp-unmarked-add-btn glass-liquid-button flex w-full items-center justify-center rounded-2xl px-3 py-3 text-sm font-black transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]"
      >
        <MapPin size={18} className="mr-2" />
        Adicionar POI
      </button>

      {(onFireAlert || onBurnedArea) && (
        <div className="bp-unmarked-actions mt-2 grid grid-cols-2 gap-2">
          {onFireAlert && (
            <button
              onClick={onFireAlert}
              data-testid="unmarked-fire-alert-btn"
              className="bp-unmarked-fire-btn flex items-center justify-center gap-1.5 rounded-xl border border-red-400/50 bg-red-500/15 px-2 py-2.5 text-xs font-black text-red-100 transition-all hover:bg-red-500/25 active:scale-[0.98]"
            >
              <Flame size={15} /> Incêndio
            </button>
          )}
          {onBurnedArea && (
            <button
              onClick={onBurnedArea}
              data-testid="unmarked-burned-area-btn"
              className="bp-unmarked-burned-btn flex items-center justify-center gap-1.5 rounded-xl border border-orange-300/50 bg-orange-500/15 px-2 py-2.5 text-xs font-black text-orange-100 transition-all hover:bg-orange-500/25 active:scale-[0.98]"
            >
              <LocateFixed size={15} /> Área GPS
            </button>
          )}
        </div>
      )}

      <div className="bp-unmarked-footer mt-3 text-center text-[11px] leading-relaxed text-white/52">
        Selecione a categoria desejada na próxima tela. POIs comuns usam o logo pulsante da empresa.
      </div>
    </div>
  );
}
