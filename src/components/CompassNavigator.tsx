/**
 * CompassNavigator - Bússola de navegação até o talhão selecionado
 * 
 * Funcionalidades:
 * - Calcula distância e direção do GPS até o centro do talhão selecionado
 * - Usa Turf.js para cálculo preciso de distância e bearing
 * - Exibe "Distância: 3.2 km | Direção: Noroeste"
 * - Seta animada apontando para o destino
 * - Funciona offline (cálculos no front-end)
 */

import React, { useMemo } from 'react';
import { distance as turfDistance, bearing as turfBearing } from '@turf/turf';
import { Compass } from 'lucide-react';

interface CompassNavigatorProps {
  userLat: number | null;
  userLng: number | null;
  targetLat: number | null;
  targetLng: number | null;
  targetName?: string;
  userHeading?: number;
  accuracy?: number | null;
}

// Converter graus de bearing para nome da direção cardinal
function bearingToCardinal(bearing: number): string {
  const normalized = ((bearing % 360) + 360) % 360;
  const directions = [
    'Norte', 'Norte-Nordeste', 'Nordeste', 'Leste-Nordeste',
    'Leste', 'Leste-Sudeste', 'Sudeste', 'Sul-Sudeste',
    'Sul', 'Sul-Sudoeste', 'Sudoeste', 'Oeste-Sudoeste',
    'Oeste', 'Oeste-Noroeste', 'Noroeste', 'Norte-Noroeste',
  ];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

// Formatar distância de forma legível
function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export default function CompassNavigator({
  userLat,
  userLng,
  targetLat,
  targetLng,
  targetName,
  userHeading = 0,
  accuracy = null,
}: CompassNavigatorProps) {
  // Calcular distância e bearing usando Turf.js
  const navigation = useMemo(() => {
    if (
      userLat === null || userLng === null ||
      targetLat === null || targetLng === null ||
      isNaN(userLat) || isNaN(userLng) ||
      isNaN(targetLat) || isNaN(targetLng)
    ) {
      return null;
    }

    try {
      const from = [userLng, userLat];
      const to = [targetLng, targetLat];

      const dist = turfDistance(from, to, { units: 'kilometers' });
      const bear = turfBearing(from, to);
      const cardinal = bearingToCardinal(bear);

      // Bearing relativo ao heading do usuário (para a seta apontar corretamente)
      const relativeBearing = ((bear - userHeading) % 360 + 360) % 360;

      return {
        distance: dist,
        bearing: bear,
        relativeBearing,
        cardinal,
        formattedDistance: formatDistance(dist),
      };
    } catch (e) {
      return null;
    }
  }, [userLat, userLng, targetLat, targetLng, userHeading]);

  if (!navigation) return null;

  // Cor baseada na distância
  const distColor =
    navigation.distance < 0.5
      ? '#22c55e' // verde - muito perto
      : navigation.distance < 2
      ? '#f59e0b' // amarelo - perto
      : '#3b82f6'; // azul - longe

  return (
    <div
      className="bg-gray-900 bg-opacity-90 rounded-xl shadow-2xl border border-gray-700 p-3"
      style={{ minWidth: 200, maxWidth: 260 }}
    >
      {/* Título */}
      <div className="flex items-center gap-2 mb-2">
        <Compass className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
          Navegação
        </span>
      </div>

      {/* Destino */}
      {targetName && (
        <p className="text-xs text-gray-400 mb-2 truncate">
          → <span className="text-white font-semibold">{targetName}</span>
        </p>
      )}

      {/* Seta de direção + informações */}
      <div className="flex items-center gap-3">
        {/* Seta animada */}
        <div
          className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full border-2"
          style={{ borderColor: distColor, background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            style={{
              fontSize: 28,
              transform: `rotate(${navigation.relativeBearing}deg)`,
              transition: 'transform 0.5s ease',
              lineHeight: 1,
            }}
          >
            ↑
          </div>
        </div>

        {/* Distância e direção */}
        <div>
          <p
            className="text-xl font-bold"
            style={{ color: distColor }}
          >
            {navigation.formattedDistance}
          </p>
          <p className="text-sm text-gray-300 font-medium">
            {navigation.cardinal}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {Math.round(navigation.bearing)}°
          </p>
        </div>
      </div>

      {/* Precisão do GPS (metros) — importante no campo, funciona offline */}
      {accuracy != null && !isNaN(accuracy) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: accuracy <= 15 ? '#22c55e' : accuracy <= 40 ? '#f59e0b' : '#ef4444' }}
          />
          <span className="text-gray-400">
            Precisão GPS: <span className="text-white font-semibold">±{Math.round(accuracy)} m</span>
          </span>
        </div>
      )}

      {/* Barra de progresso visual (quanto falta) */}
      {navigation.distance < 10 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Aqui</span>
            <span>Destino</span>
          </div>
          <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(5, 100 - (navigation.distance / 10) * 100)}%`,
                background: distColor,
              }}
            />
          </div>
        </div>
      )}

      {/* Chegou! */}
      {navigation.distance < 0.04 && (
        <div
          data-testid="arrived-banner"
          className="mt-2 text-center rounded-lg py-2"
          style={{ background: 'rgba(34,197,94,0.16)', border: '1px solid rgba(34,197,94,0.4)' }}
        >
          <span className="text-green-400 font-extrabold text-sm animate-pulse">
            ✓ Você chegou ao destino!
          </span>
        </div>
      )}
    </div>
  );
}
