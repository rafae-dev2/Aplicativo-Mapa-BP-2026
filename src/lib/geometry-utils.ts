import { centroid } from '@turf/turf';
import type { GeoJSONFeature } from './geojson-validator';

/**
 * Calcula o centróide de uma feature GeoJSON usando Turf.js
 * @param feature Feature GeoJSON (Polygon ou MultiPolygon)
 * @returns Coordenadas [longitude, latitude] ou null se inválido
 */
export function calculateFeatureCentroid(
  feature: GeoJSONFeature
): [number, number] | null {
  try {
    const center = centroid(feature);
    return center.geometry.coordinates as [number, number];
  } catch (error) {
    console.error('Erro ao calcular centróide:', error);
    return null;
  }
}

/**
 * Calcula bounds (bounding box) de uma feature
 * @param feature Feature GeoJSON
 * @returns Bounds [minLng, minLat, maxLng, maxLat] ou null
 */
export function calculateFeatureBounds(
  feature: GeoJSONFeature
): [number, number, number, number] | null {
  try {
    const coords = extractAllCoordinates(feature);
    if (coords.length === 0) return null;

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    });

    return [minLng, minLat, maxLng, maxLat];
  } catch (error) {
    console.error('Erro ao calcular bounds:', error);
    return null;
  }
}

/**
 * Extrai todas as coordenadas de uma feature
 * @param feature Feature GeoJSON
 * @returns Array de coordenadas [longitude, latitude]
 */
function extractAllCoordinates(feature: GeoJSONFeature): [number, number][] {
  const coords: [number, number][] = [];
  const { type, coordinates } = feature.geometry;

  if (type === 'Polygon') {
    coordinates[0].forEach((coord: number[]) => {
      coords.push([coord[0], coord[1]]);
    });
  } else if (type === 'MultiPolygon') {
    coordinates.forEach((polygon: number[][][]) => {
      polygon[0].forEach((coord: number[]) => {
        coords.push([coord[0], coord[1]]);
      });
    });
  }

  return coords;
}

/**
 * Valida se coordenadas são válidas
 * @param coords Coordenadas [longitude, latitude]
 * @returns true se válido
 */
export function isValidCoordinates(coords: [number, number] | null): boolean {
  if (!coords) return false;
  const [lng, lat] = coords;
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90 &&
    !isNaN(lng) &&
    !isNaN(lat)
  );
}
