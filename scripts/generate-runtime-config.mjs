import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, process.argv[2] || 'dist/runtime-config.js');

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function parsePublicRuntimeConfig(path) {
  if (!existsSync(path)) return {};
  const source = readFileSync(path, 'utf8');
  const values = {};
  for (const name of ['supabaseUrl', 'supabaseAnonKey']) {
    const match = source.match(new RegExp(`${name}\\s*:\\s*([\"'])(.*?)\\1`, 's'));
    if (match) values[name] = match[2];
  }
  return values;
}

const fileValues = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
].reduce((acc, filename) => ({ ...acc, ...parseEnvFile(resolve(projectRoot, filename)) }), {});

// No deploy manual, o Netlify pode não fornecer variáveis de build. Preserve
// a configuração runtime pública existente em vez de gerar valores vazios.
const publicRuntimeValues = parsePublicRuntimeConfig(resolve(projectRoot, 'public/runtime-config.js'));
// Variáveis fornecidas pelo provedor de build sempre têm prioridade sobre os arquivos locais.
const env = { ...fileValues, ...process.env };
const supabaseUrl = String(env.VITE_SUPABASE_URL || publicRuntimeValues.supabaseUrl || '').trim();
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || publicRuntimeValues.supabaseAnonKey || '').trim();
const validUrl = /^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(supabaseUrl);
const validKey = supabaseAnonKey.length >= 100 && supabaseAnonKey.split('.').length === 3;

const config = validUrl && validKey
  ? { supabaseUrl, supabaseAnonKey }
  : { supabaseUrl: '', supabaseAnonKey: '' };

const output = `/* Gerado automaticamente durante o build. Não edite manualmente. */\nwindow.__BP_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n`;
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output, 'utf8');

const isProductionBuild = process.env.NODE_ENV === 'production'
  || process.env.CONTEXT === 'production'
  || process.env.NETLIFY === 'true';

if (!validUrl || !validKey) {
  const message = 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias para um build de produção.';
  if (isProductionBuild) {
    console.error(`[runtime-config] ERRO: ${message}`);
    process.exitCode = 1;
  } else {
    console.warn(`[runtime-config] AVISO: ${message} O app ficará offline por segurança.`);
  }
} else {
  console.log('[runtime-config] Supabase configurado');
}
console.log(`[runtime-config] arquivo: ${outputPath}`);
