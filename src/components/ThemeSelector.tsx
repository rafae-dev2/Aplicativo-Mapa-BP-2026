import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { THEME_OPTIONS, useTheme, type Theme } from '@/contexts/ThemeContext';

const THEME_ICONS: Record<Theme, typeof Sun> = {
  current: Sparkles,
  light: Sun,
  dark: Moon,
};

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeOption = THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0];
  const ActiveIcon = THEME_ICONS[theme];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleThemeSelect = (nextTheme: Theme) => {
    setTheme(nextTheme);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="bp-theme-selector">
      <button
        type="button"
        className="bp-theme-trigger"
        aria-label={`Tema atual: ${activeOption.label}. Abrir seletor de tema`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={`Tema: ${activeOption.label}`}
      >
        <span className="bp-theme-trigger-icon" aria-hidden="true">
          <ActiveIcon size={16} strokeWidth={2.3} />
        </span>
        <span className="bp-theme-trigger-label">{activeOption.label}</span>
        <ChevronDown className="bp-theme-trigger-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open && (
        <div className="bp-theme-popover" role="menu" aria-label="Selecionar tema">
          <div className="bp-theme-popover-heading">
            <div className="bp-theme-popover-title">
              <Palette size={15} aria-hidden="true" />
              Aparência do aplicativo
            </div>
            <div className="bp-theme-popover-subtitle">Escolha o acabamento ideal para seu turno</div>
          </div>

          <div className="bp-theme-options">
            {THEME_OPTIONS.map((option) => {
              const Icon = THEME_ICONS[option.id];
              const isActive = option.id === theme;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`bp-theme-option${isActive ? ' is-active' : ''}`}
                  onClick={() => handleThemeSelect(option.id)}
                >
                  <span className={`bp-theme-option-icon bp-theme-option-icon-${option.id}`} aria-hidden="true">
                    <Icon size={17} strokeWidth={2.2} />
                  </span>
                  <span className="bp-theme-option-copy">
                    <span className="bp-theme-option-label">{option.label}</span>
                    <span className="bp-theme-option-description">{option.description}</span>
                  </span>
                  <span className="bp-theme-option-check" aria-hidden="true">
                    {isActive && <Check size={15} strokeWidth={2.8} />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bp-theme-popover-footnote">
            <span className="bp-theme-status-dot" aria-hidden="true" />
            Preferência salva neste aparelho
          </div>
        </div>
      )}
    </div>
  );
}
