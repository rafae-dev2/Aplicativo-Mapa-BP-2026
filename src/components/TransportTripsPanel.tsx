import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, ClipboardList, Plus, Scale, Trash2, Truck, X } from 'lucide-react';
import TransportTripsReport from './TransportTripsReport';
import type { POI, TransportTrip, TransportUnit } from './POIManager';
import { getTransportMaterial, usesTransportMunck } from './POIManager';
import { formatTonsInput, parseTons } from '@/lib/transportFormat';

interface TransportTripsPanelProps {
  poi: POI;
  onUpdate: (id: string, updates: Partial<POI>) => void;
}

function createTripId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fallback abaixo */ }
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseQuantity(value: string): number {
  return parseTons(value);
}

function formatQuantity(value: number, unit: TransportUnit): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit === 'bigbags' ? 0 : 2,
  });
}

function unitLabel(unit: TransportUnit): string {
  return unit === 'bigbags' ? 'BigBags' : 't';
}

function dateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function TransportTripsPanel({ poi, onUpdate }: TransportTripsPanelProps) {
  const material = getTransportMaterial(poi.transportMaterial);
  const targetUnit: TransportUnit = poi.transportUnit || material?.unit || 'toneladas';
  const targetQuantity = Number(poi.transportQuantity || 0);
  const isMunckTransport = usesTransportMunck(poi.transportMaterial);
  const truckAsset = isMunckTransport ? '/poi-pin-transport-munck-truck.png' : '/poi-pin-transport-dump-truck.png';
  const truckLabel = isMunckTransport ? 'Caminhão munck' : 'Caminhão caçamba';
  const materialLabel = material?.label || 'Transporte';
  const trips = useMemo<TransportTrip[]>(
    () => (Array.isArray(poi.transportTrips) ? poi.transportTrips : []).filter((trip) => (
      trip && Number.isFinite(Number(trip.weight)) && Number(trip.weight) > 0
    )),
    [poi.transportTrips],
  );
  const delivered = trips
    .filter((trip) => trip.unit === targetUnit)
    .reduce((sum, trip) => sum + Number(trip.weight), 0);
  const rawBalance = targetQuantity - delivered;
  const remaining = Math.max(rawBalance, 0);
  const overage = Math.max(-rawBalance, 0);
  const progress = targetQuantity > 0 ? Math.min((delivered / targetQuantity) * 100, 100) : delivered > 0 ? 100 : 0;
  const otherUnitTrips = trips.filter((trip) => trip.unit !== targetUnit).length;

  const [isAdding, setIsAdding] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [fleet, setFleet] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');
  const [calcTotal, setCalcTotal] = useState(
    targetQuantity > 0 ? (targetUnit === 'bigbags' ? String(targetQuantity) : formatTonsInput(String(targetQuantity))) : '',
  );
  const [calcLoad, setCalcLoad] = useState('');

  const formatWeightInput = (raw: string) => (targetUnit === 'bigbags' ? raw : formatTonsInput(raw));

  const resetTripForm = () => {
    setFleet('');
    setWeight('');
    setError('');
  };

  const handleAddTrip = () => {
    const parsedWeight = parseQuantity(weight);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setError(`Informe o peso da viagem em ${targetUnit === 'bigbags' ? 'BigBags' : 'toneladas'}.`);
      return;
    }
    if (targetUnit === 'bigbags' && !Number.isInteger(parsedWeight)) {
      setError('A quantidade em BigBags deve ser um número inteiro.');
      return;
    }
    const nextTrip: TransportTrip = {
      id: createTripId(),
      fleet: fleet.trim(),
      weight: parsedWeight,
      unit: targetUnit,
      createdAt: Date.now(),
    };
    onUpdate(poi.id, { transportTrips: [...trips, nextTrip] });
    resetTripForm();
    setIsAdding(false);
  };

  const handleDeleteTrip = (tripId: string) => {
    onUpdate(poi.id, { transportTrips: trips.filter((trip) => trip.id !== tripId) });
  };

  const calcTotalValue = parseQuantity(calcTotal);
  const calcLoadValue = parseQuantity(calcLoad);
  const calculatedTrips = Number.isFinite(calcTotalValue) && calcTotalValue > 0 && Number.isFinite(calcLoadValue) && calcLoadValue > 0
    ? Math.ceil(calcTotalValue / calcLoadValue)
    : 0;
  const calculatedLastLoad = calculatedTrips > 0 ? Math.min(calcLoadValue, calcTotalValue - (calculatedTrips - 1) * calcLoadValue) : 0;

  return (
    <section className="bp-transport-trips" data-testid="transport-trips-panel">
      <div className="bp-transport-trips-head">
        <div className="bp-transport-heading-block">
          <div className="bp-transport-kicker-row">
            <div className="bp-transport-summary-kicker"><ClipboardList size={12} /> Controle de viagens</div>
            <span className={`bp-transport-material-tag ${isMunckTransport ? 'is-munck' : 'is-dump'}`}>
              <span className="bp-transport-material-tag-icon" aria-hidden="true">
                <img src={truckAsset} alt="" />
              </span>
              <span className="bp-transport-material-tag-copy">
                <strong>{materialLabel}</strong>
                <small>{truckLabel}</small>
              </span>
            </span>
          </div>
          <div className="bp-transport-summary-help">Informe somente o peso e a frota do caminhão</div>
        </div>
        <div className="bp-transport-head-actions">
          <TransportTripsReport
            poi={poi}
            trips={trips}
            targetQuantity={targetQuantity}
            targetUnit={targetUnit}
            delivered={delivered}
            remaining={remaining}
            overage={overage}
          />
          <button
            type="button"
            className="bp-transport-calculator-btn"
            data-testid="transport-calculator-btn"
            aria-expanded={showCalculator}
            aria-label="Abrir calculadora de viagens"
            onClick={() => setShowCalculator((value) => !value)}
          >
            <Calculator size={16} />
            <span>Calculadora</span>
          </button>
        </div>
      </div>

      <div className="bp-transport-progress" aria-label={`${formatQuantity(delivered, targetUnit)} de ${formatQuantity(targetQuantity, targetUnit)} entregues`}>
        <div className="bp-transport-progress-row">
          <span>Progresso da entrega</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <div className="bp-transport-balance-grid">
          <div className="bp-transport-balance-card bp-transport-balance-delivered">
            <span>Total entregue</span>
            <strong>{formatQuantity(delivered, targetUnit)} <small>{unitLabel(targetUnit)}</small></strong>
          </div>
          <div className={`bp-transport-balance-card bp-transport-balance-remaining${overage > 0 ? ' is-overage' : remaining === 0 && targetQuantity > 0 ? ' is-complete' : ''}`}>
            <span>{overage > 0 ? 'Status' : remaining === 0 && targetQuantity > 0 ? 'Status' : 'Falta levar'}</span>
            <strong>{overage > 0 ? 'Ultrapassado' : remaining === 0 && targetQuantity > 0 ? 'Concluído' : `${formatQuantity(remaining, targetUnit)} ${unitLabel(targetUnit)}`}</strong>
          </div>
        </div>
        {overage > 0 && (
          <div className="bp-transport-balance-overage" data-testid="transport-overage" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <span>Excesso de entrega</span>
              <strong>Passou {formatQuantity(overage, targetUnit)} {unitLabel(targetUnit)}</strong>
            </div>
          </div>
        )}
        <div className={`bp-transport-progress-track${overage > 0 ? ' is-overage' : ''}`}><span style={{ width: `${progress}%` }} /></div>
        <div className="bp-transport-progress-footer">
          <span>Planejado: {formatQuantity(targetQuantity, targetUnit)} {unitLabel(targetUnit)}</span>
          <strong className={overage > 0 ? 'is-overage' : ''}>{overage > 0 ? `+${formatQuantity(overage, targetUnit)} ${unitLabel(targetUnit)} além do plano` : `${formatQuantity(delivered, targetUnit)} / ${formatQuantity(targetQuantity, targetUnit)}`}</strong>
        </div>
      </div>

      {otherUnitTrips > 0 && (
        <div className="bp-transport-unit-warning" role="status">
          Existem {otherUnitTrips} viagem(ns) em outra unidade. Elas ficam preservadas e não são somadas ao saldo atual.
        </div>
      )}

      {showCalculator && (
        <div className="bp-transport-calculator" data-testid="transport-calculator">
          <div className="bp-transport-calculator-title"><Calculator size={14} /> Planejar viagens</div>
          <div className="bp-transport-calculator-grid">
            <label>
              Total a levar ({unitLabel(targetUnit)})
              <input value={calcTotal} inputMode="decimal" onChange={(event) => setCalcTotal(formatWeightInput(event.target.value))} placeholder="Ex.: 24" />
            </label>
            <label>
              Capacidade por viagem ({unitLabel(targetUnit)})
              <input value={calcLoad} inputMode="decimal" onChange={(event) => setCalcLoad(formatWeightInput(event.target.value))} placeholder="Ex.: 8" />
            </label>
          </div>
          {calculatedTrips > 0 && (
            <div className="bp-transport-calculator-result">
              <strong>{calculatedTrips} viagem(ns)</strong>
              <span>Última viagem: {formatQuantity(calculatedLastLoad, targetUnit)} {unitLabel(targetUnit)}</span>
            </div>
          )}
        </div>
      )}

      <div className="bp-transport-trip-actions">
        <span className="bp-transport-trip-count">{trips.length} viagem(ns) registrada(s)</span>
        <button type="button" className="bp-transport-add-trip-btn" data-testid="transport-add-trip-btn" onClick={() => { setIsAdding((value) => !value); setError(''); }}>
          {isAdding ? <X size={15} /> : <Plus size={15} />}
          {isAdding ? 'Fechar' : 'Registrar viagem'}
        </button>
      </div>

      {isAdding && (
        <div className="bp-transport-trip-form" data-testid="transport-trip-form">
          <div className="bp-transport-trip-form-title"><Scale size={15} /> Dados da viagem</div>
          <div className="bp-transport-summary-help">Preencha os dois campos abaixo. A data e a hora entram automaticamente ao salvar.</div>
          <div className="bp-transport-trip-form-grid">
            <label className="bp-transport-field-primary">
              Peso desta viagem ({targetUnit === 'bigbags' ? 'BigBags' : 'toneladas'}) <span className="bp-transport-required">*</span>
              <input data-testid="transport-trip-weight" value={weight} onChange={(event) => { setWeight(formatWeightInput(event.target.value)); setError(''); }} inputMode={targetUnit === 'bigbags' ? 'numeric' : 'decimal'} placeholder={targetUnit === 'bigbags' ? 'Ex.: 24' : 'Ex.: 22.300 ou 8,50'} autoFocus />
            </label>
            <label className="bp-transport-field-primary">
              Frota / caminhão <span className="bp-transport-label-hint">opcional</span>
              <input data-testid="transport-trip-fleet" value={fleet} onChange={(event) => setFleet(event.target.value)} placeholder="Ex.: 03 ou ABC1D23" />
            </label>
          </div>
          {error && <div className="bp-transport-error" role="alert">{error}</div>}
          <button type="button" className="bp-transport-save-trip-btn" data-testid="transport-save-trip-btn" onClick={handleAddTrip}>
            <Scale size={17} /> Salvar peso da viagem
          </button>
        </div>
      )}

      {trips.length > 0 && (
        <div className="bp-transport-trip-list" data-testid="transport-trip-list">
          {trips.slice().sort((a, b) => b.createdAt - a.createdAt).map((trip, index) => (
            <article className="bp-transport-trip-row" key={trip.id} data-testid={`transport-trip-${trip.id}`}>
              <div className={`bp-transport-trip-icon ${isMunckTransport ? 'is-munck' : 'is-dump'}`} title={truckLabel}>
                <img src={truckAsset} alt={truckLabel} loading="lazy" />
              </div>
              <div className="bp-transport-trip-main">
                <div className="bp-transport-trip-topline">
                  <strong>Viagem {trips.length - index}</strong>
                  <b>{formatQuantity(Number(trip.weight), trip.unit)} {unitLabel(trip.unit)}</b>
                </div>
                <div className="bp-transport-trip-meta">
                  <span><Truck size={11} /> {trip.fleet || 'Frota não informada'}</span>
                  <time dateTime={new Date(trip.createdAt).toISOString()}>{dateLabel(trip.createdAt)}</time>
                </div>
                {trip.notes && <div className="bp-transport-trip-notes">{trip.notes}</div>}
              </div>
              <button type="button" className="bp-transport-delete-trip-btn" data-testid={`transport-delete-trip-${trip.id}`} aria-label={`Excluir viagem ${index + 1}`} onClick={() => handleDeleteTrip(trip.id)}>
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
