import { useState } from 'react';
import { LocateFixed, AlertCircle } from 'lucide-react'; // Usar LocateFixed para o botão de centralização

interface GPSControlProps {
  onLocate: (lng: number, lat: number) => void;
  onClear: () => void;
  isLocated: boolean;
}

export default function GPSControl({ onLocate, onClear, isLocated }: GPSControlProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocate = () => {
    if (isLocated) {
      onClear();
      return;
    }
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada neste navegador.');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onLocate(longitude, latitude);
        setLoading(false);
      },
      (err) => {
        // 1: Permissão negada, 2: Posição indisponível, 3: Timeout
        let errorMessage = 'Erro ao obter localização.';
        if (err.code === 1) {
          errorMessage = 'Permissão de localização negada. Por favor, habilite a localização nas configurações do seu navegador.';
        } else if (err.code === 3) {
          errorMessage = 'Tempo limite excedido ao tentar obter a localização.';
        }
        setError(errorMessage);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="relative">
      <button
        onClick={handleLocate}
        disabled={loading}
        className={`w-10 h-10 flex items-center justify-center rounded-lg shadow-md transition disabled:opacity-50 ${
          isLocated
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'glass-liquid-button text-white hover:bg-white/10'
        }`}
        title={isLocated ? "Parar de rastrear localização" : "Centralizar na minha localização"}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <LocateFixed className={`w-5 h-5 ${isLocated ? 'text-white' : 'text-blue-600'}`} />
        )}
      </button>

      {error && (
        <div className="absolute bottom-12 right-0 p-2 bg-red-500 text-white text-xs rounded-lg shadow-lg max-w-xs z-50 flex items-center gap-1">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
