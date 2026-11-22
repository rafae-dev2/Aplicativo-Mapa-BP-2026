import { z } from 'zod';

// Schema para validação de propriedades de fazenda
const FazendaPropertiesSchema = z.object({
  FAZENDA: z.number(),
  ZONA: z.number(),
  TALHAO: z.number(),
  AREA_TOTAL: z.number().optional(),
});

// Schema para geometria
const GeometrySchema = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.any()),
});

// Schema para feature
const FeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: FazendaPropertiesSchema,
  geometry: GeometrySchema,
});

// Schema para GeoJSON completo
const GeoJSONSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(FeatureSchema),
});

export type Fazenda = z.infer<typeof FazendaPropertiesSchema>;
export type GeoJSONFeature = z.infer<typeof FeatureSchema>;
export type GeoJSONData = z.infer<typeof GeoJSONSchema>;

/**
 * Valida dados GeoJSON (checagem estrutural LEVE).
 *
 * IMPORTANTE: NAO usamos mais o zod para validar o arquivo inteiro (22MB),
 * pois o parse profundo bloqueava a thread por dezenas de segundos e deixava
 * o app preso em "Carregando...". Fazemos uma checagem rapida da estrutura,
 * mantendo os mesmos dados (a busca de fundos continua igual).
 * @param data Dados a serem validados
 * @returns Dados validados ou null se inválido
 */
export function validateGeoJSON(data: unknown): GeoJSONData | null {
  try {
    const d = data as any;
    if (!d || d.type !== 'FeatureCollection' || !Array.isArray(d.features)) {
      return null;
    }
    return d as GeoJSONData;
  } catch (error) {
    console.error('Erro ao validar GeoJSON:', error);
    return null;
  }
}

/**
 * Valida se o GeoJSON tem features
 * @param data Dados GeoJSON
 * @returns true se válido
 */
export function hasFeatures(data: GeoJSONData): boolean {
  return data.features && data.features.length > 0;
}
