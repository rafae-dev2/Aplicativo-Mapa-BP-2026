import { MapPin, Satellite, Plus, Navigation2, Share2 } from 'lucide-react';

interface FloatingControlsProps {
  onGPS?: () => void;
  onSatellite?: () => void;
  onPOI?: () => void;
  onRoutes?: () => void;
  onShare?: () => void;
}

export default function FloatingControls({
  onGPS,
  onSatellite,
  onPOI,
  onRoutes,
  onShare,
}: FloatingControlsProps) {
  return (
    <div className="fixed bottom-6 right-4 flex flex-col gap-3 z-40">
      {/* GPS Button */}
      <button
        onClick={onGPS}
        title="Minha Localização"
        className="w-14 h-14 rounded-full glass-liquid-button text-white shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl"
      >
        📍
      </button>

      {/* Satellite Button */}
      <button
        onClick={onSatellite}
        title="Modo Satélite"
        className="w-14 h-14 rounded-full glass-liquid-button text-white shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl"
      >
        🛰️
      </button>

      {/* POI Button */}
      <button
        onClick={onPOI}
        title="Adicionar POI"
        className="w-14 h-14 rounded-full glass-liquid-button text-white shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl"
      >
        📌
      </button>

      {/* Routes Button */}
      <button
        onClick={onRoutes}
        title="Criar Rota"
        className="w-14 h-14 rounded-full glass-liquid-button text-white shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl"
      >
        🧭
      </button>

      {/* Share Button */}
      <button
        onClick={onShare}
        title="Compartilhar"
        className="w-14 h-14 rounded-full glass-liquid-button text-white shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl"
      >
        📤
      </button>
    </div>
  );
}
