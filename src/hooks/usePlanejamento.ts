/**
 * usePlanejamento — Hook para carregar e consultar dados do Planejamento de Colheita 2026
 *
 * Carrega o JSON /planejamento_colheita.json uma única vez e disponibiliza
 * a função getTalhaoData(fundo, talhao) para busca por chave.
 */

import { useState, useEffect, useCallback } from 'react';

export interface TalhaoData {
  fundo:          number;
  talhao:         number;
  fazenda_nome?:  string | null;
  variedade?:     string | null;
  estagio?:       string | null;
  area_ha?:       number | null;
  area_moagem?:   number | null;
  tipo_variedade?:string | null;
  prop_parc?:     string | null;
  municipio?:     string | null;
  proprietario?:  string | null;
  vinhaca?:       string | null;
  adubacao?:      string | null;
  bloco?:         string | null;
  frente?:        string | null;
  sistema?:       string | null;
  status?:        string | null;
  tch_estim?:     number | null;
  tch_reestim?:   number | null;
  tch_real?:      string | number | null;
  atr?:           string | number | null;
  data_plantio?:  string | null;
  data_planej?:   string | null;
  data_realiz?:   string | null;
  dt_colheita?:   string | null;
  tch_est_fundo?: number | null;
  prod_est_fundo?:number | null;
  mudas?:         string | null;
  danos_terc?:    string | null;
}

export interface FundoResumo {
  nome?:      string | null;
  area_est?:  number | null;
  area_real?: number | null;
  tch_est?:   number | null;
  tch_real?:  number | null;
  prod_est?:  number | null;
  prod_real?: number | null;
}

interface PlanejamentoData {
  talhoes: Record<string, TalhaoData>;
  fundos:  Record<string, FundoResumo>;
  meta:    { total_talhoes: number; total_fundos: number; gerado_em: string };
}

// Cache global para evitar múltiplos fetches
let _cache: PlanejamentoData | null = null;
let _loading = false;
const _listeners: Array<(data: PlanejamentoData) => void> = [];

function loadData(cb: (data: PlanejamentoData) => void) {
  if (_cache) { cb(_cache); return; }
  _listeners.push(cb);
  if (_loading) return;
  _loading = true;
  fetch('/planejamento_colheita.json', { cache: 'force-cache' })
    .then(r => r.json())
    .then((data: PlanejamentoData) => {
      _cache = data;
      _listeners.forEach(fn => fn(data));
      _listeners.length = 0;
    })
    .catch(err => {
      console.warn('[usePlanejamento] Erro ao carregar dados:', err);
      _loading = false;
      _listeners.length = 0;
    });
}

export function usePlanejamento() {
  const [data, setData] = useState<PlanejamentoData | null>(_cache);

  useEffect(() => {
    if (!data) {
      loadData(setData);
    }
  }, []);

  const getTalhaoData = useCallback((fundo: number, talhao: number): TalhaoData | null => {
    if (!data) return null;
    const key = `${fundo}-${talhao}`;
    return data.talhoes[key] || null;
  }, [data]);

  const getFundoResumo = useCallback((fundo: number): FundoResumo | null => {
    if (!data) return null;
    return data.fundos[String(fundo)] || null;
  }, [data]);

  return { data, getTalhaoData, getFundoResumo, loading: !data };
}
