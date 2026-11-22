/**
 * PopupContent v88 — Modal de Talhão com dados do Planejamento de Colheita 2026
 *
 * Layout responsivo para celular (bottom-sheet), tablet e desktop (card flutuante).
 * Inclui abas: Identificação | Planejamento | Operacional | Resumo do Fundo
 */

import { X, MapPin, Share2, Copy, Check, Navigation, ChevronRight, Leaf, BarChart2, Settings, Info, Flame, LocateFixed } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePlanejamento, type TalhaoData, type FundoResumo } from '@/hooks/usePlanejamento';

interface PopupContentProps {
  fundo:    number;
  talhao:   number;
  zona:     number | string;
  hectares: string;
  lng:      number;
  lat:      number;
  onClose:  () => void;
  onShare:  (context?: { farmName?: string }) => void;
  onAddPoi: () => void;
  onFireAlert?: () => void;
  onBurnedArea?: () => void;
  onRoute?: () => void;
  presentation?: 'popup' | 'sheet';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined || v === '-' || v === '') return '—';
  return `${v}${suffix}`;
}

function fmtNum(v: number | null | undefined, decimals = 2, suffix = ''): string {
  if (v === null || v === undefined || v === 0) return '—';
  return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

// Cor do estágio (ciclo da cana)
function estagioColor(estagio: string | null | undefined): string {
  if (!estagio) return '#6b7280';
  const e = estagio.toUpperCase();
  if (e.includes('AGPL') || e.includes('PLAN')) return '#8b5cf6'; // plantio
  if (e.includes('1º') || e.includes('1°') || e.includes('1C'))  return '#06b6d4'; // 1ª soca
  if (e.includes('2º') || e.includes('2°') || e.includes('2C'))  return '#3b82f6';
  if (e.includes('3º') || e.includes('3°') || e.includes('3C'))  return '#10b981';
  if (e.includes('4º') || e.includes('4°') || e.includes('4C'))  return '#f59e0b';
  if (e.includes('5º') || e.includes('5°') || e.includes('5C'))  return '#f97316';
  if (e.includes('6º') || e.includes('6°') || e.includes('6C'))  return '#ef4444';
  if (e.includes('CP') || e.includes('7º') || e.includes('8º'))  return '#dc2626';
  return '#6b7280';
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="bp-popup-row" style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    gap: 8,
  }}>
    <span className="bp-popup-label" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{label}</span>
    <span className={accent ? 'bp-popup-value bp-popup-value-accent' : 'bp-popup-value'} style={{
      fontSize: 13,
      fontWeight: accent ? 700 : 500,
      color: accent ? '#ADFF2F' : 'rgba(255,255,255,0.88)',
      textAlign: 'right',
      wordBreak: 'break-word',
    }}>{value}</span>
  </div>
);

const Badge = ({ text, color }: { text: string; color: string }) => (
  <span className="bp-popup-badge" style={{
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    background: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
    letterSpacing: '0.03em',
  }}>{text}</span>
);

const SectionTitle = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="bp-popup-section-title" style={{
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '1px solid rgba(173,255,47,0.15)',
  }}>
    <span className="bp-popup-section-icon" style={{ color: '#ADFF2F', display: 'flex' }}>{icon}</span>
    <span className="bp-popup-section-label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(173,255,47,0.8)', textTransform: 'uppercase' }}>{title}</span>
  </div>
);

// ── Abas ──────────────────────────────────────────────────────────────────────

type TabId = 'info' | 'planej' | 'oper' | 'fundo';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'info',   label: 'Dados',       icon: <Info size={13} /> },
  { id: 'planej', label: 'Planejamento',icon: <BarChart2 size={13} /> },
  { id: 'oper',   label: 'Operacional', icon: <Settings size={13} /> },
  { id: 'fundo',  label: 'Fundo',       icon: <Leaf size={13} /> },
];

// ── Componente principal ──────────────────────────────────────────────────────


// Animação do logotipo
const logoAnimationStyle = `
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes glow {
    0%, 100% { filter: drop-shadow(0 0 8px rgba(173,255,47,0.3)); }
    50% { filter: drop-shadow(0 0 16px rgba(173,255,47,0.6)); }
  }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-logo-animation]')) {
  const style = document.createElement('style');
  style.setAttribute('data-logo-animation', 'true');
  style.textContent = logoAnimationStyle;
  document.head.appendChild(style);
}


export default function PopupContent({
  fundo, talhao, zona, hectares, lng, lat,
  onClose, onShare, onAddPoi, onFireAlert, onBurnedArea, onRoute, presentation = 'popup',
}: PopupContentProps) {
  const [copied, setCopied]   = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('info');
  const { getTalhaoData, getFundoResumo } = usePlanejamento();

  const plan: TalhaoData | null  = getTalhaoData(fundo, talhao);
  const resumo: FundoResumo | null = getFundoResumo(fundo);

  // Carregar dados de planejamento
  const [planningData, setPlanningData] = useState<any>(null);
  
  useEffect(() => {
    fetch('/planning_data.json')
      .then(res => res.json())
      .then(data => {
        setPlanningData(data);
      })
      .catch(err => console.error('Erro ao carregar planejamento:', err));
  }, []);
  
  // Obter dados do planejamento para este talhão
  const currentPlanning = planningData?.[String(fundo)]?.[String(talhao)] || null;


  // Se não tem dados de planejamento, mostrar apenas aba info
  const availableTabs = plan
    ? TABS
    : TABS.filter(t => t.id === 'info' || (t.id === 'fundo' && resumo));

  const handleCopy = () => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Nome da fazenda
  const fazendaNome = plan?.fazenda_nome || resumo?.nome || `Fundo ${fundo}`;

  return (
    <div
      className="glass-liquid-strong bp-popup-content bp-farm-popup-content bp-popup-shell"
      onClick={(event) => event.stopPropagation()} style={{
      background: 'linear-gradient(135deg, rgba(15,22,35,0.88), rgba(26,35,51,0.70))',
      backdropFilter: 'blur(32px) saturate(185%)',
      WebkitBackdropFilter: 'blur(32px) saturate(185%)',
      borderRadius: presentation === 'sheet' ? 0 : 22,
      border: presentation === 'sheet' ? 'none' : '1px solid rgba(173,255,47,0.16)',
      boxShadow: presentation === 'sheet' ? 'none' : '0 22px 70px rgba(0,0,0,0.52), 0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.13)',
      width: '100%',
      maxWidth: presentation === 'sheet' ? 'none' : 'min(360px, calc(100vw - 24px))',
      maxHeight: presentation === 'sheet' ? 'none' : 'min(76vh, 590px)',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="bp-popup-header" style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.105), rgba(173,255,47,0.045), rgba(255,255,255,0.025))',
        backdropFilter: 'blur(20px) saturate(170%)',
        WebkitBackdropFilter: 'blur(20px) saturate(170%)',
        padding: '12px 14px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        position: 'relative',
      }}>
        {/* No modo folha, o fechamento fica somente no cabeçalho principal do drawer. */}
        {presentation !== 'sheet' && (
          <button
            onClick={(event) => { event.stopPropagation(); onClose(); }}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
              transition: 'all 0.2s',
              backdropFilter: 'blur(14px) saturate(160%)',
              WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            }}
          >
            <X size={14} />
          </button>
        )}

        {/* Nome da fazenda */}
        <div style={{ paddingRight: 36 }}>
          <div className="bp-popup-eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(173,255,47,0.7)', textTransform: 'uppercase', marginBottom: 3 }}>
            Talhão Selecionado
          </div>
          <div className="bp-popup-farm-name" style={{ fontSize: 16, fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: 6 }}>
            {fazendaNome}
          </div>

          {/* Badges principais */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Badge text={`Fundo ${fundo}`} color="#165a72" />
            <Badge text={`Talhão ${talhao}`} color="#60a5fa" />
            {plan?.estagio && (
              <Badge text={plan.estagio} color={estagioColor(plan.estagio)} />
            )}
            {plan?.tipo_variedade && (
              <Badge text={plan.tipo_variedade} color="#f59e0b" />
            )}
          </div>
        </div>
      </div>

      {/* Ações principais ficam próximas ao título, como no detalhe de local do Google Maps. */}
      <div className="bp-sheet-primary-actions" style={{
        padding: '8px 12px',
        display: 'flex',
        gap: 8,
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))',
      }}>
        <ActionBtn
          onClick={onAddPoi}
          icon={<MapPin size={14} />}
          label="Anotação"
          color="#3b82f6"
        />
        <ActionBtn
            onClick={() => onShare({ farmName: fazendaNome })}
          icon={<Share2 size={14} />}
          label="Compartilhar"
          color="#22c55e"
        />
        {onRoute && (
          <ActionBtn
            onClick={onRoute}
            icon={<Navigation size={14} />}
            label="Rota"
            color="#8b5cf6"
          />
        )}
        {onFireAlert && (
          <ActionBtn
            onClick={onFireAlert}
            icon={<Flame size={14} />}
            label="Incêndio"
            color="#ef4444"
          />
        )}
        {onBurnedArea && (
          <ActionBtn
            onClick={onBurnedArea}
            icon={<LocateFixed size={14} />}
            label="Área GPS"
            color="#f97316"
          />
        )}
      </div>

      {/* ── Logotipo Premium com Animação ─────────────────────────────────── */}
      <div className="bp-popup-brand-section" style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '10px 0 8px',
        background: 'linear-gradient(135deg, rgba(173,255,47,0.075), rgba(255,255,255,0.025), transparent)',
        borderBottom: '1px solid rgba(173,255,47,0.12)',
      }}>
        <div className="bp-popup-brand-frame" style={{
          width: 62, height: 62, borderRadius: 20, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(173,255,47,0.15), rgba(173,255,47,0.05))',
          border: '2px solid rgba(173,255,47,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(173,255,47,0.15), inset 0 1px 2px rgba(255,255,255,0.1)',
          animation: 'float 3s ease-in-out infinite',
          position: 'relative',
        }}>
          <div className="bp-popup-brand-glow" style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 16,
            background: 'radial-gradient(circle, rgba(173,255,47,0.1) 0%, transparent 70%)',
            animation: 'glow 2s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
          <img
            src="/icon-logo.png"
            alt="Branco Peres"
            style={{
              width: 52,
              height: 52,
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))',
              animation: 'spin 20s linear infinite',
              position: 'relative',
              zIndex: 1,
            }}
          />
        </div>
      </div>

      {/* ── Abas ──────────────────────────────────────────────────────────── */}
      {availableTabs.length > 1 && (
        <div className="bp-popup-tabs" style={{
          display: 'flex',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))',
          backdropFilter: 'blur(16px) saturate(160%)',
          WebkitBackdropFilter: 'blur(16px) saturate(160%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          overflowX: 'auto',
        }}>
          {availableTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`bp-popup-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '9px 6px',
                fontSize: 11,
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#ADFF2F' : 'rgba(255,255,255,0.45)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #ADFF2F' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Conteúdo das abas ─────────────────────────────────────────────── */}
      <div className="modal-scroll" style={{ padding: '10px 12px', maxHeight: presentation === 'sheet' ? 'none' : 'min(250px, 36vh)', overflowY: presentation === 'sheet' ? 'visible' : 'auto', flex: '1 1 auto', minHeight: 0 }}>

        {/* ── ABA: DADOS (Identificação) ─────────────────────────────────── */}
        {activeTab === 'info' && (
          <div>
            <SectionTitle icon={<Info size={12} />} title="Identificação" />
            <Row label="Fundo"    value={String(fundo)} accent />
            <Row label="Talhão"   value={String(talhao)} accent />
            <Row label="Zona"     value={fmt(zona)} />
            <Row label="Área (ha)" value={plan?.area_ha ? fmtNum(plan.area_ha, 2, ' ha') : fmt(hectares.replace(/\s*ha(?:\s+ha)*\s*$/i, ''), ' ha')} />
            {plan?.variedade && <Row label="Variedade" value={fmt(plan.variedade)} />}
            {plan?.municipio && <Row label="Município" value={fmt(plan.municipio)} />}
            {plan?.proprietario && <Row label="Proprietário" value={fmt(plan.proprietario)} />}
            {plan?.prop_parc && <Row label="Prop./Parceiro" value={fmt(plan.prop_parc)} />}

            {/* Coordenadas */}
            <div className="bp-popup-coordinates" style={{
              marginTop: 10,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 10,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
              <button
                onClick={handleCopy}
                className="bp-popup-copy-btn"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: copied ? '#ADFF2F' : 'rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                  padding: '2px 6px',
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {/* ── ABA: PLANEJAMENTO ─────────────────────────────────────────── */}
        {activeTab === 'planej' && plan && (
          <div>
            <SectionTitle icon={<BarChart2 size={12} />} title="Planejamento de Colheita 2026" />

            {/* TCH — indicadores visuais */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'TCH Estimado', value: plan.tch_estim, color: '#60a5fa' },
                { label: 'TCH Reestim.', value: plan.tch_reestim, color: '#f59e0b' },
                { label: 'TCH Real',     value: plan.tch_real,   color: '#ADFF2F' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bp-popup-metric-card" style={{
                  background: `${color}11`,
                  border: `1px solid ${color}33`,
                  borderRadius: 10,
                  padding: '8px 6px',
                  textAlign: 'center',
                }}>
                  <div className="bp-popup-metric-label" style={{ fontSize: 10, color: `${color}99`, marginBottom: 3 }}>{label}</div>
                  <div className="bp-popup-metric-value" style={{ fontSize: 16, fontWeight: 800, color }}>
                    {value && value !== '-' ? value : '—'}
                  </div>
                </div>
              ))}
            </div>

            <Row label="Variedade"    value={fmt(plan.variedade)} />
            <Row label="Estágio"      value={fmt(plan.estagio)} />
            <Row label="Área (ha)"    value={fmtNum(plan.area_ha, 2, ' ha')} />
            <Row label="Área Moagem"  value={fmtNum(plan.area_moagem, 2, ' ha')} />
            <Row label="ATR"          value={fmt(plan.atr)} />
            <Row label="Dt. Colheita" value={fmt(plan.dt_colheita)} />
            <Row label="Dt. Planejada" value={fmt(plan.data_planej)} />
            <Row label="Dt. Realizada" value={fmt(plan.data_realiz)} />
            <Row label="Status"       value={fmt(plan.status)} />
          </div>
        )}

        {/* ── ABA: OPERACIONAL ──────────────────────────────────────────── */}
        {activeTab === 'oper' && plan && (
          <div>
            <SectionTitle icon={<Settings size={12} />} title="Dados Operacionais" />
            <Row label="Bloco"          value={fmt(plan.bloco)} />
            <Row label="Frente"         value={fmt(plan.frente)} />
            <Row label="Sistema"        value={fmt(plan.sistema)} />
            <Row label="Tipo Variedade" value={fmt(plan.tipo_variedade)} />
            <Row label="Prop./Parceiro" value={fmt(plan.prop_parc)} />
            <Row label="Município"      value={fmt(plan.municipio)} />
            <Row label="Proprietário"   value={fmt(plan.proprietario)} />
            <Row label="Vinhaça"        value={fmt(plan.vinhaca)} />
            <Row label="Adubação Foliar" value={fmt(plan.adubacao)} />
            <Row label="Data Plantio"   value={fmt(plan.data_plantio)} />
            {(plan.mudas && plan.mudas !== '-') && <Row label="Mudas" value={fmt(plan.mudas)} />}
            {(plan.danos_terc && plan.danos_terc !== '-') && <Row label="Danos/Terc." value={fmt(plan.danos_terc)} />}
          </div>
        )}

        {/* ── ABA: FUNDO (Resumo) ───────────────────────────────────────── */}
        {activeTab === 'fundo' && (
          <div>
            <SectionTitle icon={<Leaf size={12} />} title={`Resumo — ${resumo?.nome || `Fundo ${fundo}`}`} />
            {resumo ? (
              <>
                {/* Produção estimada — destaque */}
                {resumo.prod_est && resumo.prod_est > 0 && (
                  <div className="bp-popup-production-card" style={{
                    background: 'linear-gradient(135deg, rgba(173,255,47,0.08), rgba(255,235,59,0.05))',
                    border: '1px solid rgba(173,255,47,0.2)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    marginBottom: 10,
                    textAlign: 'center',
                  }}>
                    <div className="bp-popup-production-label" style={{ fontSize: 10, color: 'rgba(173,255,47,0.6)', marginBottom: 4 }}>PRODUÇÃO ESTIMADA 2026</div>
                    <div className="bp-popup-production-value" style={{ fontSize: 22, fontWeight: 900, color: '#ADFF2F' }}>
                      {fmtNum(resumo.prod_est, 0, ' ton')}
                    </div>
                  </div>
                )}

                <Row label="Área Estimada"  value={fmtNum(resumo.area_est, 2, ' ha')} />
                <Row label="Área Realizada" value={fmtNum(resumo.area_real, 2, ' ha')} />
                <Row label="TCH Estimado"   value={fmtNum(resumo.tch_est, 2)} accent />
                <Row label="TCH Real"       value={fmtNum(resumo.tch_real, 2)} />
                <Row label="Prod. Estimada" value={fmtNum(resumo.prod_est, 0, ' ton')} />
                <Row label="Prod. Real"     value={fmtNum(resumo.prod_real, 0, ' ton')} />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                Sem dados de resumo para este fundo
              </div>
            )}
          </div>
        )}

        {/* Sem dados de planejamento */}
        {(activeTab === 'planej' || activeTab === 'oper') && !plan && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              Sem dados de planejamento
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              Fundo {fundo} — Talhão {talhao}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Botão de ação ─────────────────────────────────────────────────────────────
function ActionBtn({ onClick, icon, label, color }: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="bp-farm-action-btn"
      aria-label={label}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '8px 3px 7px',
        borderRadius: 16,
        background: hover ? `linear-gradient(135deg, ${color}28, rgba(255,255,255,0.06))` : `linear-gradient(135deg, ${color}16, rgba(255,255,255,0.035))`,
        border: `1px solid ${color}${hover ? '55' : '33'}`,
        color: color,
        cursor: 'pointer',
        fontSize: 10.5,
        fontWeight: 750,
        lineHeight: 1.05,
        textAlign: 'center',
        overflowWrap: 'break-word',
        transition: 'all 0.2s',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        minWidth: 0,
        minHeight: 64,
        boxSizing: 'border-box',
      }}
    >
      {icon}
      <span className="bp-farm-action-label">{label}</span>
    </button>
  );
}
