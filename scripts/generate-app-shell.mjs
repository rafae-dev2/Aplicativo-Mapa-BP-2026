import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assetsDir = resolve(root, 'dist/assets');
if (!existsSync(assetsDir)) throw new Error('Compile com vite build antes de gerar o manifesto.');
const assets = readdirSync(assetsDir).filter(name => /\.(js|css)$/.test(name)).sort().map(name => `/assets/${name}`);
assets.push('/runtime-config.js?v=189', '/notification-config.js?v=2', '/icon-logo-192.png', '/brand-startup.webp', '/header-startup.webp', '/startup.css?v=187');
const manifest = {
  version: '189',
  assets,
  dataAssets: ['/branco-peres.mapdata?v=186', '/branco-peres-labels.json?v=186'],
};
writeFileSync(resolve(root, 'dist/app-shell-assets.json'), JSON.stringify(manifest));
console.log(`[offline] Manifesto gerado com ${assets.length} arquivos de interface e ${manifest.dataAssets.length} dados essenciais.`);
