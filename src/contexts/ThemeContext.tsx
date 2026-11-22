import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';

export type Theme = 'current' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'mapas-bp-theme';
const THEME_META_COLORS: Record<Theme, string> = {
  current: '#07111d',
  light: '#f5f8f4',
  dark: '#0b1020',
};

export const THEME_OPTIONS: Array<{ id: Theme; label: string; description: string }> = [
  { id: 'current', label: 'Atual', description: 'Glass verde original' },
  { id: 'light', label: 'Claro', description: 'Clareza premium para o dia' },
  { id: 'dark', label: 'Escuro', description: 'Contraste premium para a noite' },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  toggleTheme: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

function isTheme(value: string | null): value is Theme {
  return value === 'current' || value === 'light' || value === 'dark';
}

function readStoredTheme(defaultTheme: Theme): Theme {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.bpTheme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute('content', THEME_META_COLORS[theme]);
}

export function ThemeProvider({
  children,
  defaultTheme = 'current',
  switchable = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(defaultTheme));

  useLayoutEffect(() => {
    applyTheme(theme);
    if (switchable) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // O modo continua funcionando mesmo quando o armazenamento está bloqueado.
      }
    }
  }, [theme, switchable]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(isTheme(nextTheme) ? nextTheme : defaultTheme);
  };

  const cycleTheme = () => {
    setThemeState((previous) => {
      const currentIndex = THEME_OPTIONS.findIndex((option) => option.id === previous);
      return THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length].id;
    });
  };

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    setTheme,
    cycleTheme,
    // Mantido para compatibilidade com componentes antigos; agora percorre os três modos.
    toggleTheme: cycleTheme,
    switchable,
  }), [theme, switchable]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
