#!/usr/bin/env node
/**
 * Script utilitário de simulação — Leitura forçada de 100+ talhões complexos
 * a partir do IndexedDB sob rede throttled (Slow 3G / Rural 3G / Edge 2G),
 * validando tempo de renderização no Mapbox WebGL e responsividade da UI.
 *
 * Uso:
 *   npm run sim:talhoes-throttled
 *   node scripts/simulate-throttled-talhoes.mjs --count=140 --vertices=84 --profile=rural-3g
 */

import { execFileSync } from 'node:child_process';

const NETWORK_PROFILES = {
  'rural-3g': {
    label: 'Rural 3G (50 KB/s ↓ · 25 KB/s ↑ · 600ms RTT)',
    downloadThroughput: 50 * 1024,
    uploadThroughput: 25 * 1024,
    latency: 600,
  },
  'slow-3g': {
    label: 'Slow 3G (40 KB/s ↓ · 20 KB/s ↑ · 800ms RTT)',
    downloadThroughput: 40 * 1024,
    uploadThroughput: 20 * 1024,
    latency: 800,
  },
  'edge-2g': {
    label: 'Edge 2G (20 KB/s ↓ · 10 KB/s ↑ · 1400ms RTT)',
    downloadThroughput: 20 * 1024,
    uploadThroughput: 10 * 1024,
    latency: 1400,
  },
};

function parseArgs(argv) {
  const parsed = {
    url: 'http://localhost:3000',
    count: 120,
    vertices: 72,
    profile: 'rural-3g',
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) parsed.url = arg.slice(6);
    else if (arg.startsWith('--count=')) parsed.count = Math.max(100, Number(arg.slice(8)) || 120);
    else if (arg.startsWith('--vertices=')) parsed.vertices = Math.max(24, Number(arg.slice(11)) || 72);
    else if (arg.startsWith('--profile=')) {
      const key = arg.slice(10);
      if (NETWORK_PROFILES[key]) parsed.profile = key;
    }
  }
  return parsed;
}

function runCli(args) {
  return execFileSync('playwright-cli', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
}

function extractResultJson(rawOutput) {
  const marker = '### Result';
  const idx = rawOutput.indexOf(marker);
  if (idx === -1) return null;
  const after = rawOutput.slice(idx + marker.length).trim();
  const endIdx = after.indexOf('\n### ');
  const block = (endIdx === -1 ? after : after.slice(0, endIdx)).trim();
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const netProfile = NETWORK_PROFILES[opts.profile];

  console.log('\n======================================================================');
  console.log(' Simulação IndexedDB (100+ talhões complexos) + Rede Throttled');
  console.log('======================================================================');
  console.log(` URL:       ${opts.url}`);
  console.log(` Perfil:    ${netProfile.label}`);
  console.log(` Carga:     ${opts.count} talhões × ${opts.vertices} vértices + recorte interno`);
  console.log('----------------------------------------------------------------------\n');

  try {
    runCli(['open', opts.url]);
    runCli(['resize', '1440', '900']);

    const runnerCode = `async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));

      // Aguarda inicialização do mapa e exposição do utilitário de benchmark
      await page.waitForFunction(
        () => Boolean(window.__BP_TALHOES_BENCH__ && document.querySelector('canvas.mapboxgl-canvas')),
        { timeout: 25000 }
      );
      await page.waitForTimeout(2500);

      // Aplica throttling real de rede via Chrome DevTools Protocol (CDP)
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: ${netProfile.downloadThroughput},
        uploadThroughput: ${netProfile.uploadThroughput},
        latency: ${netProfile.latency},
      });

      // Dispara requisição concorrente sob rede lenta para validar que a UI
      // e a leitura do IndexedDB não ficam presas à rede throttled
      const bgFetchPromise = page.evaluate(() => {
        return fetch('/version.json?stress=' + Date.now(), { cache: 'no-store' })
          .then((r) => r.status)
          .catch(() => 0);
      });

      // Executa leitura forçada de ${opts.count} talhões complexos do IndexedDB + render Mapbox
      const report = await page.evaluate(async ({ count, verticesPerRing }) => {
        return await window.__BP_TALHOES_BENCH__.run({
          count,
          verticesPerRing,
          includeInteriorHole: true,
          logReport: true,
        });
      }, { count: ${opts.count}, verticesPerRing: ${opts.vertices} });

      // Valida interatividade real da UI logo após a carga pesada (abrir/fechar painel lateral de marcações)
      const toggleBtn = page.locator('[data-testid="poi-panel-edge-toggle"]');
      let uiClickLatencyMs = null;
      if (await toggleBtn.isVisible().catch(() => false)) {
        const clickStart = Date.now();
        await toggleBtn.click();
        await page.waitForFunction(
          () => document.querySelector('[data-testid="poi-panel-edge-toggle"]')?.getAttribute('aria-expanded') === 'true',
          { timeout: 3000 }
        );
        uiClickLatencyMs = Date.now() - clickStart;
        await toggleBtn.click();
      }

      const bgStatus = await bgFetchPromise;

      // Restaura condições normais de rede
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });

      return {
        report,
        uiClickLatencyMs,
        bgThrottledFetchStatus: bgStatus,
        pageErrors,
      };
    }`;

    const raw = runCli(['run-code', runnerCode]);
    const parsed = extractResultJson(raw);

    if (!parsed || !parsed.report) {
      console.error('Falha ao extrair resultado estruturado da simulação.');
      console.error(raw);
      process.exitCode = 1;
      return;
    }

    const { report, uiClickLatencyMs, bgThrottledFetchStatus, pageErrors } = parsed;
    const r = report.responsiveness;

    console.log(' Resultados da Simulação:');
    console.log(`  • Talhões lidos do IndexedDB:   ${report.talhaoCount} polígonos (${report.totalRings} anéis)`);
    console.log(`  • Total de vértices complexos:  ${report.totalVertices.toLocaleString('pt-BR')} vértices (${(report.payloadBytes / 1024).toFixed(1)} KB GeoJSON)`);
    console.log(`  • Gravação no IndexedDB:        ${report.idbSeedMs} ms`);
    console.log(`  • Leitura do IndexedDB:         ${report.idbReadMs} ms (limite ${report.thresholds.maxIdbReadMs} ms)`);
    console.log(`  • Montagem FeatureCollection:   ${report.geoJsonBuildMs} ms`);
    console.log(`  • Renderização Mapbox WebGL:    ${report.mapRenderMs} ms (limite ${report.thresholds.maxMapRenderMs} ms · fonte atualizada: ${report.mapSourceUpdated ? 'sim' : 'não'})`);
    console.log(`  • Pipeline total (IDB → tela):  ${report.totalPipelineMs} ms`);
    console.log(`  • FPS médio / Frame médio:      ${r.avgFps} FPS (${r.avgFrameMs} ms)`);
    console.log(`  • P95 / Frame máximo:           ${r.p95FrameMs} ms / ${r.maxFrameMs} ms (limite ${report.thresholds.maxSingleFrameMs} ms)`);
    console.log(`  • Long Tasks / TBT:             ${r.longTaskCount} tasks · TBT ${r.totalBlockingTimeMs} ms (limite ${report.thresholds.maxTotalBlockingTimeMs} ms)`);
    console.log(`  • Latência de clique na UI:     ${uiClickLatencyMs !== null ? `${uiClickLatencyMs} ms` : 'n/d'}`);
    console.log(`  • Fetch concorrente throttled:  HTTP ${bgThrottledFetchStatus}`);
    console.log(`  • Erros JS na página:           ${pageErrors.length}`);
    console.log('----------------------------------------------------------------------');

    const ok = report.passed && pageErrors.length === 0 && (uiClickLatencyMs === null || uiClickLatencyMs < 1000);
    if (ok) {
      console.log(' VEREDITO: APROVADO — Mapa renderizou 100+ talhões complexos sem travar a interface.\n');
    } else {
      console.error(' VEREDITO: REPROVADO');
      for (const reason of report.failureReasons) {
        console.error(`  - ${reason}`);
      }
      if (pageErrors.length > 0) {
        console.error(`  - Erros de página: ${pageErrors.join(' | ')}`);
      }
      process.exitCode = 1;
    }
  } finally {
    try {
      runCli(['close']);
    } catch {
      /* noop */
    }
  }
}

main().catch((err) => {
  console.error('[simulate-throttled-talhoes] Erro fatal:', err?.message || err);
  process.exitCode = 1;
});
