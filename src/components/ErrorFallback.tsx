import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorFallbackProps {
  error?: Error | null;
  onRetry?: () => void;
  title?: string;
  message?: string;
  fullScreen?: boolean;
}

export default function ErrorFallback({
  error,
  onRetry,
  title = 'Erro ao carregar dados',
  message = 'Ocorreu um erro ao carregar os dados. Por favor, tente novamente.',
  fullScreen = false,
}: ErrorFallbackProps) {
  const containerClass = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-[#07111d]/80 backdrop-blur-xl z-50'
    : 'flex items-center justify-center p-8';

  return (
    <div className={containerClass}>
      <div className="max-w-[min(92vw,390px)] w-full glass-liquid-strong rounded-[24px] shadow-2xl p-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        
        <p className="text-white/65 mb-6">{message}</p>
        
        {error && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-white/75">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 p-4 bg-white/8 rounded text-xs text-red-600 overflow-auto">
              {error.message}
            </pre>
          </details>
        )}
        
        {onRetry && (
          <Button
            onClick={onRetry}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
        )}
      </div>
    </div>
  );
}
