/**
 * SearchDrawerLeft — Busca de Fundo/Talhao numa gaveta LATERAL ESQUERDA.
 *
 * Abre ao clicar no botao "tres riscos" (☰). Mantem exatamente a mesma logica
 * e os mesmos resultados da busca anterior (onSearch/onSelectResult/results),
 * apenas reposicionada para a lateral esquerda.
 */

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Search, X, MapPin, Layers, ChevronRight, Menu, Maximize2, Minimize2 } from 'lucide-react';

interface SearchDrawerLeftProps {
  onSearch?: (query: string) => void;
  onSelectResult?: (fundo: number, talhao: number) => void;
  results?: Array<{ fundo: number; talhao: number; nome?: string }>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} style={{ background: 'linear-gradient(135deg, #ADFF2F44, #FFEB3B44)', color: 'inherit', borderRadius: 3, padding: '0 2px' }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchDrawerLeft({
  onSearch,
  onSelectResult,
  results = [],
  onFullscreenChange,
}: SearchDrawerLeftProps) {
  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState('');
  const [focused, setFocused]         = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inputRef                      = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setActiveIdx(-1);
    onSearch?.(value);
  };

  const handleSelectResult = useCallback((fundo: number, talhao: number) => {
    onSelectResult?.(fundo, talhao);
    setQuery('');
    onSearch?.('');
    setActiveIdx(-1);
    setOpen(false);
  }, [onSelectResult, onSearch]);

  const handleClear = () => {
    setQuery('');
    setActiveIdx(-1);
    onSearch?.('');
    inputRef.current?.focus();
  };

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    onFullscreenChange?.(next);
    if (next) { setOpen(false); document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = 'auto'; }
  };

  // Focar input ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 220);
  }, [open]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const r = results[activeIdx >= 0 ? activeIdx : 0];
      handleSelectResult(r.fundo, r.talhao);
    }
  };

  return (
    <>
      {/* Botão ☰ (três riscos) — abre a busca na lateral esquerda */}
      {!isFullscreen && !open && (
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bp-open-farm-search'));
            setOpen(true);
          }}
          aria-label="Abrir busca de fundos"
          className="bp-search-launcher glass-liquid-button"
          style={{
            position: 'fixed', top: 92, left: 12, zIndex: 46,
            display: 'flex', alignItems: 'center', gap: 8,
            height: 44, padding: '0 14px 0 12px', borderRadius: 14,
            background: 'var(--bp-control-bg)',
            border: '1.5px solid var(--bp-accent-border)',
            color: 'var(--bp-control-text)', cursor: 'pointer',
            backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            boxShadow: '0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
            transition: 'transform 0.2s ease, border-color 0.2s ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
        >
          <Menu size={20} color="#ADFF2F" />
          <Search size={15} color="rgba(233,255,211,0.85)" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Buscar fundo</span>
        </button>
      )}

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="bp-search-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 47,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Gaveta lateral esquerda */}
      {open && (
        <div
          className="glass-liquid-strong bp-search-drawer"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 48,
            width: 'min(360px, 90vw)',
            background: 'var(--bp-glass-bg-strong)',
            backdropFilter: 'blur(32px) saturate(185%)', WebkitBackdropFilter: 'blur(32px) saturate(185%)',
            borderRight: '1px solid var(--bp-glass-border-accent)',
            boxShadow: 'var(--bp-glass-shadow)',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            animation: 'slideInLeft 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Header da gaveta */}
          <div className="bp-search-drawer-header" style={{
            padding: '18px 16px 12px', borderBottom: '1px solid var(--bp-glass-border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div className="bp-search-drawer-icon" style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: 'rgba(173,255,47,0.12)', border: '1px solid rgba(173,255,47,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Search size={18} color="#ADFF2F" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="bp-search-drawer-kicker" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--bp-text-muted)', textTransform: 'uppercase' }}>
                Mapa de Fundos
              </div>
              <div className="bp-search-drawer-title" style={{ fontSize: 16, fontWeight: 900, color: 'var(--bp-heading)' }}>Buscar Fundo / Talhão</div>
            </div>
            <button
              onClick={toggleFullscreen}
              title="Tela cheia"
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: 'rgba(173,255,47,0.08)', border: '1px solid rgba(173,255,47,0.2)',
                color: '#ADFF2F', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title="Fechar"
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--bp-control-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Campo de busca */}
          <div style={{ padding: '14px 16px 8px' }}>
            <div
              className={`bp-search-field${focused ? ' is-focused' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: focused ? 'var(--bp-accent-soft)' : 'var(--bp-input-bg)',
                borderRadius: 14, padding: '11px 14px',
                border: focused ? '1.5px solid var(--bp-accent-border)' : '1.5px solid var(--bp-input-border)',
                boxShadow: focused ? '0 0 0 3px var(--bp-focus-ring)' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                transition: 'all 0.2s ease', cursor: 'text',
              }}
              onClick={() => inputRef.current?.focus()}
            >
              <Search size={17} style={{ color: focused ? 'var(--bp-accent)' : 'var(--bp-control-muted)', strokeWidth: 2.5, flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder="Digite o fundo ou talhão..."
                inputMode="numeric"
              className="bp-search-input"
                style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--bp-text-main)', fontSize: 15, caretColor: 'var(--bp-accent)',
                }}
              />
              {query && results.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bp-text-main)', background: 'var(--bp-accent-soft)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>
                  {results.length}
                </span>
              )}
              {query && (
                <button onClick={handleClear} style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0, padding: 0,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--bp-control-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <X size={13} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Resultados */}
          <div className="search-dropdown" style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px' }}>
            {results.length > 0 && (
              <>
                <div style={{ padding: '8px 4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={12} style={{ color: 'var(--bp-accent)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--bp-text-muted)', textTransform: 'uppercase' }}>
                    {results.length} resultado{results.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {results.map((result, idx) => {
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectResult(result.fundo, result.talhao)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`bp-search-result${isActive ? ' is-active' : ''}`}
                      style={{
                        width: '100%', textAlign: 'left', padding: '11px 12px', marginBottom: 4,
                        borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
                        background: isActive ? 'linear-gradient(90deg, rgba(173,255,47,0.12), rgba(255,235,59,0.06))' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(173,255,47,0.3)' : '1px solid rgba(255,255,255,0.07)',
                        cursor: 'pointer', transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: isActive ? 'rgba(173,255,47,0.2)' : 'rgba(255,255,255,0.05)',
                        border: isActive ? '1px solid rgba(173,255,47,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <MapPin size={15} style={{ color: isActive ? 'var(--bp-accent)' : 'var(--bp-text-soft)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,                         color: isActive ? 'var(--bp-heading)' : 'var(--bp-text-main)' }}>
                        <span style={{ color: isActive ? 'var(--bp-accent)' : 'var(--bp-text-main)', fontWeight: 700 }}>
                          <Highlight text={`Fundo ${result.fundo}`} query={query} />
                        </span>
                        <ChevronRight size={12} style={{ color: 'var(--bp-text-soft)', flexShrink: 0 }} />
                        <span><Highlight text={`Talhão ${result.talhao}`} query={query} /></span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {results.length === 0 && query.length >= 1 && (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--bp-text-muted)', fontSize: 13 }}>
                Nenhum resultado encontrado
              </div>
            )}

            {query.length === 0 && (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--bp-text-soft)', fontSize: 13 }}>
                Digite um número de fundo ou talhão para localizar no mapa.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botão para sair da tela cheia */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          title="Sair da tela cheia"
          style={{
            position: 'fixed', top: 16, right: 16, zIndex: 50,
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--bp-control-bg)', border: '1.5px solid var(--bp-accent-border)',
            color: 'var(--bp-control-text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <Minimize2 size={24} />
        </button>
      )}
    </>
  );
}
