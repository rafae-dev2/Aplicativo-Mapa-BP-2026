
import { Menu, Download, AlertCircle } from 'lucide-react';
import { useUpdateCheck } from '@/hooks/useUpdateCheck';
import ThemeSelector from './ThemeSelector';

interface HeaderProps {
  onMenuToggle?: (open: boolean) => void;
}

interface UpdateNotificationProps {
  isUpdateAvailable: boolean;
  newVersion?: string;
  currentVersion?: string;
  onUpdate: () => void;
  isChecking: boolean;
}

function UpdateNotification({
  isUpdateAvailable,
  newVersion,
  currentVersion,
  onUpdate,
  isChecking,
}: UpdateNotificationProps) {
  if (!isUpdateAvailable && !isChecking) return null;

  return (
    <div className="flex items-center gap-2">
      {isChecking && (
        <div className="bp-update-check flex items-center gap-2 px-3 py-1 rounded-lg" style={{
          background: 'rgba(59, 130, 246, 0.2)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}>
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          <span className="bp-update-check-label text-xs">Verificando...</span>
        </div>
      )}
      {isUpdateAvailable && (
        <button
          onClick={onUpdate}
          className="bp-update-available flex items-center gap-2 px-3 py-1 rounded-lg transition"
          style={{
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            color: 'rgb(134, 239, 172)',
          }}
          title={`Nova versão ${newVersion} disponível`}
        >
          <Download size={16} />
          <span className="text-xs font-semibold">Atualizar</span>
          <AlertCircle size={14} className="animate-pulse" />
        </button>
      )}
    </div>
  );
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { isUpdateAvailable, newVersion, currentVersion, isChecking, applyUpdate } =
    useUpdateCheck();

  return (
    <header 
      className="bp-header-shell fixed top-0 left-0 right-0 h-20 z-50 flex items-center justify-between px-3 sm:px-4"
      style={{
        background: 'linear-gradient(135deg, rgba(26,35,51,0.7), rgba(42,51,67,0.5))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(173,255,47,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      {/* Logo Container */}
      <div className="bp-header-brand flex items-center gap-3 sm:gap-4">
        {/* Logo Image com animação */}
        <div className="bp-header-logo-orbit" aria-hidden="true">
          <img
            src="/brand-startup.webp"
            alt=""
            className="bp-header-brand-logo"
          />
        </div>

        {/* Título e Subtítulo */}
        <div className="bp-header-brand-copy flex flex-col justify-center">
          {/* Título com gradiente e brilho */}
          <h1
            className="bp-header-title shimmer-text font-black text-xl sm:text-2xl tracking-wider"
            aria-label="Mapas Branco Peres"
          >
            <span className="bp-title-primary">Mapas</span>
            <span className="bp-title-secondary">Branco Peres</span>
          </h1>
          {/* Subtítulo */}
          <p 
            className="bp-header-subtitle text-sm sm:text-base mt-[-4px]"
            style={{
              color: 'rgba(255,255,255,0.7)',
              textShadow: '0 0 10px rgba(173,255,47,0.15)',
            }}
          >
            Sistema Agrícola Avançado
          </p>
        </div>
      </div>

      {/* Update Notification */}
      <div className="bp-header-update">
      <UpdateNotification
        isUpdateAvailable={isUpdateAvailable}
        newVersion={newVersion}
        currentVersion={currentVersion}
        onUpdate={applyUpdate}
        isChecking={isChecking}
      />
      </div>

      {/* Ações globais: tema e menu */}
      <div className="bp-header-actions">
        <ThemeSelector />
        <button
          type="button"
          onClick={() => onMenuToggle?.(true)}
          className="bp-header-menu-button"
          aria-label="Abrir menu principal"
          title="Abrir menu principal"
        >
          <Menu size={25} strokeWidth={2.25} />
        </button>
      </div>
    </header>
  );
}
