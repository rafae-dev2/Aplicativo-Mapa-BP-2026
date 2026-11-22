/**
 * SearchBarFixed v93 — Barra de pesquisa com modo robusto de ocultar/expandir
 *
 * Design inspirado em interfaces premium com:
 * - Glassmorphism com backdrop-filter blur
 * - Modo robusto de ocultar (ocultando cabeçalho também)
 * - Modo expandir para mostrar mapa inteiro
 * - Sombra multicamada (neumorphism suave)
 * - Ícone de busca animado
 * - Dropdown com animação de entrada suave
 * - Highlight do texto buscado nos resultados
 * - Indicador de quantidade de resultados
 * - Suporte a teclado (Enter, Escape, ArrowUp/Down)
 */

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Search, X, MapPin, Layers, ChevronRight, Hash, Maximize2, Minimize2 } from 'lucide-react';

interface SearchBarFixedProps {
  onSearch?: (query: string) => void;
  onSelectResult?: (fundo: number, talhao: number) => void;
  results?: Array<{ fundo: number; talhao: number; nome?: string }>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

// Destacar o texto buscado no resultado
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            style={{
              background: 'linear-gradient(135deg, #ADFF2F44, #FFEB3B44)',
              color: 'inherit',
              borderRadius: 3,
              padding: '0 2px',
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchBarFixed({
  onSearch,
  onSelectResult,
  results = [],
  onFullscreenChange,
}: SearchBarFixedProps) {
  const [query, setQuery]             = useState('');
  const [showResults, setShowResults] = useState(false);
  const [focused, setFocused]         = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inputRef                      = useRef<HTMLInputElement>(null);
  const containerRef                  = useRef<HTMLDivElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setActiveIdx(-1);
    onSearch?.(value);
    setShowResults(value.length >= 1);
  };

  const handleSelectResult = useCallback((fundo: number, talhao: number) => {
    onSelectResult?.(fundo, talhao);
    setQuery('');
    setShowResults(false);
    setActiveIdx(-1);
    inputRef.current?.blur();
  }, [onSelectResult]);

  const handleClear = () => {
    setQuery('');
    setShowResults(false);
    setActiveIdx(-1);
    onSearch?.('');
    inputRef.current?.focus();
  };

  const toggleFullscreen = () => {
    const newFullscreen = !isFullscreen;
    setIsFullscreen(newFullscreen);
    onFullscreenChange?.(newFullscreen);
    
    if (newFullscreen) {
      // Ocultar cabeçalho e barra
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
      inputRef.current?.focus();
    }
  };

  // Navegação por teclado
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const r = results[activeIdx];
      handleSelectResult(r.fundo, r.talhao);
    } else if (e.key === 'Escape') {
      setShowResults(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
    }
  };

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isOpen = showResults && (results.length > 0 || query.length >= 1);

  return (
    <>
      <style>{`
        @keyframes searchDropdownIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-20px);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .search-bar-hidden {
          animation: fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .search-bar-visible {
          animation: fadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @media (max-width: 768px) {
          .search-container {
            padding: 8px 10px !important;
          }
          .search-input-wrapper {
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* Barra de Pesquisa - Oculta em fullscreen */}
      {!isFullscreen && (
        <div
          ref={containerRef}
          className="search-bar-visible"
          style={{
            position: 'fixed',
            top: '80px',
            left: 0,
            right: 0,
            zIndex: 45,
            padding: '10px 12px 8px',
            background: 'linear-gradient(135deg, rgba(26,35,51,0.6), rgba(42,51,67,0.4))',
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
            borderBottom: isOpen
              ? '1px solid rgba(173,255,47,0.2)'
              : '1px solid rgba(173,255,47,0.1)',
            boxShadow: isOpen
              ? '0 12px 40px rgba(0,0,0,0.3), 0 2px 12px rgba(173,255,47,0.12), inset 0 1px 0 rgba(255,255,255,0.08)'
              : '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* ── Campo de busca ─────────────────────────────────────────────────── */}
          <div
            className="search-container"
            style={{
              position: 'relative',
              maxWidth: 680,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Botão de fullscreen */}
            <button
              onClick={toggleFullscreen}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 50,
                background: 'rgba(173,255,47,0.08)',
                border: '1.5px solid rgba(173,255,47,0.15)',
                color: '#ADFF2F',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(173,255,47,0.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(173,255,47,0.08)';
              }}
              title="Modo tela cheia"
            >
              <Maximize2 size={18} />
            </button>

            <div
              className="search-input-wrapper"
              style={{
                position: 'relative',
                flex: 1,
                maxWidth: 680,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: focused
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(255,255,255,0.07)',
                  borderRadius: 50,
                  padding: '10px 16px',
                  border: focused
                    ? '1.5px solid rgba(173,255,47,0.55)'
                    : '1.5px solid rgba(255,255,255,0.10)',
                  boxShadow: focused
                    ? '0 0 0 3px rgba(173,255,47,0.12), 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)'
                    : '0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'text',
                }}
                onClick={() => inputRef.current?.focus()}
              >
                {/* Ícone de busca */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: focused
                      ? 'linear-gradient(135deg, rgba(173,255,47,0.25), rgba(255,235,59,0.15))'
                      : 'rgba(255,255,255,0.06)',
                    transition: 'all 0.25s ease',
                    flexShrink: 0,
                  }}
                >
                  <Search
                    size={16}
                    style={{
                      color: focused ? '#ADFF2F' : 'rgba(255,255,255,0.5)',
                      transition: 'color 0.25s ease',
                      strokeWidth: 2.5,
                    }}
                  />
                </div>

                {/* Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  onFocus={() => {
                    setFocused(true);
                    if (query.length >= 1) setShowResults(true);
                  }}
                  onBlur={() => setFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder="Buscar fundo ou talhão..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: 15,
                    fontWeight: 400,
                    letterSpacing: '0.01em',
                    caretColor: '#ADFF2F',
                  }}
                />

                {/* Contador de resultados */}
                {query && results.length > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#ADFF2F',
                      background: 'rgba(173,255,47,0.12)',
                      borderRadius: 20,
                      padding: '2px 8px',
                      whiteSpace: 'nowrap',
                      letterSpacing: '0.02em',
                      flexShrink: 0,
                    }}
                  >
                    {results.length}
                  </span>
                )}

                {/* Botão limpar */}
                {query && (
                  <button
                    onClick={handleClear}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.6)',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,100,100,0.2)';
                      (e.currentTarget as HTMLButtonElement).style.color = '#ff6b6b';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)';
                    }}
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* ── Dropdown de resultados ──────────────────────────────────────── */}
              {isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    right: 0,
                    background: 'rgba(20,28,42,0.97)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                    maxHeight: 320,
                    overflowY: 'auto',
                    zIndex: 100,
                    animation: 'searchDropdownIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  {/* Resultados */}
                  {results.length > 0 && (
                    <>
                      {/* Header do dropdown */}
                      <div
                        style={{
                          padding: '10px 14px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <Layers size={12} style={{ color: 'rgba(173,255,47,0.7)' }} />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: 'rgba(173,255,47,0.7)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {results.length} resultado{results.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {results.map((result, idx) => {
                        const label = `Fundo ${result.fundo} — Talhão ${result.talhao}`;
                        const isActive = idx === activeIdx;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectResult(result.fundo, result.talhao)}
                            onMouseEnter={() => setActiveIdx(idx)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '11px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: isActive
                                ? 'linear-gradient(90deg, rgba(173,255,47,0.10), rgba(255,235,59,0.06))'
                                : 'transparent',
                              border: 'none',
                              borderBottom: idx < results.length - 1
                                ? '1px solid rgba(255,255,255,0.04)'
                                : 'none',
                              cursor: 'pointer',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            {/* Ícone */}
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                background: isActive
                                  ? 'linear-gradient(135deg, rgba(173,255,47,0.2), rgba(255,235,59,0.12))'
                                  : 'rgba(255,255,255,0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'background 0.15s ease',
                                border: isActive
                                  ? '1px solid rgba(173,255,47,0.25)'
                                  : '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              <MapPin
                                size={14}
                                style={{
                                  color: isActive ? '#ADFF2F' : 'rgba(255,255,255,0.4)',
                                  transition: 'color 0.15s ease',
                                }}
                              />
                            </div>

                            {/* Texto */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.80)',
                                  transition: 'color 0.15s ease',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <span style={{ color: isActive ? '#ADFF2F' : 'rgba(173,255,47,0.7)', fontWeight: 700 }}>
                                  <Highlight text={`Fundo ${result.fundo}`} query={query} />
                                </span>
                                <ChevronRight size={12} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                                <span>
                                  <Highlight text={`Talhão ${result.talhao}`} query={query} />
                                </span>
                              </div>
                              {result.nome && (
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                                  {result.nome}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* Sem resultados */}
                  {results.length === 0 && query.length >= 1 && (
                    <div
                      style={{
                        padding: '20px 14px',
                        textAlign: 'center',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 13,
                      }}
                    >
                      Nenhum resultado encontrado
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Botão Fullscreen Flutuante - Visível em fullscreen */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 50,
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'rgba(26,35,51,0.9)',
            border: '1.5px solid rgba(173,255,47,0.3)',
            color: '#ADFF2F',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26,35,51,0.95)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(173,255,47,0.6)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26,35,51,0.9)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(173,255,47,0.3)';
          }}
          title="Sair do modo tela cheia"
        >
          <Minimize2 size={24} />
        </button>
      )}
    </>
  );
}
