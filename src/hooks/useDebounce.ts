import { useEffect, useState } from 'react';

/**
 * Hook para debounce de valores
 * @param value Valor a ser debounced
 * @param delay Delay em milissegundos (padrão: 300ms)
 * @returns Valor debounced
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Criar timeout para atualizar valor
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpar timeout se valor mudar antes do delay
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
