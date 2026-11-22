/**
 * imageCompression — Reduz o tamanho das fotos ANTES de enviar ao banco.
 *
 * O banco de dados e gratuito e tem pouco espaco, entao comprimimos a imagem
 * no proprio dispositivo: redimensiona para no maximo `maxDimension` px e
 * exporta em JPEG, reduzindo a qualidade ate ficar abaixo de `targetBytes`.
 *
 * Retorna uma Data URL (base64) pronta para salvar na coluna `photo`.
 */

export interface CompressOptions {
  maxDimension?: number; // maior lado da imagem (px)
  targetBytes?: number; // tamanho alvo aproximado do arquivo final
  minQuality?: number; // qualidade minima aceitavel (0..1)
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1000,
  targetBytes: 90 * 1024, // ~90KB
  minQuality: 0.4,
};

function dataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  // cada 4 chars base64 = 3 bytes
  return Math.floor((b64.length * 3) / 4);
}

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar a imagem'));
    img.src = src;
  });
}

/**
 * Comprime um arquivo de imagem para uma Data URL JPEG pequena.
 */
export async function compressImage(
  file: File | Blob,
  options: CompressOptions = {}
): Promise<string> {
  const opts = { ...DEFAULTS, ...options };

  const originalDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(originalDataUrl);

  let { width, height } = img;
  if (width > height && width > opts.maxDimension) {
    height = Math.round((height * opts.maxDimension) / width);
    width = opts.maxDimension;
  } else if (height >= width && height > opts.maxDimension) {
    width = Math.round((width * opts.maxDimension) / height);
    height = opts.maxDimension;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalDataUrl;

  // fundo branco (evita transparencia virar preto no JPEG)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.72;
  let result = canvas.toDataURL('image/jpeg', quality);

  // Reduz a qualidade progressivamente ate atingir o tamanho alvo
  while (dataUrlBytes(result) > opts.targetBytes && quality > opts.minQuality) {
    quality = Math.max(opts.minQuality, quality - 0.1);
    result = canvas.toDataURL('image/jpeg', quality);
  }

  return result;
}

/** Formata bytes para exibicao amigavel (ex: 48 KB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  return dataUrlBytes(dataUrl);
}
