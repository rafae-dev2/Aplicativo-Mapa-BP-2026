/**
 * MenuLateral v112 — Menu lateral deslizante com módulos do app e Glass Liquid
 *
 * Módulos:
 * - Experimentos 2026
 * - Velocidade dos Equipamentos (iframe)
 * - Escala 6x2 Geral (iframe)
 * - Mapa de Fundos
 * - Planejamento 2026
 * - Sobre o App
 */

import { lazy, Suspense, useState } from 'react';
import { X, ChevronRight, Minimize2, ExternalLink, Maximize2 } from 'lucide-react';

// O módulo só é necessário após a escolha explícita no menu.
const ExperimentosModal = lazy(() => import('./ExperimentosModal'));

interface MenuLateralProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTalhao?: (fundo: number, talhao: number) => void;
}

interface MenuItem {
  id: string;
  emoji: string;
  label: string;
  description: string;
  color: string;
  badge?: string;
  onClick: () => void;
}

const VELOCIDADE_URL = 'https://wondrous-lolly-573a25.netlify.app/';
const ESCALA_URL     = 'https://extraordinary-kringle-64df8e.netlify.app/';

// ── Componente genérico de painel iframe ─────────────────────────────────────
interface IframePanelProps {
  url: string;
  title: string;
  emoji: string;
  subtitle: string;
  accentColor: string;
  minimizedLabel: string;
  expandLabel: string;
  isMinimized: boolean;
  isLoaded: boolean;
  minimizedBottom?: number;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
  onLoad: () => void;
}

function IframePanel({
  url, title, emoji, subtitle, accentColor,
  minimizedLabel, expandLabel,
  isMinimized, isLoaded,
  minimizedBottom = 80,
  onMinimize, onExpand, onClose, onLoad,
}: IframePanelProps) {
  const hex = accentColor;
  const hexAlpha = (a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

  return (
    <>
      {/* Overlay escuro (só quando expandido) */}
      {!isMinimized && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9980,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={onClose}
        />
      )}

      {/* Painel */}
      <div className="bp-iframe-panel bp-main-menu-panel" style={{
        position: 'fixed',
        zIndex: 9981,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        ...(isMinimized ? {
          bottom: minimizedBottom, right: 16,
          width: 230, height: 'auto',
          borderRadius: 16,
        } : {
          top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: 0,
        }),
        background: 'var(--bp-glass-bg-strong)',
        backdropFilter: 'blur(32px) saturate(185%)',
        WebkitBackdropFilter: 'blur(32px) saturate(185%)',
        border: isMinimized ? `1px solid ${hexAlpha(0.3)}` : '1px solid rgba(173,255,47,0.12)',
        boxShadow: isMinimized
          ? `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px ${hexAlpha(0.15)}`
          : '0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUpModal 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Header */}
        <div style={{
          padding: isMinimized ? '10px 12px' : '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
          background: isMinimized ? 'transparent' : `linear-gradient(135deg, ${hexAlpha(0.08)}, transparent)`,
        }}>
          {/* Ícone */}
          <div style={{
            width: isMinimized ? 32 : 44, height: isMinimized ? 32 : 44,
            borderRadius: 12, flexShrink: 0,
            background: hexAlpha(0.12), border: `1px solid ${hexAlpha(0.3)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isMinimized ? 16 : 22,
          }}>
            {emoji}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {isMinimized ? (
              <div style={{ fontSize: 12, fontWeight: 700, color: hex, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {minimizedLabel}
              </div>
            ) : (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  color: hexAlpha(0.7), textTransform: 'uppercase',
                }}>
                  {subtitle}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: 'white', marginTop: 1 }}>
                  {title}
                </div>
              </>
            )}
          </div>

          {/* Botões de controle */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {/* Abrir em nova aba */}
            <CtrlBtn
              onClick={() => window.open(url, '_blank')}
              title="Abrir em nova aba"
              bg="rgba(255,255,255,0.06)"
              border="rgba(255,255,255,0.12)"
              color="rgba(255,255,255,0.5)"
            >
              <ExternalLink size={13} />
            </CtrlBtn>

            {/* Minimizar / Expandir */}
            <CtrlBtn
              onClick={isMinimized ? onExpand : onMinimize}
              title={isMinimized ? 'Expandir' : 'Minimizar'}
              bg={hexAlpha(0.1)}
              border={hexAlpha(0.25)}
              color={hex}
            >
              {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            </CtrlBtn>

            {/* Fechar */}
            <CtrlBtn
              onClick={onClose}
              title="Fechar"
              bg="rgba(255,255,255,0.06)"
              border="rgba(255,255,255,0.12)"
              color="rgba(255,255,255,0.6)"
            >
              <X size={13} />
            </CtrlBtn>
          </div>
        </div>

        {/* Iframe (só quando expandido) */}
        {!isMinimized && (
          <div style={{ flex: 1, position: 'relative', background: '#0a101a' }}>
            {/* Spinner de loading */}
            {!isLoaded && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 14,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  border: `3px solid ${hexAlpha(0.15)}`,
                  borderTop: `3px solid ${hex}`,
                  animation: 'spin 0.8s linear infinite',
                }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                  Carregando {title}...
                </div>
              </div>
            )}
            <iframe
              src={url}
              title={title}
              onLoad={onLoad}
              style={{
                width: '100%', height: '100%',
                border: 'none',
                opacity: isLoaded ? 1 : 0,
                transition: 'opacity 0.5s',
              }}
              allow="geolocation; fullscreen"
            />
          </div>
        )}

        {/* Card minimizado: botão de expandir */}
        {isMinimized && (
          <div style={{ padding: '8px 12px 12px' }}>
            <button
              onClick={onExpand}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 10,
                background: hexAlpha(0.12), border: `1px solid ${hexAlpha(0.3)}`,
                color: hex, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Maximize2 size={13} /> {expandLabel}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Botão de controle do painel ───────────────────────────────────────────────
function CtrlBtn({ children, onClick, title, bg, border, color }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  bg: string; border: string; color: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28, borderRadius: 8,
        background: hover ? bg.replace(/[\d.]+\)$/, '0.18)') : bg,
        border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color, transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MenuLateral({ isOpen, onClose, onNavigateToTalhao }: MenuLateralProps) {
  const [showExperimentos, setShowExperimentos] = useState(false);

  // Velocidade dos Equipamentos
  const [showVelocidade, setShowVelocidade]     = useState(false);
  const [velMinimized, setVelMinimized]         = useState(false);
  const [velLoaded, setVelLoaded]               = useState(false);

  // Escala 6x2 Geral
  const [showEscala, setShowEscala]             = useState(false);
  const [escalaMinimized, setEscalaMinimized]   = useState(false);
  const [escalaLoaded, setEscalaLoaded]         = useState(false);

  const anyPanelOpen = isOpen || showExperimentos || showVelocidade || showEscala;
  if (!anyPanelOpen) return null;

  const menuItems: MenuItem[] = [
    {
      id: 'experimentos',
      emoji: '🔬',
      label: 'Experimentos 2026',
      description: '468 talhões · 40 tipos · 8.132 ha',
      color: '#ADFF2F',
      badge: 'NOVO',
      onClick: () => { setShowExperimentos(true); onClose(); },
    },
    {
      id: 'velocidade',
      emoji: '🚜',
      label: 'Velocidade dos Equipamentos',
      description: 'Monitoramento em tempo real',
      color: '#fb923c',
      badge: 'AO VIVO',
      onClick: () => {
        setShowVelocidade(true);
        setVelMinimized(false);
        setVelLoaded(false);
        onClose();
      },
    },
    {
      id: 'escala',
      emoji: '📅',
      label: 'Escala 6x2 Geral',
      description: 'Escala de trabalho dos colaboradores',
      color: '#34d399',
      badge: 'NOVO',
      onClick: () => {
        setShowEscala(true);
        setEscalaMinimized(false);
        setEscalaLoaded(false);
        onClose();
      },
    },
    {
      id: 'mapa',
      emoji: '🗺️',
      label: 'Mapa de Fundos',
      description: '1.407 talhões · 257 fazendas',
      color: '#60a5fa',
      onClick: () => onClose(),
    },
    {
      id: 'planejamento',
      emoji: '📋',
      label: 'Planejamento 2026',
      description: 'Colheita · TCH · Variedades',
      color: '#f59e0b',
      onClick: () => onClose(),
    },
    {
      id: 'sobre',
      emoji: 'ℹ️',
      label: 'Sobre o App',
      description: 'Versão 112 · Mapas Branco Peres',
      color: '#8b5cf6',
      onClick: () => onClose(),
    },
  ];

  return (
    <>
      {/* ── Overlay do menu ── */}
      {isOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9990,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={onClose}
        />
      )}

      {/* ── Drawer lateral ── */}
      {isOpen && (
        <div className="bp-main-menu-panel" style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9991,
          width: 'min(320px, 88vw)',
          background: 'var(--bp-glass-bg-strong)',
          backdropFilter: 'blur(32px) saturate(185%)',
          WebkitBackdropFilter: 'blur(32px) saturate(185%)',
          borderLeft: '1px solid var(--bp-glass-border-accent)',
          boxShadow: 'var(--bp-glass-shadow)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          animation: 'slideInRight 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div className="bp-main-menu-header" style={{
            padding: '20px 16px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <img
              src="/header-logo.png"
              alt="Logo"
              style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }}
            />
            <div style={{ flex: 1 }}>
              <div className="bp-menu-brand-title" style={{
                fontSize: 14, fontWeight: 900,
                background: 'linear-gradient(90deg, #ADFF2F, #FFEB3B)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                Mapas Branco Peres
              </div>
              <div className="bp-menu-brand-subtitle" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Sistema Agrícola Avançado</div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Label seção */}
          <div className="bp-menu-section-label" style={{
            padding: '12px 16px 6px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
          }}>
            Módulos
          </div>

          {/* Lista de itens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 20px' }}>
            {menuItems.map((item, idx) => (
              <MenuItemCard key={item.id} item={item} isFirst={idx === 0} />
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em' }}>
              MAPAS BRANCO PERES · v112 · Safra 2026
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Experimentos ── */}
      {showExperimentos && (
        <Suspense fallback={null}>
          <ExperimentosModal
            onClose={() => setShowExperimentos(false)}
            onNavigateToTalhao={onNavigateToTalhao}
          />
        </Suspense>
      )}

      {/* ── Painel: Velocidade dos Equipamentos ── */}
      {showVelocidade && (
        <IframePanel
          url={VELOCIDADE_URL}
          title="Velocidade dos Equipamentos"
          emoji="🚜"
          subtitle="Monitoramento em Tempo Real"
          accentColor="#fb923c"
          minimizedLabel="🚜 Velocidade dos Equipamentos"
          expandLabel="Expandir Painel"
          isMinimized={velMinimized}
          isLoaded={velLoaded}
          minimizedBottom={showEscala && escalaMinimized ? 160 : 80}
          onMinimize={() => setVelMinimized(true)}
          onExpand={() => setVelMinimized(false)}
          onClose={() => setShowVelocidade(false)}
          onLoad={() => setVelLoaded(true)}
        />
      )}

      {/* ── Painel: Escala 6x2 Geral ── */}
      {showEscala && (
        <IframePanel
          url={ESCALA_URL}
          title="Escala 6x2 Geral"
          emoji="📅"
          subtitle="Escala de Trabalho · Safra 2026"
          accentColor="#34d399"
          minimizedLabel="📅 Escala 6x2 Geral"
          expandLabel="Expandir Escala"
          isMinimized={escalaMinimized}
          isLoaded={escalaLoaded}
          minimizedBottom={showVelocidade && velMinimized ? 160 : 80}
          onMinimize={() => setEscalaMinimized(true)}
          onExpand={() => setEscalaMinimized(false)}
          onClose={() => setShowEscala(false)}
          onLoad={() => setEscalaLoaded(true)}
        />
      )}
    </>
  );
}

// ── Card de item do menu ──────────────────────────────────────────────────────
function MenuItemCard({ item, isFirst }: { item: MenuItem; isFirst: boolean }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      className="bp-menu-item-card"
      onClick={item.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 12px', marginBottom: 6, borderRadius: 14,
        background: hover
          ? `linear-gradient(135deg, ${item.color}18, rgba(255,255,255,0.06))`
          : isFirst ? `linear-gradient(135deg, ${item.color}10, rgba(255,255,255,0.045))` : 'linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.025))',
        border: `1px solid ${hover ? `${item.color}45` : isFirst ? `${item.color}28` : 'rgba(255,255,255,0.10)'}`,
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        backdropFilter: 'blur(18px) saturate(160%)',
        boxShadow: hover ? `0 12px 30px rgba(0,0,0,0.28), 0 0 0 1px ${item.color}18` : 'inset 0 1px 0 rgba(255,255,255,0.08)',
        cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
      }}
    >
      {/* Ícone */}
      <div className="bp-menu-item-icon" style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: `${item.color}15`, border: `1px solid ${item.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>
        {item.emoji}
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="bp-menu-item-label" style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            {item.label}
          </span>
          {item.badge && (
            <span className="bp-menu-item-badge" style={{
              fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
              background: `${item.color}22`, color: item.color,
              border: `1px solid ${item.color}44`, letterSpacing: '0.05em',
            }}>
              {item.badge}
            </span>
          )}
        </div>
        <div className="bp-menu-item-description" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
          {item.description}
        </div>
      </div>

      {/* Seta */}
      <ChevronRight
        size={16}
        color={hover ? item.color : 'rgba(255,255,255,0.2)'}
        style={{ flexShrink: 0, transition: 'color 0.2s' }}
      />
    </button>
  );
}
