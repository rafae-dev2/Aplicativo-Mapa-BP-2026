interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ 
  message = 'Carregando Mapas', 
  fullScreen = false 
}: LoadingSpinnerProps) {
  if (!fullScreen) {
    return (
      <div className="bp-loading-inline flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-gray-600 font-medium">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bp-loading-screen" role="status" aria-live="polite" data-testid="startup-splash">
        <div className="bp-loader-container">
          {/* Logo com anéis giratórios */}
          <div className="bp-logo-container">
            <div className="bp-glow-ring-outer"></div>
            <div className="bp-glow-ring-middle"></div>
            <div className="bp-glow-ring-inner"></div>
            <div className="bp-logo-image"></div>
            <div className="bp-spinner"></div>
          </div>

          {/* Texto com animação */}
          <div style={{ textAlign: 'center' }}>
            <div className="bp-loader-text">
              {message}
              <span className="bp-dots">
                <span className="bp-dot"></span>
                <span className="bp-dot"></span>
                <span className="bp-dot"></span>
              </span>
            </div>
            <div className="bp-loader-subtext">Preparando visualização de talhões...</div>
          </div>

          {/* Barra de progresso */}
          <div className="bp-progress-bar">
            <div className="bp-progress-fill"></div>
          </div>
        </div>
      </div>
    </>
  );
}
