/**
 * ExperimentosModal v112 — Módulo de Experimentos 2026 com Glass Liquid
 *
 * Exibe todos os experimentos realizados nos talhões da safra 2026.
 * Design dark glassmorphism com as mesmas cores do app (verde limão #ADFF2F).
 *
 * Funcionalidades:
 * - Listagem por tipo de experimento (com contagem e área total)
 * - Listagem por fazenda/fundo
 * - Busca em tempo real por experimento, fazenda, fundo ou talhão
 * - Cards expansíveis com todos os detalhes do talhão
 * - Estatísticas gerais no topo
 * - Navegação para o talhão no mapa ao clicar
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search, FlaskConical, MapPin, ChevronDown, ChevronUp, Leaf, BarChart2, Filter, Layers } from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TalhaoExp {
  fundo:         number;
  talhao:        number;
  fazenda_nome:  string | null;
  variedade:     string | null;
  estagio:       string | null;
  area_ha:       number | null;
  mes_colheita:  string | null;
  prop_parc:     string | null;
  bloco:         string | null;
  tch_estim:     number | null;
  exp1:          string | null;
  exp2:          string | null;
  produto_matur: string | null;
  dt_apl_planej: string | null;
  dt_apl_real:   string | null;
  dt_colheita:   string | null;
  status:        string | null;
}

interface ExpData {
  experimentos: TalhaoExp[];
  por_tipo: Record<string, Array<{ fundo: number; talhao: number; fazenda: string | null; area_ha: number | null; variedade: string | null; estagio: string | null }>>;
  estatisticas: {
    total_talhoes: number;
    total_fundos: number;
    total_tipos: number;
    area_total_ha: number;
  };
}

interface ExperimentosModalProps {
  onClose: () => void;
  onNavigateToTalhao?: (fundo: number, talhao: number) => void;
}

// ── Cache global ──────────────────────────────────────────────────────────────
let _expCache: ExpData | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '-' || v === '') return '—';
  return String(v);
}

function fmtNum(v: number | null | undefined, dec = 2): string {
  if (!v) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Cor para cada tipo de experimento (baseado em categoria)
function expColor(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes('nematicida') || n.includes('quartzo')) return '#ef4444';
  if (n.includes('organico') || n.includes('organic') || n.includes('composto') || n.includes('vit-org')) return '#22c55e';
  if (n.includes('vinh') || n.includes('vinhaca') || n.includes('vinhaça')) return '#3b82f6';
  if (n.includes('engeo') || n.includes('inseticida') || n.includes('altacor') || n.includes('fipronil')) return '#f97316';
  if (n.includes('biotrop') || n.includes('biozyme') || n.includes('dnagro') || n.includes('villa verde')) return '#8b5cf6';
  if (n.includes('maturador') || n.includes('produto') || n.includes('basf') || n.includes('effectus')) return '#f59e0b';
  if (n.includes('adubo') || n.includes('icl') || n.includes('snf') || n.includes('kimberlit')) return '#06b6d4';
  return '#ADFF2F';
}

// Ícone emoji para categoria
function expEmoji(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes('nematicida') || n.includes('quartzo')) return '🪱';
  if (n.includes('organico') || n.includes('organic') || n.includes('composto')) return '🌱';
  if (n.includes('vinh')) return '💧';
  if (n.includes('engeo') || n.includes('inseticida') || n.includes('altacor')) return '🐛';
  if (n.includes('biotrop') || n.includes('biozyme') || n.includes('dnagro')) return '🧬';
  if (n.includes('maturador') || n.includes('basf') || n.includes('effectus')) return '⚗️';
  if (n.includes('adubo') || n.includes('icl') || n.includes('snf')) return '🌾';
  return '🔬';
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) => (
  <div style={{
    background: `${color}0d`,
    border: `1px solid ${color}33`,
    borderRadius: 12,
    padding: '10px 12px',
    textAlign: 'center',
    flex: 1,
    minWidth: 0,
  }}>
    <div style={{ color, fontSize: 18, marginBottom: 2 }}>{icon}</div>
    <div style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{label}</div>
  </div>
);

// Card de talhão expansível
const TalhaoCard = ({
  rec, onNavigate, highlight
}: {
  rec: TalhaoExp;
  onNavigate?: (fundo: number, talhao: number) => void;
  highlight?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const color1 = rec.exp1 ? expColor(rec.exp1) : '#ADFF2F';
  const color2 = rec.exp2 ? expColor(rec.exp2) : '#60a5fa';

  const hl = (text: string | null) => {
    if (!text || !highlight) return text || '—';
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx === -1) return text;
    return text; // retorna texto simples (highlight visual via CSS)
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      marginBottom: 8,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Cabeçalho do card */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Fundo/Talhão */}
        <div style={{
          background: 'rgba(173,255,47,0.1)',
          border: '1px solid rgba(173,255,47,0.25)',
          borderRadius: 8, padding: '4px 8px', textAlign: 'center', flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#ADFF2F', lineHeight: 1 }}>F{rec.fundo}</div>
          <div style={{ fontSize: 10, color: 'rgba(173,255,47,0.6)', lineHeight: 1 }}>T{rec.talhao}</div>
        </div>

        {/* Info principal */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rec.fazenda_nome || `Fundo ${rec.fundo}`}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
            {rec.exp1 && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10,
                background: `${color1}15`, color: color1, border: `1px solid ${color1}33`,
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {expEmoji(rec.exp1)} {rec.exp1}
              </span>
            )}
            {rec.exp2 && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10,
                background: `${color2}15`, color: color2, border: `1px solid ${color2}33`,
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {expEmoji(rec.exp2)} {rec.exp2}
              </span>
            )}
          </div>
        </div>

        {/* Área + expand */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            {rec.area_ha ? `${fmtNum(rec.area_ha)} ha` : '—'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 10,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 10 }}>
            {[
              { label: 'Variedade', value: fmt(rec.variedade) },
              { label: 'Estágio', value: fmt(rec.estagio) },
              { label: 'Mês Colheita', value: fmt(rec.mes_colheita) },
              { label: 'TCH Estimado', value: rec.tch_estim ? String(rec.tch_estim) : '—' },
              { label: 'Prop./Parceiro', value: fmt(rec.prop_parc) },
              { label: 'Bloco', value: fmt(rec.bloco) },
              { label: 'Dt. Apl. Planej.', value: fmt(rec.dt_apl_planej) },
              { label: 'Dt. Apl. Real', value: fmt(rec.dt_apl_real) },
              { label: 'Dt. Colheita', value: fmt(rec.dt_colheita) },
              { label: 'Status', value: fmt(rec.status) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{label}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Experimentos detalhados */}
          {rec.exp1 && (
            <div style={{
              background: `${color1}0d`, border: `1px solid ${color1}22`,
              borderRadius: 8, padding: '6px 10px', marginBottom: 4,
            }}>
              <div style={{ fontSize: 10, color: `${color1}88`, marginBottom: 2 }}>EXPERIMENTO 1</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: color1 }}>{expEmoji(rec.exp1)} {rec.exp1}</div>
            </div>
          )}
          {rec.exp2 && (
            <div style={{
              background: `${color2}0d`, border: `1px solid ${color2}22`,
              borderRadius: 8, padding: '6px 10px', marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, color: `${color2}88`, marginBottom: 2 }}>EXPERIMENTO 2</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: color2 }}>{expEmoji(rec.exp2)} {rec.exp2}</div>
            </div>
          )}

          {/* Botão navegar */}
          {onNavigate && (
            <button
              onClick={() => onNavigate(rec.fundo, rec.talhao)}
              style={{
                width: '100%', padding: '8px', borderRadius: 10,
                background: 'rgba(173,255,47,0.1)', border: '1px solid rgba(173,255,47,0.3)',
                color: '#ADFF2F', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <MapPin size={13} />
              Ver no Mapa — Fundo {rec.fundo} / Talhão {rec.talhao}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────

type ViewMode = 'tipo' | 'fundo' | 'lista';

export default function ExperimentosModal({ onClose, onNavigateToTalhao }: ExperimentosModalProps) {
  const [data, setData] = useState<ExpData | null>(_expCache);
  const [loading, setLoading] = useState(!_expCache);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('tipo');
  const [expandedTipo, setExpandedTipo] = useState<string | null>(null);
  const [expandedFundo, setExpandedFundo] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Carregar dados
  useEffect(() => {
    if (_expCache) { setData(_expCache); setLoading(false); return; }
    fetch('/experimentos_2026.json', { cache: 'force-cache' })
      .then(r => r.json())
      .then((d: ExpData) => {
        _expCache = d;
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filtrar por busca
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.experimentos;
    const q = search.toLowerCase();
    return data.experimentos.filter(r =>
      String(r.fundo).includes(q) ||
      String(r.talhao).includes(q) ||
      (r.fazenda_nome || '').toLowerCase().includes(q) ||
      (r.exp1 || '').toLowerCase().includes(q) ||
      (r.exp2 || '').toLowerCase().includes(q) ||
      (r.variedade || '').toLowerCase().includes(q) ||
      (r.estagio || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  // Agrupar por tipo para a view de tipo
  const porTipo = useMemo(() => {
    const map: Record<string, TalhaoExp[]> = {};
    filtered.forEach(r => {
      [r.exp1, r.exp2].forEach(exp => {
        if (!exp) return;
        if (!map[exp]) map[exp] = [];
        map[exp].push(r);
      });
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // Agrupar por fundo para a view de fundo
  const porFundo = useMemo(() => {
    const map: Record<string, TalhaoExp[]> = {};
    filtered.forEach(r => {
      const key = `${r.fundo}|${r.fazenda_nome || `Fundo ${r.fundo}`}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map).sort((a, b) => {
      const fa = parseInt(a[0].split('|')[0]);
      const fb = parseInt(b[0].split('|')[0]);
      return fa - fb;
    });
  }, [filtered]);

  const closeWithAnimation = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, 300);
  }, [isClosing, onClose]);

  const handleNavigate = useCallback((fundo: number, talhao: number) => {
    onNavigateToTalhao?.(fundo, talhao);
    closeWithAnimation();
  }, [onNavigateToTalhao, closeWithAnimation]);

  return (
    <div className={`bp-modal-backdrop bp-experimentos-modal-backdrop ${isClosing ? 'is-closing' : ''}`} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 20%, rgba(173,255,47,0.10), transparent 38%), rgba(0,0,0,0.64)',
      backdropFilter: 'blur(12px) saturate(140%)',
      WebkitBackdropFilter: 'blur(12px) saturate(140%)',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) closeWithAnimation(); }}
    >
      <div className={`glass-liquid-strong bp-modal-surface ${isClosing ? 'is-closing' : ''}`} style={{
        background: 'var(--bp-glass-bg-strong)',
        backdropFilter: 'blur(32px) saturate(185%)',
        WebkitBackdropFilter: 'blur(32px) saturate(185%)',
        borderRadius: '24px 24px 0 0',
        border: '1px solid var(--bp-glass-border-accent)',
        borderBottom: 'none',
        boxShadow: 'var(--bp-glass-shadow)',
        width: '100%',
        maxWidth: 640,
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        // Animação de entrada
        animation: 'slideUpModal 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* ── Handle drag indicator ─────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          {/* Ícone */}
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(173,255,47,0.2), rgba(255,235,59,0.1))',
            border: '1px solid rgba(173,255,47,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FlaskConical size={22} color="#ADFF2F" />
          </div>

          {/* Título */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(173,255,47,0.7)', textTransform: 'uppercase' }}>
              Safra 2026
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'white', lineHeight: 1.1 }}>
              Experimentos
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Planejamento de Colheita — Branco Peres
            </div>
          </div>

          {/* Botão fechar */}
          <button
            onClick={closeWithAnimation}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Estatísticas ─────────────────────────────────────────────── */}
        {data && (
          <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
            <StatCard icon={<FlaskConical size={16} />} label="Tipos" value={String(data.estatisticas.total_tipos)} color="#ADFF2F" />
            <StatCard icon={<Layers size={16} />} label="Talhões" value={String(data.estatisticas.total_talhoes)} color="#60a5fa" />
            <StatCard icon={<MapPin size={16} />} label="Fazendas" value={String(data.estatisticas.total_fundos)} color="#f59e0b" />
            <StatCard icon={<Leaf size={16} />} label="Área (ha)" value={fmtNum(data.estatisticas.area_total_ha, 0)} color="#22c55e" />
          </div>
        )}

        {/* ── Busca ────────────────────────────────────────────────────── */}
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${search ? 'rgba(173,255,47,0.4)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12, padding: '8px 12px',
            transition: 'border-color 0.2s',
          }}>
            <Search size={14} color={search ? '#ADFF2F' : 'rgba(255,255,255,0.35)'} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por experimento, fazenda, fundo..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'white', fontSize: 13,
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs de visualização ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', padding: '0 14px 10px', gap: 6,
        }}>
          {([
            { id: 'tipo',  label: 'Por Experimento', icon: <FlaskConical size={12} /> },
            { id: 'fundo', label: 'Por Fazenda',     icon: <MapPin size={12} /> },
            { id: 'lista', label: 'Lista Completa',  icon: <BarChart2 size={12} /> },
          ] as { id: ViewMode; label: string; icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '7px 4px', borderRadius: 10, fontSize: 11, fontWeight: viewMode === tab.id ? 700 : 500,
                background: viewMode === tab.id ? 'rgba(173,255,47,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${viewMode === tab.id ? 'rgba(173,255,47,0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: viewMode === tab.id ? '#ADFF2F' : 'rgba(255,255,255,0.45)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Conteúdo ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚗️</div>
              <div>Carregando experimentos...</div>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.35)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum resultado encontrado</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Tente outro termo de busca</div>
            </div>
          )}

          {/* ── VIEW: Por Tipo de Experimento ──────────────────────────── */}
          {!loading && viewMode === 'tipo' && porTipo.map(([tipo, talhoes]) => {
            const color = expColor(tipo);
            const emoji = expEmoji(tipo);
            const isOpen = expandedTipo === tipo;
            const areaTotal = talhoes.reduce((s, t) => s + (t.area_ha || 0), 0);

            return (
              <div key={tipo} style={{
                marginBottom: 10,
                background: `${color}08`,
                border: `1px solid ${color}22`,
                borderRadius: 14,
                overflow: 'hidden',
              }}>
                {/* Cabeçalho do tipo */}
                <div
                  style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onClick={() => setExpandedTipo(isOpen ? null : tipo)}
                >
                  {/* Emoji */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${color}18`, border: `1px solid ${color}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    {emoji}
                  </div>

                  {/* Nome */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tipo}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {talhoes.length} talhão{talhoes.length !== 1 ? 'es' : ''} · {fmtNum(areaTotal)} ha
                    </div>
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span style={{
                      background: `${color}22`, color, border: `1px solid ${color}44`,
                      borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 800,
                    }}>
                      {talhoes.length}
                    </span>
                    {isOpen ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
                  </div>
                </div>

                {/* Talhões do tipo */}
                {isOpen && (
                  <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${color}15` }}>
                    <div style={{ paddingTop: 8 }}>
                      {talhoes.map(t => (
                        <TalhaoCard
                          key={`${t.fundo}-${t.talhao}`}
                          rec={t}
                          onNavigate={handleNavigate}
                          highlight={search}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── VIEW: Por Fazenda ──────────────────────────────────────── */}
          {!loading && viewMode === 'fundo' && porFundo.map(([key, talhoes]) => {
            const [fundoStr, nome] = key.split('|');
            const fundo = parseInt(fundoStr);
            const isOpen = expandedFundo === key;
            const areaTotal = talhoes.reduce((s, t) => s + (t.area_ha || 0), 0);

            return (
              <div key={key} style={{
                marginBottom: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                <div
                  style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onClick={() => setExpandedFundo(isOpen ? null : key)}
                >
                  <div style={{
                    background: 'rgba(173,255,47,0.1)', border: '1px solid rgba(173,255,47,0.25)',
                    borderRadius: 8, padding: '4px 8px', textAlign: 'center', flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ADFF2F' }}>F{fundo}</div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nome}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {talhoes.length} talhão{talhoes.length !== 1 ? 'es' : ''} · {fmtNum(areaTotal)} ha
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span style={{
                      background: 'rgba(96,165,250,0.15)', color: '#60a5fa',
                      border: '1px solid rgba(96,165,250,0.3)',
                      borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 800,
                    }}>
                      {talhoes.length}
                    </span>
                    {isOpen ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ paddingTop: 8 }}>
                      {talhoes.map(t => (
                        <TalhaoCard
                          key={`${t.fundo}-${t.talhao}`}
                          rec={t}
                          onNavigate={handleNavigate}
                          highlight={search}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── VIEW: Lista Completa ───────────────────────────────────── */}
          {!loading && viewMode === 'lista' && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, textAlign: 'center' }}>
                {filtered.length} talhão{filtered.length !== 1 ? 'es' : ''} com experimentos
              </div>
              {filtered.map(t => (
                <TalhaoCard
                  key={`${t.fundo}-${t.talhao}`}
                  rec={t}
                  onNavigate={handleNavigate}
                  highlight={search}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
