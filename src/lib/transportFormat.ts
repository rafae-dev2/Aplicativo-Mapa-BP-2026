/**
 * Utilitários de formatação para toneladas.
 * Exibe os números com ponto de milhar (pt-BR) enquanto o usuário digita e
 * converte de volta para número ao salvar. Não há limite de quantidade.
 */

/** Formata um valor de entrada em toneladas com ponto de milhar (ex.: 22300 -> "22.300"). */
export function formatTonsInput(value: string | number | null | undefined): string {
  if (value == null) return '';
  let v = String(value).replace(/[^\d,]/g, ''); // mantém apenas dígitos e vírgula decimal
  const commaIdx = v.indexOf(',');
  const hasComma = commaIdx !== -1;
  let intPart = hasComma ? v.slice(0, commaIdx) : v;
  const decPart = hasComma ? v.slice(commaIdx + 1).replace(/,/g, '').slice(0, 2) : '';
  intPart = intPart.replace(/^0+(?=\d)/, ''); // remove zeros à esquerda
  let intFmt = '';
  if (intPart.length) {
    intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  } else if (hasComma) {
    intFmt = '0';
  }
  return hasComma ? `${intFmt},${decPart}` : intFmt;
}

/** Converte um texto de toneladas (com ponto de milhar e vírgula decimal) em número. */
export function parseTons(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (value == null || value === '') return NaN;
  const cleaned = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');
  return Number(cleaned);
}
