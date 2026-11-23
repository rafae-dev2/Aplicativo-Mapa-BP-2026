import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, SlidersHorizontal, X } from 'lucide-react';
import type { POI } from './POIManager';
import { WATER_TRUCK_ICON } from './PoiMarkerIcon';
import {
  WATER_TRUCK_CATEGORIES,
  TRUCK_CATEGORIES,
  WATER_AND_TRUCK_CATEGORIES,
  isGroupHidden,
  countCategoryGroup,
} from '@/lib/poiVisibility';

interface MapVisibilityControlProps {
  pois: POI[];
  hiddenCategories: ReadonlySet<string>;
  onToggleGroup: (categories: readonly string[]) => void;
  onShowAll: () => void;
  onOpenAdvancedLayers: () => void;
  disabled?: boolean;
}

export default function MapVisibilityControl({
  pois,
  hiddenCategories,
  onToggleGroup,
  onShowAll,
  onOpenAdvancedLayers,
  disabled = false,
}: MapVisibilityControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const waterHidden = isGroupHidden(hiddenCategories, WATER_TRUCK_CATEGORIES);
  const trucksHidden = isGroupHidden(hiddenCategories, TRUCK_CATEGORIES);
  const bothHidden = isGroupHidden(hiddenCategories, WATER_AND_TRUCK_CATEGORIES);
  const hiddenCount = hiddenCategories.size;

  const waterCount = countCategoryGroup(pois, WATER_TRUCK_CATEGORIES);
  const truckCount = countCategoryGroup(pois, TRUCK_CATEGORIES);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex flex-col items-end">
      <button
        type="button"
        data-testid="quick-visibility-btn"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`bp-map-essential-control glass-liquid-button relative flex items-center justify-center ${
          open || hiddenCount > 0 ? 'is-active' : ''
        }`}
        aria-expanded={open}
        aria-controls="quick-visibility-panel"
        aria-label={
          hiddenCount > 0
            ? `Ocultar ou mostrar ícones no mapa (${hiddenCount} filtros ocultos)`
            : 'Ocultar represas, pegadores de água e caminhões'
        }
        title="Ocultar represas, pegadores de água e caminhões"
        style={{
          minWidth: 44,
          minHeight: 44,
          borderColor: hiddenCount > 0 ? 'var(--bp-accent-border)' : undefined,
          color: hiddenCount > 0 ? 'var(--bp-accent)' : undefined,
        }}
      >
        {hiddenCount > 0 ? <EyeOff size={19} strokeWidth={2.35} /> : <Eye size={19} strokeWidth={2.35} />}
        {hiddenCount > 0 && (
          <span
            data-testid="quick-visibility-badge"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--bp-accent)',
              color: 'var(--bp-accent-contrast)',
              fontSize: 10,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontVariantNumeric: 'tabular-nums',
              boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
            }}
          >
            {hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="quick-visibility-panel"
          data-testid="quick-visibility-panel"
          role="dialog"
          aria-label="Visibilidade de ícones no mapa"
          className="glass-liquid-strong"
          style={{
            position: 'absolute',
            top: 0,
            right: 52,
            zIndex: 62,
            width: 'min(308px, calc(100vw - 76px))',
            padding: 16,
            borderRadius: 18,
            background: 'var(--bp-panel-bg)',
            border: '1px solid var(--bp-glass-border-accent)',
            boxShadow: 'var(--bp-glass-shadow)',
            backdropFilter: 'blur(26px) saturate(180%)',
            WebkitBackdropFilter: 'blur(26px) saturate(180%)',
            color: 'var(--bp-panel-text)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--bp-heading)', lineHeight: 1.2 }}>
                Visibilidade no Mapa
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--bp-panel-muted)', marginTop: 2 }}>
                Oculte ícones para limpar a visualização
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar painel de visibilidade"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bp-input-bg)',
                border: '1px solid var(--bp-glass-border)',
                color: 'var(--bp-panel-muted)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Toggle 1: Represas e Pegadores de Água */}
            <button
              type="button"
              data-testid="toggle-represa-visibility"
              aria-pressed={waterHidden}
              onClick={() => onToggleGroup(WATER_TRUCK_CATEGORIES)}
              style={{
                width: '100%',
                minHeight: 54,
                padding: '9px 12px',
                borderRadius: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                cursor: 'pointer',
                background: waterHidden ? 'var(--bp-input-bg)' : 'var(--bp-accent-soft)',
                border: `1px solid ${waterHidden ? 'var(--bp-glass-border)' : 'var(--bp-accent-border)'}`,
                color: 'var(--bp-panel-text)',
                transition: 'background 160ms ease, border-color 160ms ease, opacity 160ms ease',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(14,165,233,0.14)',
                  border: '1px solid rgba(56,189,248,0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: waterHidden ? 0.45 : 1,
                }}
              >
                <img
                  src={WATER_TRUCK_ICON}
                  alt=""
                  aria-hidden="true"
                  style={{ width: 26, height: 26, objectFit: 'contain' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--bp-heading)', lineHeight: 1.25 }}>
                  Represas e pegadores
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--bp-panel-muted)',
                    marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {waterCount} {waterCount === 1 ? 'ponto' : 'pontos'} · {waterHidden ? 'Oculto' : 'Visível'}
                </div>
              </div>
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 21,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: waterHidden ? 'rgba(148,163,184,0.34)' : 'var(--bp-accent)',
                  position: 'relative',
                  transition: 'background 180ms ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2.5,
                    left: waterHidden ? 3 : 19,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: waterHidden ? '#ffffff' : 'var(--bp-accent-contrast)',
                    transition: 'left 180ms ease',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}
                />
              </span>
            </button>

            {/* Toggle 2: Caminhões de Transporte */}
            <button
              type="button"
              data-testid="toggle-truck-visibility"
              aria-pressed={trucksHidden}
              onClick={() => onToggleGroup(TRUCK_CATEGORIES)}
              style={{
                width: '100%',
                minHeight: 54,
                padding: '9px 12px',
                borderRadius: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                cursor: 'pointer',
                background: trucksHidden ? 'var(--bp-input-bg)' : 'var(--bp-accent-soft)',
                border: `1px solid ${trucksHidden ? 'var(--bp-glass-border)' : 'var(--bp-accent-border)'}`,
                color: 'var(--bp-panel-text)',
                transition: 'background 160ms ease, border-color 160ms ease, opacity 160ms ease',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(249,115,22,0.14)',
                  border: '1px solid rgba(251,146,60,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: trucksHidden ? 0.45 : 1,
                }}
              >
                <img
                  src="/poi-pin-transport-dump-truck.png"
                  alt=""
                  aria-hidden="true"
                  style={{ width: 28, height: 22, objectFit: 'contain' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--bp-heading)', lineHeight: 1.25 }}>
                  Caminhões (transporte)
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--bp-panel-muted)',
                    marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {truckCount} {truckCount === 1 ? 'ponto' : 'pontos'} · {trucksHidden ? 'Oculto' : 'Visível'}
                </div>
              </div>
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 21,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: trucksHidden ? 'rgba(148,163,184,0.34)' : 'var(--bp-accent)',
                  position: 'relative',
                  transition: 'background 180ms ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2.5,
                    left: trucksHidden ? 3 : 19,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: trucksHidden ? '#ffffff' : 'var(--bp-accent-contrast)',
                    transition: 'left 180ms ease',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}
                />
              </span>
            </button>
          </div>

          {/* Ação rápida: ocultar/mostrar ambos de uma vez */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--bp-glass-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <button
              type="button"
              data-testid="toggle-all-vehicles-visibility"
              onClick={() => onToggleGroup(WATER_AND_TRUCK_CATEGORIES)}
              style={{
                width: '100%',
                minHeight: 40,
                padding: '8px 12px',
                borderRadius: 11,
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                cursor: 'pointer',
                background: bothHidden ? 'var(--bp-accent)' : 'var(--bp-input-bg)',
                color: bothHidden ? 'var(--bp-accent-contrast)' : 'var(--bp-heading)',
                border: `1px solid ${bothHidden ? 'transparent' : 'var(--bp-glass-border)'}`,
                whiteSpace: 'nowrap',
              }}
            >
              {bothHidden ? <Eye size={15} /> : <EyeOff size={15} />}
              {bothHidden ? 'Mostrar represas e caminhões' : 'Ocultar represas e caminhões'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  data-testid="quick-visibility-show-all"
                  onClick={onShowAll}
                  style={{
                    flex: 1,
                    minHeight: 36,
                    padding: '6px 10px',
                    borderRadius: 10,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: 'var(--bp-accent-soft)',
                    border: '1px solid var(--bp-accent-border)',
                    color: 'var(--bp-accent)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Mostrar tudo
                </button>
              )}
              <button
                type="button"
                data-testid="quick-visibility-more"
                onClick={() => {
                  setOpen(false);
                  onOpenAdvancedLayers();
                }}
                style={{
                  flex: 1,
                  minHeight: 36,
                  padding: '6px 10px',
                  borderRadius: 10,
                  fontSize: 11.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid var(--bp-glass-border)',
                  color: 'var(--bp-panel-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                <SlidersHorizontal size={13} />
                Mais camadas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
