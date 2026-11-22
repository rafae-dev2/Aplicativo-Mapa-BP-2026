import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileImage, Loader2 } from 'lucide-react';
import type { POI, TransportTrip, TransportUnit } from './POIManager';
import { getTransportMaterial } from './POIManager';

interface TransportTripsReportProps {
  poi: POI;
  trips: TransportTrip[];
  targetQuantity: number;
  targetUnit: TransportUnit;
  delivered: number;
  remaining: number;
  overage: number;
}

interface ReportFleetGroup {
  fleet: string;
  trips: TransportTrip[];
  totals: Partial<Record<TransportUnit, number>>;
}

const REPORT = {
  ink: '#12314b',
  inkStrong: '#0b2740',
  slate: '#52677b',
  muted: '#75879a',
  border: '#d6e0e9',
  borderStrong: '#bdcad7',
  page: '#eef2f6',
  white: '#ffffff',
  blue: '#1d6fd1',
  blueSoft: '#eaf3fc',
  orange: '#cc6428',
  orangeSoft: '#fff1e8',
  green: '#137a56',
  greenSoft: '#eaf7f1',
  red: '#ad3e50',
  redSoft: '#fff0f2',
  amber: '#9b6505',
  amberSoft: '#fff8e5',
};

function formatQuantity(value: number, unit: TransportUnit): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit === 'bigbags' ? 0 : 2,
  });
}

function formatPercent(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function unitLabel(unit: TransportUnit): string {
  return unit === 'bigbags' ? 'BigBags' : 't';
}

function dateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

function compactDateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

function sanitizeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 42) || 'transporte';
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke?: string): void {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawEllipsisText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) shortened = shortened.slice(0, -1);
  ctx.fillText(`${shortened}…`, x, y);
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number): void {
  if (logo && logo.naturalWidth > 0) {
    ctx.drawImage(logo, x, y, size, size);
    return;
  }
  fillRoundedRect(ctx, x, y, size, size, 18, REPORT.orange, REPORT.orange);
  ctx.fillStyle = REPORT.white;
  ctx.font = '900 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BP', x + size / 2, y + size / 2 + 10);
  ctx.textAlign = 'left';
}

function drawMetricCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string, value: string, detail: string, accent: string, fill: string): void {
  fillRoundedRect(ctx, x, y, width, height, 14, REPORT.white, REPORT.border);
  ctx.fillStyle = fill;
  roundedRect(ctx, x + 2, y + 2, width - 4, height - 4, 12);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 6, height);
  ctx.fillStyle = REPORT.slate;
  ctx.font = '850 14px system-ui, sans-serif';
  ctx.fillText(label, x + 24, y + 30);
  ctx.fillStyle = accent;
  ctx.font = '950 27px system-ui, sans-serif';
  drawEllipsisText(ctx, value, x + 24, y + 72, width - 48);
  ctx.fillStyle = REPORT.muted;
  ctx.font = '650 14px system-ui, sans-serif';
  drawEllipsisText(ctx, detail, x + 24, y + 101, width - 48);
}

function drawSectionLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = REPORT.orange;
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.fillText(text, x, y);
}

async function loadReportLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const logo = new Image();
    logo.onload = () => resolve(logo);
    logo.onerror = () => resolve(null);
    logo.src = `${window.location.origin}/icon-logo.png`;
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function formatFleetTotal(group: ReportFleetGroup): string {
  return (['toneladas', 'bigbags'] as TransportUnit[])
    .filter((unit) => Number(group.totals[unit] || 0) > 0)
    .map((unit) => `${formatQuantity(Number(group.totals[unit]), unit)} ${unitLabel(unit)}`)
    .join(' + ');
}

export default function TransportTripsReport({
  poi,
  trips,
  targetQuantity,
  targetUnit,
  delivered,
  remaining,
  overage,
}: TransportTripsReportProps) {
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const material = getTransportMaterial(poi.transportMaterial);
  const materialLabel = material?.label || poi.transportMaterial || 'Insumo';
  const formula = poi.transportMaterial === 'adubo' ? poi.transportFormula?.trim() : '';
  const groups = useMemo<ReportFleetGroup[]>(() => {
    const byFleet = new Map<string, ReportFleetGroup>();
    trips
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((trip) => {
        const fleet = trip.fleet?.trim() || 'Não informada';
        const group = byFleet.get(fleet) || { fleet, trips: [], totals: {} };
        group.trips.push(trip);
        group.totals[trip.unit] = Number(group.totals[trip.unit] || 0) + (Number(trip.weight) || 0);
        byFleet.set(fleet, group);
      });
    return Array.from(byFleet.values()).sort((a, b) => a.fleet.localeCompare(b.fleet, 'pt-BR', { numeric: true }));
  }, [trips]);

  const exportReport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMessage('');
    try {
      const width = 1600;
      const margin = 86;
      const contentWidth = width - margin * 2;
      const gap = 18;
      const metricWidth = (contentWidth - gap * 3) / 4;
      const headerHeight = formula ? 220 : 196;
      const metricsHeight = 132;
      const progressHeight = 132;
      const indicatorsHeight = 126;
      const tableHeaderHeight = 62;
      const groupHeight = 64;
      const tripRowHeight = 62;
      const groupContentHeight = groups.reduce((sum, group) => sum + groupHeight + group.trips.length * tripRowHeight + 18, 0);
      const emptyHeight = groups.length === 0 ? 116 : 0;
      const footerHeight = 180;
      const height = margin + headerHeight + 26 + metricsHeight + 24 + progressHeight + 24 + indicatorsHeight + 24 + tableHeaderHeight + groupContentHeight + emptyHeight + footerHeight + margin;
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');
      ctx.scale(scale, scale);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      ctx.fillStyle = REPORT.page;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = REPORT.white;
      ctx.fillRect(32, 32, width - 64, height - 64);
      ctx.strokeStyle = REPORT.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(32, 32, width - 64, height - 64);
      ctx.fillStyle = REPORT.orange;
      ctx.fillRect(32, 32, width - 64, 8);

      const generatedAt = Date.now();
      const logo = await loadReportLogo();
      drawLogo(ctx, logo, margin, margin + 22, 86);
      ctx.fillStyle = REPORT.orange;
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.fillText('BRANCO PERES  /  OPERAÇÕES AGRÍCOLAS', margin + 114, margin + 39);
      ctx.fillStyle = REPORT.inkStrong;
      ctx.font = '950 36px system-ui, sans-serif';
      ctx.fillText('CONTROLE DE TRANSPORTE', margin + 114, margin + 84);
      ctx.fillStyle = REPORT.orange;
      ctx.font = '950 27px system-ui, sans-serif';
      drawEllipsisText(ctx, materialLabel.toUpperCase(), margin + 114, margin + 126, contentWidth - 420);
      if (formula) {
        ctx.fillStyle = REPORT.slate;
        ctx.font = '750 18px system-ui, sans-serif';
        ctx.fillText(`Fórmula do Adubo: ${formula}`, margin + 114, margin + 159);
      }
      ctx.fillStyle = REPORT.muted;
      ctx.font = '650 16px system-ui, sans-serif';
      const pointLabel = poi.title || 'Ponto de transporte';
      drawEllipsisText(ctx, `${pointLabel}  •  Gerado em ${dateLabel(generatedAt)}`, margin + 114, margin + (formula ? 194 : 164), contentWidth - 420);

      const metaX = width - margin - 310;
      const metaY = margin + 24;
      fillRoundedRect(ctx, metaX, metaY, 310, 122, 12, '#f4f7fa', REPORT.border);
      drawSectionLabel(ctx, 'REGISTRO OPERACIONAL', metaX + 20, metaY + 28);
      ctx.fillStyle = REPORT.ink;
      ctx.font = '850 18px system-ui, sans-serif';
      ctx.fillText(`${poi.fundo ? `F${poi.fundo}` : 'Fundo não informado'}${poi.talhao ? `  •  T${poi.talhao}` : ''}`, metaX + 20, metaY + 61);
      ctx.fillStyle = REPORT.muted;
      ctx.font = '650 15px system-ui, sans-serif';
      ctx.fillText(`Unidade: ${unitLabel(targetUnit)}`, metaX + 20, metaY + 91);
      ctx.textAlign = 'right';
      ctx.fillText(`${trips.length} viagem(ns)`, metaX + 290, metaY + 91);
      ctx.textAlign = 'left';

      let y = margin + headerHeight;
      const progressPercent = targetQuantity > 0 ? (delivered / targetQuantity) * 100 : 0;
      const statusText = overage > 0 ? 'ULTRAPASSADO' : delivered >= targetQuantity && targetQuantity > 0 ? 'CONCLUÍDO' : 'EM ABERTO';
      const statusColor = overage > 0 ? REPORT.red : delivered >= targetQuantity && targetQuantity > 0 ? REPORT.green : REPORT.amber;
      const statusFill = overage > 0 ? REPORT.redSoft : delivered >= targetQuantity && targetQuantity > 0 ? REPORT.greenSoft : REPORT.amberSoft;
      drawMetricCard(ctx, margin, y, metricWidth, metricsHeight, 'PEDIDO PLANEJADO', `${formatQuantity(targetQuantity, targetUnit)} ${unitLabel(targetUnit)}`, 'Quantidade definida para o ponto', REPORT.amber, REPORT.amberSoft);
      drawMetricCard(ctx, margin + metricWidth + gap, y, metricWidth, metricsHeight, 'TOTAL ENTREGUE', `${formatQuantity(delivered, targetUnit)} ${unitLabel(targetUnit)}`, `${trips.length} movimentação(ões)`, REPORT.green, REPORT.greenSoft);
      drawMetricCard(ctx, margin + (metricWidth + gap) * 2, y, metricWidth, metricsHeight, 'VIAGENS REGISTRADAS', `${trips.length}`, `${groups.length} frota(s) identificada(s)`, REPORT.blue, REPORT.blueSoft);
      drawMetricCard(ctx, margin + (metricWidth + gap) * 3, y, metricWidth, metricsHeight, 'SITUAÇÃO DO PEDIDO', statusText, overage > 0 ? `Passou ${formatQuantity(overage, targetUnit)} ${unitLabel(targetUnit)}` : remaining > 0 ? `Falta ${formatQuantity(remaining, targetUnit)} ${unitLabel(targetUnit)}` : 'Carga dentro do pedido', statusColor, statusFill);
      y += metricsHeight + 24;

      fillRoundedRect(ctx, margin, y, contentWidth, progressHeight, 14, REPORT.white, REPORT.border);
      drawSectionLabel(ctx, 'ATENDIMENTO DO PEDIDO', margin + 24, y + 29);
      ctx.fillStyle = REPORT.inkStrong;
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.fillText(`${formatPercent(progressPercent)}% atendido`, margin + 24, y + 60);
      ctx.fillStyle = REPORT.muted;
      ctx.font = '650 15px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${formatQuantity(delivered, targetUnit)} de ${formatQuantity(targetQuantity, targetUnit)} ${unitLabel(targetUnit)}`, width - margin - 24, y + 29);
      ctx.textAlign = 'left';
      const barX = margin + 24;
      const barY = y + 80;
      const barWidth = contentWidth - 48;
      const barHeight = 14;
      fillRoundedRect(ctx, barX, barY, barWidth, barHeight, 7, '#e9eef3');
      const visibleProgress = Math.min(Math.max(progressPercent / 100, 0), 1);
      if (visibleProgress > 0) fillRoundedRect(ctx, barX, barY, Math.max(16, barWidth * visibleProgress), barHeight, 7, statusColor);
      if (overage > 0) {
        ctx.fillStyle = REPORT.red;
        ctx.font = '850 14px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`+${formatQuantity(overage, targetUnit)} ${unitLabel(targetUnit)} além do plano`, width - margin - 24, y + 116);
        ctx.textAlign = 'left';
      } else if (remaining > 0) {
        ctx.fillStyle = REPORT.amber;
        ctx.font = '750 14px system-ui, sans-serif';
        ctx.fillText(`Saldo pendente: ${formatQuantity(remaining, targetUnit)} ${unitLabel(targetUnit)}`, margin + 24, y + 116);
      } else {
        ctx.fillStyle = REPORT.green;
        ctx.font = '750 14px system-ui, sans-serif';
        ctx.fillText('Pedido atendido integralmente', margin + 24, y + 116);
      }
      y += progressHeight + 24;

      const maxTrip = trips.reduce<TransportTrip | null>((largest, trip) => (!largest || Number(trip.weight) > Number(largest.weight) ? trip : largest), null);
      const latestTrip = trips.reduce<TransportTrip | null>((latest, trip) => (!latest || trip.createdAt > latest.createdAt ? trip : latest), null);
      const averageTrip = trips.length ? delivered / trips.length : 0;
      fillRoundedRect(ctx, margin, y, contentWidth, indicatorsHeight, 14, '#f8fafc', REPORT.border);
      drawSectionLabel(ctx, 'INDICADORES DE EXECUÇÃO', margin + 24, y + 28);
      const indicatorX = [margin + 24, margin + 340, margin + 656, margin + 972];
      const indicatorLabels = ['MÉDIA POR VIAGEM', 'MAIOR CARGA', 'ÚLTIMA MOVIMENTAÇÃO', 'PONTO DE CONTROLE'];
      const indicatorValues = [
        trips.length ? `${formatQuantity(averageTrip, targetUnit)} ${unitLabel(targetUnit)}` : '—',
        maxTrip ? `${formatQuantity(Number(maxTrip.weight), maxTrip.unit)} ${unitLabel(maxTrip.unit)}` : '—',
        latestTrip ? compactDateLabel(latestTrip.createdAt) : '—',
        `${poi.fundo ? `F${poi.fundo}` : '—'}${poi.talhao ? ` / T${poi.talhao}` : ''}`,
      ];
      indicatorLabels.forEach((label, index) => {
        ctx.fillStyle = REPORT.muted;
        ctx.font = '800 12px system-ui, sans-serif';
        ctx.fillText(label, indicatorX[index], y + 55);
        ctx.fillStyle = REPORT.ink;
        ctx.font = '850 18px system-ui, sans-serif';
        drawEllipsisText(ctx, indicatorValues[index], indicatorX[index], y + 86, index === 2 ? 230 : 250);
        if (index < indicatorLabels.length - 1) {
          ctx.fillStyle = REPORT.border;
          ctx.fillRect(indicatorX[index] + 274, y + 43, 1, 52);
        }
      });
      y += indicatorsHeight + 24;

      fillRoundedRect(ctx, margin, y, contentWidth, tableHeaderHeight, 12, REPORT.ink, REPORT.ink);
      ctx.fillStyle = REPORT.white;
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.fillText('MOVIMENTAÇÃO POR FROTA', margin + 24, y + 38);
      ctx.fillStyle = '#b9cad9';
      ctx.font = '750 13px system-ui, sans-serif';
      ctx.fillText('ORDEM', margin + 24, y + 54);
      ctx.fillText('FROTA DO CAMINHÃO', margin + 245, y + 54);
      ctx.textAlign = 'right';
      ctx.fillText('PESO REGISTRADO', width - 420, y + 54);
      ctx.textAlign = 'left';
      ctx.fillText('DATA E HORA', width - 360, y + 54);
      y += tableHeaderHeight + 8;

      let tripNumber = 0;
      groups.forEach((group) => {
        fillRoundedRect(ctx, margin, y, contentWidth, groupHeight, 11, '#eaf2fa', REPORT.borderStrong);
        ctx.fillStyle = REPORT.blue;
        ctx.fillRect(margin, y, 7, groupHeight);
        ctx.fillStyle = REPORT.inkStrong;
        ctx.font = '900 20px system-ui, sans-serif';
        drawEllipsisText(ctx, `Frota ${group.fleet}`, margin + 25, y + 39, 320);
        ctx.fillStyle = REPORT.slate;
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.fillText(`${group.trips.length} viagem(ns)`, margin + 375, y + 39);
        ctx.textAlign = 'right';
        ctx.fillStyle = REPORT.blue;
        ctx.font = '900 20px system-ui, sans-serif';
        ctx.fillText(formatFleetTotal(group), width - margin - 25, y + 39);
        ctx.textAlign = 'left';
        y += groupHeight + 3;

        group.trips.forEach((trip) => {
          tripNumber += 1;
          ctx.fillStyle = tripNumber % 2 === 1 ? REPORT.white : '#f8fafc';
          ctx.fillRect(margin, y, contentWidth, tripRowHeight - 1);
          ctx.strokeStyle = '#e5ebf1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(margin, y + tripRowHeight - 1);
          ctx.lineTo(margin + contentWidth, y + tripRowHeight - 1);
          ctx.stroke();
          ctx.fillStyle = REPORT.slate;
          ctx.font = '750 16px system-ui, sans-serif';
          ctx.fillText(String(tripNumber).padStart(2, '0'), margin + 25, y + 39);
          ctx.fillStyle = REPORT.inkStrong;
          ctx.font = '850 18px system-ui, sans-serif';
          drawEllipsisText(ctx, `Frota ${group.fleet}`, margin + 245, y + 39, 360);
          ctx.textAlign = 'right';
          ctx.fillStyle = REPORT.green;
          ctx.font = '900 19px system-ui, sans-serif';
          ctx.fillText(`${formatQuantity(Number(trip.weight), trip.unit)} ${unitLabel(trip.unit)}`, width - 420, y + 39);
          ctx.textAlign = 'left';
          ctx.fillStyle = REPORT.muted;
          ctx.font = '650 16px system-ui, sans-serif';
          ctx.fillText(compactDateLabel(trip.createdAt), width - 360, y + 39);
          y += tripRowHeight;
        });
        y += 15;
      });

      if (!groups.length) {
        fillRoundedRect(ctx, margin, y, contentWidth, emptyHeight, 14, REPORT.white, REPORT.border);
        ctx.fillStyle = REPORT.muted;
        ctx.font = '700 18px system-ui, sans-serif';
        ctx.fillText('Nenhuma viagem registrada até o momento.', margin + 25, y + 66);
        y += emptyHeight;
      }

      y += 10;
      fillRoundedRect(ctx, margin, y, contentWidth, footerHeight, 16, statusFill, statusColor);
      ctx.fillStyle = statusColor;
      ctx.fillRect(margin, y, 8, footerHeight);
      drawSectionLabel(ctx, 'RESULTADO FINAL', margin + 28, y + 38);
      ctx.fillStyle = REPORT.inkStrong;
      ctx.font = '950 31px system-ui, sans-serif';
      const finalText = overage > 0
        ? `Passou ${formatQuantity(overage, targetUnit)} ${unitLabel(targetUnit)} do pedido`
        : delivered >= targetQuantity && targetQuantity > 0
          ? 'Dentro do pedido — carga concluída'
          : `Ainda falta ${formatQuantity(remaining, targetUnit)} ${unitLabel(targetUnit)}`;
      drawEllipsisText(ctx, finalText, margin + 28, y + 86, contentWidth - 56);
      ctx.fillStyle = REPORT.slate;
      ctx.font = '650 16px system-ui, sans-serif';
      ctx.fillText(`Pedido: ${formatQuantity(targetQuantity, targetUnit)} ${unitLabel(targetUnit)}  •  Entregue: ${formatQuantity(delivered, targetUnit)} ${unitLabel(targetUnit)}`, margin + 28, y + 122);
      ctx.fillText(`Mapas Branco Peres  •  Documento de controle operacional  •  ${dateLabel(generatedAt)}`, margin + 28, y + 151);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.96));
      if (!blob) throw new Error('Não foi possível gerar a imagem');
      const filename = `relatorio-${sanitizeFilePart(materialLabel)}-${new Date().toISOString().slice(0, 10)}.png`;
      downloadBlob(blob, filename);
      setExportMessage('Relatório PNG exportado.');
    } catch (error) {
      console.error('[transport-report] export failed', error);
      setExportMessage('Não foi possível exportar agora. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bp-transport-report-action" data-testid="transport-report-action">
      <button
        type="button"
        className="bp-transport-report-btn"
        data-testid="transport-report-btn"
        onClick={() => void exportReport()}
        disabled={exporting}
        aria-busy={exporting}
        title="Exportar relatório do transporte como imagem PNG"
      >
        {exporting ? <Loader2 size={17} className="bp-transport-report-spinner" /> : <FileImage size={17} />}
        <span>{exporting ? 'Gerando imagem…' : 'Exportar relatório'}</span>
        {!exporting && <Download size={14} aria-hidden="true" />}
      </button>
      {exportMessage && (
        <span className={`bp-transport-report-message${exportMessage.startsWith('Não') ? ' is-error' : ''}`} role="status">
          {!exportMessage.startsWith('Não') && <CheckCircle2 size={14} />}
          {exportMessage}
        </span>
      )}
    </div>
  );
}
