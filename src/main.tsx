import { createRoot } from 'react-dom/client';
import { Component, lazy, Suspense, type ReactNode } from 'react';
import './index.css';
import { runPwaMaintenance, registerMapTilesServiceWorker } from './lib/pwaMaintenance';
import { warmStrategicPoiIconsCache } from './lib/poiIconCache';
import { warmConfigMetadataCache } from './lib/configMetadataCache';
import LoadingSpinner from './components/LoadingSpinner';

const App = lazy(() => import('./App'));

class BootBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#07111d', color: '#fff', fontFamily: 'system-ui', padding: 24 }}>
      <div><h1>Não foi possível iniciar o aplicativo</h1><p>Não foi possível carregar os arquivos ou iniciar a interface. Tente novamente; se estiver sem conexão, conecte-se à internet. Seus dados locais continuam preservados.</p>
        <button onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    </div>;
  }
}

function BootScreen() {
  return <LoadingSpinner fullScreen message="Carregando Mapas" />;
}

createRoot(document.getElementById('root')!).render(
  <BootBoundary><Suspense fallback={<BootScreen />}><App /></Suspense></BootBoundary>
);

// O shell aparece antes de qualquer manutenção. Também funciona se load já ocorreu.
const scheduleOfflineSw = () => {
  window.setTimeout(() => {
    if (import.meta.env.PROD) {
      void runPwaMaintenance('189');
    } else {
      void registerMapTilesServiceWorker();
    }
    void warmStrategicPoiIconsCache();
    void warmConfigMetadataCache();
  }, 1500);
};
if (document.readyState === 'complete') scheduleOfflineSw();
else window.addEventListener('load', scheduleOfflineSw, { once: true });
