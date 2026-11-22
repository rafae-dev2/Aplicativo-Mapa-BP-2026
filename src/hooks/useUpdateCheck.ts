import { useEffect, useState, useCallback } from 'react';
import { prepareForAppReload } from '@/lib/pwaMaintenance';

export interface UpdateStatus {
  isUpdateAvailable: boolean;
  newVersion?: string;
  currentVersion?: string;
  isChecking: boolean;
  error?: string;
}

// UpdateBanner é responsável pela consulta periódica de versões. O cabeçalho
// apenas acompanha as mensagens: não repete downloads na inicialização.
export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>({ isUpdateAvailable: false, isChecking: false });
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const { type, version, currentVersion, error, geojsonResult } = event.data || {};
      if (type === 'UPDATE_AVAILABLE') setStatus({ isUpdateAvailable: true, newVersion: version, currentVersion, isChecking: false });
      if (type === 'NO_UPDATE' || type === 'VERSION_RESPONSE' || type === 'CHECK_UPDATE_RESULT') {
        setStatus(previous => ({ ...previous, isChecking: false, currentVersion: version || previous.currentVersion,
          ...(geojsonResult?.updated ? { isUpdateAvailable: true, newVersion: geojsonResult.version } : {}) }));
      }
      if (type === 'UPDATE_CHECK_FAILED') setStatus(previous => ({ ...previous, isChecking: false, error }));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
  const checkForUpdate = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'GET_VERSION' });
  }, []);
  const applyUpdate = useCallback(async () => {
    await prepareForAppReload();
    window.location.reload();
  }, []);
  return { ...status, checkForUpdate, applyUpdate };
}
