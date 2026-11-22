/**
 * Constantes de configuração do aplicativo
 */

// Mapbox Configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER: { lng: -50.99, lat: -21.45 }, // Região das fazendas Branco Peres
  DEFAULT_ZOOM: 11,
  SELECTED_ZOOM: 15,
  FLY_DURATION: 2000,
  MIN_ZOOM: 2,
  MAX_ZOOM: 20,
  MAPBOX_ACCESS_TOKEN: 'pk.eyJ1IjoicmFmYWVsc2lsdmExOTIwIiwiYSI6ImNtaGw2OWh1eDFrd2QyanE0NXZ1eWo4NGgifQ.rJYJn-ajyKkel3BYOjRJ4g',
} as const;

// Pesquisa
export const SEARCH_CONFIG = {
  MIN_QUERY_LENGTH: 2,
  MAX_RESULTS: 20,
  DEBOUNCE_DELAY: 300,
} as const;

// Cores
export const COLORS = {
  SELECTED_AREA: '#9C27B0',
  DEFAULT_AREA: 'rgba(255, 255, 255, 0.5)',
  PRIMARY: '#4CAF50', // Verde primário
  SECONDARY: '#9C27B0', // Roxo secundário
  POLYGON_STROKE: '#2d2d2d', // Cinza escuro/preto para contorno
  POLYGON_FILL: 'rgba(192, 204, 192, 0.5)', // Cinza-claro esverdeado (similar à imagem)
  POLYGON_SELECTED: 'rgba(192, 204, 192, 0.7)', // Cinza-claro esverdeado mais opaco (selecionado)
  POLYGON_STROKE_SELECTED: '#FFEB3B', // Amarelo para contorno da área selecionada
  // Cores premium para tema glass
  GLASS_GREEN: '#22c55e',
  GLASS_GREEN_LIGHT: '#16a34a',
  GLASS_GREEN_DARK: '#15803d',
} as const;

// API
export const API_CONFIG = {
  GEOJSON_URL: '/branco-peres.mapdata',
  FETCH_TIMEOUT: 15000,
  FETCH_RETRIES: 3,
  RETRY_DELAY: 2000,
} as const;

// LocalStorage Keys
export const STORAGE_KEYS = {
  POIS: 'mapas-bp-pois',
  POIS_SHARED: 'mapas-pois-shared',
  SEARCH_HISTORY: 'mapas-bp-search-history',
  THEME: 'mapas-bp-theme',
  USER_LOCATION: 'mapas-bp-user-location',
  SW_VERSION: 'mapas-sw-version',
} as const;

// Defaults
export const DEFAULTS = {
  FUNDO: 25,
  TALHAO: 1,
} as const;

// Validação
export const VALIDATION = {
  MAX_POI_NAME_LENGTH: 100,
  MAX_POI_DESCRIPTION_LENGTH: 500,
  MAX_POIS_COUNT: 1000,
  MAX_SHARED_POIS: 100,
} as const;

// Performance
export const PERFORMANCE = {
  MAP_RENDER_DELAY: 500,
  FLY_DURATION: 2000,
  POPUP_CLOSE_DELAY: 300,
  ANIMATION_DURATION: 300,
} as const;

// POI Sharing
export const POI_SHARING = {
  ENABLED: true,
  MAX_URL_LENGTH: 2048,
  EXPIRY_DAYS: 30,
  SYNC_INTERVAL: 5000, // 5 segundos
} as const;
