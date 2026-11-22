import { useEffect, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface StartupOverlayProps { ready: boolean; failed: boolean; }

/** A tela original acompanha a preparação real; não há duração mínima artificial.
 * Em falha de dados/rede lenta ela libera a interface e seus botões de recuperação.
 */
export default function StartupOverlay({ ready, failed }: StartupOverlayProps) {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (ready || failed) setFinished(true);
  }, [ready, failed]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFinished(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (finished || ready || failed) return null;
  return <LoadingSpinner fullScreen message="Carregando Mapas" />;
}
