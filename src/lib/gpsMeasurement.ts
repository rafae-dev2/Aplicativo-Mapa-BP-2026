import { area as turfArea, distance as turfDistance } from '@turf/turf';

export interface GpsMeasurementPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export interface GpsAreaMeasurement {
  id: string;
  kind: 'burned_area';
  coordinates: GpsMeasurementPoint[];
  areaM2: number;
  areaHa: number;
  perimeterM: number;
  pointCount: number;
  averageAccuracyM: number | null;
  bestAccuracyM: number | null;
  durationMs: number;
  startedAt: number;
  endedAt: number;
}

function closeRing(points: GpsMeasurementPoint[]) {
  const ring = points.map((point) => [point.lng, point.lat] as [number, number]);
  if (ring.length > 0) ring.push(ring[0]);
  return ring;
}

export function calculateGpsArea(points: GpsMeasurementPoint[]): number {
  if (points.length < 3) return 0;
  const ring = closeRing(points);
  return turfArea({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  });
}

export function calculateGpsPerimeter(points: GpsMeasurementPoint[]): number {
  if (points.length < 2) return 0;
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + turfDistance([point.lng, point.lat], [next.lng, next.lat], { units: 'meters' });
  }, 0);
}

export function createGpsAreaMeasurement(
  points: GpsMeasurementPoint[],
  startedAt: number,
  endedAt = Date.now(),
): GpsAreaMeasurement | null {
  if (points.length < 3) return null;
  const areaM2 = calculateGpsArea(points);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;
  const accuracies = points.map((point) => point.accuracy).filter((value): value is number => Number.isFinite(value));
  return {
    id: `burned-area-${endedAt}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'burned_area',
    coordinates: points.map((point) => ({ ...point })),
    areaM2,
    areaHa: areaM2 / 10000,
    perimeterM: calculateGpsPerimeter(points),
    pointCount: points.length,
    averageAccuracyM: accuracies.length ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length : null,
    bestAccuracyM: accuracies.length ? Math.min(...accuracies) : null,
    durationMs: Math.max(0, endedAt - startedAt),
    startedAt,
    endedAt,
  };
}

export function measurementCenter(measurement: GpsAreaMeasurement): { lat: number; lng: number } {
  const totals = measurement.coordinates.reduce((acc, point) => ({
    lat: acc.lat + point.lat,
    lng: acc.lng + point.lng,
  }), { lat: 0, lng: 0 });
  const divisor = Math.max(1, measurement.coordinates.length);
  return { lat: totals.lat / divisor, lng: totals.lng / divisor };
}

export function formatMeasurementArea(measurement: Pick<GpsAreaMeasurement, 'areaHa'>): string {
  return `${measurement.areaHa.toFixed(4)} ha`;
}
