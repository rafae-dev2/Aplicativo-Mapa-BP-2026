import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface MapBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** O painel amplo fica reservado ao formulário operacional de transporte. */
  variant?: 'standard' | 'transport';
}

/**
 * Painel lateral de detalhes do mapa.
 * O nome do componente é mantido para não quebrar os pontos de montagem
 * existentes, mas o comportamento agora é lateral: entra da esquerda para a
 * direita e começa logo abaixo da barra de pesquisa.
 */
const PANEL_EXIT_DURATION_MS = 320;

export default function MapBottomSheet({ open, onOpenChange, title, children, variant = 'standard' }: MapBottomSheetProps) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    const timeout = window.setTimeout(() => setMounted(false), PANEL_EXIT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Fechar detalhes do mapa"
        className={`bp-map-side-panel-backdrop ${open ? 'is-open' : 'is-closing'}`}
        onClick={() => onOpenChange(false)}
        tabIndex={-1}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="map-side-panel"
        data-vaul-drawer-direction="left"
        data-panel-variant={variant}
        className={`bp-map-side-panel bp-map-side-panel-${variant} ${open ? 'is-open' : 'is-closing'}`}
      >
        <div className="bp-map-side-panel-toolbar">
          <div className="bp-map-side-panel-context">
            <span className="bp-map-side-panel-kicker">Detalhes do mapa</span>
            <span className="bp-map-side-panel-title" title={title}>{title}</span>
          </div>
          <button
            type="button"
            className="bp-map-side-panel-close"
            aria-label="Fechar detalhes do mapa"
            onClick={() => onOpenChange(false)}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div className="bp-map-side-panel-scroll">
          {children}
        </div>
      </aside>
    </>
  );
}
