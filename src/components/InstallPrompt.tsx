import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
  onInstallPromptEvent?: (event: BeforeInstallPromptEvent | null) => void;
}

export default function InstallPrompt({ onInstallPromptEvent }: InstallPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Verificar se o app já está instalado
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('InstallPrompt: Evento beforeinstallprompt disparado');
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      setDeferredPrompt(event);
      
      const params = new URLSearchParams(window.location.search);
      const hasPOIParams = params.has('fundo') || params.has('talhao') || params.has('pois');
      const delayTime = hasPOIParams ? 4000 : 2000;
      
      const timer = setTimeout(() => {
        setShowPrompt(true);
        setIsAnimating(true);
      }, delayTime);
      
      if (onInstallPromptEvent) {
        onInstallPromptEvent(event);
      }
      
      return () => clearTimeout(timer);
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    console.log('InstallPrompt: Adicionando listeners para beforeinstallprompt e appinstalled');
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [onInstallPromptEvent]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setShowPrompt(false);
        setDeferredPrompt(null);
      }
    } catch (error) {
      console.error('Erro ao instalar PWA:', error);
    }
  };

  const handleDismiss = () => {
    setIsAnimating(false);
    setTimeout(() => setShowPrompt(false), 300);
    // Não limpar deferredPrompt para permitir que o usuário instale depois
  };

  if (!showPrompt || isInstalled) {
    return null;
  }

  return (
    <div className={`bp-install-overlay fixed inset-0 transition-opacity duration-300 z-40 flex items-center justify-center p-3 sm:p-4 ${isAnimating ? '' : 'pointer-events-none'}`} style={{ background: isAnimating ? 'radial-gradient(circle at 50% 18%, rgba(173,255,47,0.12), transparent 34%), rgba(0,0,0,0.62)' : 'rgba(0,0,0,0)', backdropFilter: isAnimating ? 'blur(10px)' : 'blur(0px)', WebkitBackdropFilter: isAnimating ? 'blur(10px)' : 'blur(0px)' }}>
      <div className={`bp-install-card glass-liquid-strong rounded-[24px] max-w-[min(92vw,390px)] w-full overflow-hidden transition-all duration-500 transform ${
        isAnimating 
          ? 'opacity-100 scale-100 translate-y-0' 
          : 'opacity-0 scale-95 translate-y-8'
      }`}>
        {/* Header com Logo */}
        <div className="p-6 text-center relative border-b border-lime-300/15">
          <div className="flex justify-center mb-4">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <img 
                src="/pwa-icon-192.png" 
                alt="Logo Branco Peres" 
                className="w-20 h-20 object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
              />
            </div>
          </div>
          <h2 className="text-2xl font-black text-white drop-shadow">Mapas Branco Peres</h2>
          <p className="text-sm text-white/70 mt-1 font-semibold">Sistema Agrícola Avançado</p>
        </div>

        {/* Conteúdo */}
        <div className="p-5">
          <p className="text-white/90 text-center mb-2">
            <strong>Instale nosso aplicativo na sua área de trabalho!</strong>
          </p>
          <p className="text-white/65 text-sm text-center mb-5">
            Acesse o mapa de fazendas de forma rápida e fácil, mesmo sem conexão com a internet.
          </p>

          {/* Benefícios */}
          <div className="space-y-3 mb-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm text-white/75">Acesso rápido desde a área de trabalho</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm text-white/75">Funciona offline (com dados em cache)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm text-white/75">Sem anúncios ou distrações</span>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            <button
              onClick={handleInstall}
              className="flex-1 glass-liquid-button text-white font-bold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 transform hover:scale-[1.02] active:scale-95"
            >
              <Download className="w-5 h-5" />
              Instalar Agora
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 bg-white/8 hover:bg-white/14 text-white/80 border border-white/12 font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 transform hover:scale-[1.02] active:scale-95"
            >
              <X className="w-5 h-5" />
              Depois
            </button>
          </div>

          <p className="text-xs text-white/45 text-center mt-4">
            Você pode instalar o aplicativo a qualquer momento pelo menu do navegador.
          </p>
        </div>
      </div>
    </div>
  );
}
