
// Animação do logotipo
const logoAnimationStyle = `
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes glow {
    0%, 100% { filter: drop-shadow(0 0 8px rgba(173,255,47,0.3)); }
    50% { filter: drop-shadow(0 0 16px rgba(173,255,47,0.6)); }
  }
`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-logo-animation]')) {
  const style = document.createElement('style');
  style.setAttribute('data-logo-animation', 'true');
  style.textContent = logoAnimationStyle;
  document.head.appendChild(style);
}


/**
 * CustomPoiPopup v112 — Popup ao clicar em um POI no mapa com Glass Liquid
 * Design dark moderno com glassmorphism, igual ao modal dos mapas
 */

import React, { useEffect, useState } from 'react';
import { X, Share2, Edit2, Trash2, Copy, Check, MapPin, Save, Maximize2, Navigation, ChevronDown } from 'lucide-react';
import { POI, CATEGORY_MAP, getTransportMaterial, getTransportUnits, TRANSPORT_MATERIALS, usesTransportMunck, type TransportMaterial, type TransportUnit } from './POIManager';
import { PoiCategoryIcon } from './PoiMarkerIcon';
import { formatTonsInput, parseTons } from '@/lib/transportFormat';
import TransportTripsPanel from './TransportTripsPanel';

interface CustomPoiPopupProps {
  poi: POI;
  onClose: () => void;
  onShare: (poi: POI) => void;
  onUpdate: (id: string, updates: Partial<POI>) => void;
  onDelete: (id: string) => void;
  onNavigate?: (poi: POI) => void;
  presentation?: 'popup' | 'sheet';
}

export default function CustomPoiPopup({ poi, onClose, onShare, onUpdate, onDelete, onNavigate, presentation = 'popup' }: CustomPoiPopupProps) {
  const [isEditing, setIsEditing]       = useState(false);
  const [editTitle, setEditTitle]       = useState(poi.title || '');
  const [editDescription, setEditDescription] = useState(poi.description || '');
  const [currentMessage, setCurrentMessage] = useState(poi.message || '');
  const [editTransportMaterial, setEditTransportMaterial] = useState<TransportMaterial>((poi.transportMaterial as TransportMaterial) || 'torta');
  const [editTransportUnit, setEditTransportUnit] = useState<TransportUnit>(poi.transportUnit || (poi.transportMaterial === 'reativo_bigbag' ? 'bigbags' : 'toneladas'));
  const [editTransportQuantity, setEditTransportQuantity] = useState(
    poi.transportQuantity == null ? '' : formatTonsInput(String(poi.transportQuantity)),
  );
  const [editTransportFormula, setEditTransportFormula] = useState(poi.transportFormula || '');
  const [editWaterAvailable, setEditWaterAvailable] = useState(poi.waterAvailable !== false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied]             = useState(false);
  const [lightbox, setLightbox]         = useState(false);
  const [isBrandMinimized, setIsBrandMinimized] = useState(false);

  const catInfo = CATEGORY_MAP[poi.category] || CATEGORY_MAP.marcacao;
  const isAlert = ['incendio', 'queimada'].includes(poi.category);
  const isTransport = poi.category === 'transporte_insumo';
  const transportInfo = getTransportMaterial(poi.transportMaterial);
  const editTransportInfo = getTransportMaterial(editTransportMaterial);

  const accentColor = catInfo.color;

  const handleCopyCoords = () => {
    const text = `${poi.lat?.toFixed(6) ?? 'N/A'}, ${poi.lng?.toFixed(6) ?? 'N/A'}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    setEditTitle(poi.title || '');
    setEditDescription(poi.description || '');
    setCurrentMessage(poi.message || '');
    setEditTransportMaterial((poi.transportMaterial as TransportMaterial) || 'torta');
    setEditTransportUnit(poi.transportUnit || (poi.transportMaterial === 'reativo_bigbag' ? 'bigbags' : 'toneladas'));
    setEditTransportQuantity(poi.transportQuantity == null ? '' : formatTonsInput(String(poi.transportQuantity)));
    setEditTransportFormula(poi.transportFormula || '');
    setEditWaterAvailable(poi.waterAvailable !== false);
    setIsBrandMinimized(false);
  }, [poi.id, poi.title, poi.description, poi.message, poi.transportMaterial, poi.transportQuantity, poi.transportFormula, poi.transportUnit]);

  const isRepresa = poi.category === 'represa';

  const handleSave = () => {
    if (isTransport) {
      const quantity = editTransportUnit === 'bigbags'
        ? Number(String(editTransportQuantity).replace(',', '.'))
        : parseTons(editTransportQuantity);
      if (!editTransportInfo || !Number.isFinite(quantity) || quantity <= 0) {
        alert(`Informe uma quantidade válida em ${editTransportUnit === 'bigbags' ? 'BigBags' : 'toneladas'}.`);
        return;
      }
      if (editTransportUnit === 'bigbags' && !Number.isInteger(quantity)) {
        alert('A quantidade em BigBags deve ser um número inteiro.');
        return;
      }
      onUpdate(poi.id, {
        title: editTitle.trim() || poi.title,
        description: editDescription,
        message: currentMessage,
        transportMaterial: editTransportMaterial,
        transportQuantity: quantity,
        transportFormula: editTransportMaterial === 'adubo' ? editTransportFormula.trim() : '',
        transportUnit: editTransportUnit,
      });
    } else {
      onUpdate(poi.id, {
        title: editTitle.trim() || poi.title,
        description: editDescription,
        message: currentMessage,
        ...(isRepresa ? { waterAvailable: editWaterAvailable } : {}),
      });
    }
    setIsEditing(false);
  };

  return (
    <>
    <div
      className={`glass-liquid-strong bp-popup-content bp-poi-popup-content bp-custom-poi-popup${isTransport ? ' is-transport' : ''}`}
      data-testid="custom-poi-popup"
      onClick={(event) => event.stopPropagation()}
      style={{
      background: 'var(--bp-glass-bg-strong)',
      backdropFilter: 'blur(32px) saturate(185%)',
      WebkitBackdropFilter: 'blur(32px) saturate(185%)',
      border: `1px solid ${accentColor}40`,
      borderRadius: presentation === 'sheet' ? 0 : 20,
      overflow: 'hidden',
      width: presentation === 'sheet' ? '100%' : 'min(340px, calc(100vw - 40px))',
      maxWidth: presentation === 'sheet' ? 'none' : undefined,
      boxShadow: presentation === 'sheet' ? 'none' : `var(--bp-glass-shadow), 0 0 0 1px ${accentColor}15`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Handle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
      </div>

      {/* Header */}
      <div className="bp-custom-poi-header" style={{
        padding: '10px 14px 10px',
        borderBottom: `1px solid ${accentColor}15`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Ícone da categoria */}
        <div className="bp-custom-poi-category-icon" style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `${accentColor}15`, border: `1px solid ${accentColor}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          <PoiCategoryIcon className="bp-custom-poi-category-glyph" category={poi.category} size={23} color={accentColor} transportMaterial={poi.transportMaterial} waterAvailable={poi.waterAvailable !== false} />
        </div>

        {/* Título */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bp-custom-poi-group" style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: `${accentColor}90`, textTransform: 'uppercase', marginBottom: 2,
          }}>
            {catInfo.group}
          </div>
          <div className="bp-custom-poi-title" style={{
            fontSize: 15, fontWeight: 900, color: 'white',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {poi.title || catInfo.title}
          </div>
        </div>

        {/* Ações do POI; o fechamento geral fica no cabeçalho único da folha. */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <ActionBtn onClick={() => { setConfirmDelete(false); setIsEditing(!isEditing); }} title="Editar" color="#60a5fa" testid="poi-edit-btn">
            <Edit2 size={14} />
          </ActionBtn>
          <ActionBtn onClick={() => onShare(poi)} title="Compartilhar" color="#4ade80">
            <Share2 size={14} />
          </ActionBtn>
          <ActionBtn
            onClick={() => { setIsEditing(false); setConfirmDelete(true); }}
            title="Excluir" color="#ef4444" testid="poi-delete-btn"
          >
            <Trash2 size={14} />
          </ActionBtn>
          {presentation !== 'sheet' && (
            <ActionBtn onClick={onClose} title="Fechar" color="rgba(255,255,255,0.5)">
              <X size={14} />
            </ActionBtn>
          )}
        </div>
      </div>

      {/* Confirmação de exclusão (inline — funciona em PWA/celular, sem window.confirm) */}
      {confirmDelete && (
        <div
          data-testid="poi-delete-confirm"
          style={{
            margin: '10px 14px 0', padding: '10px 12px', borderRadius: 12,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>
            Excluir esta marcação?
          </span>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)',
            }}
          >Cancelar</button>
          <button
            data-testid="poi-confirm-delete-btn"
            onClick={() => { setConfirmDelete(false); onDelete(poi.id); }}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800,
              background: 'rgba(239,68,68,0.9)', border: '1px solid rgba(239,68,68,1)', color: 'white',
            }}
          >Excluir</button>
        </div>
      )}

      {/* Foto anexada (se houver) — clique para ampliar */}
      {poi.photo ? (
        <div style={{
          padding: '12px 14px 8px',
          background: `linear-gradient(135deg, ${accentColor}10, ${accentColor}04)`,
          borderBottom: `1.5px solid ${accentColor}20`,
        }}>
          <button
            onClick={() => setLightbox(true)}
            style={{
              display: 'block', width: '100%', padding: 0, border: 'none',
              borderRadius: 14, overflow: 'hidden', cursor: 'zoom-in',
              position: 'relative', background: 'rgba(0,0,0,0.3)',
            }}
            title="Ampliar foto"
          >
            <img
              src={poi.photo}
              alt={poi.title}
              style={{
                width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block',
                borderRadius: 14, border: `2px solid ${accentColor}35`,
              }}
            />
            <span style={{
              position: 'absolute', bottom: 8, right: 8,
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(0,0,0,0.6)', color: 'white',
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
              backdropFilter: 'blur(6px)',
            }}>
              <Maximize2 size={11} /> Ampliar
            </span>
          </button>
        </div>
      ) : (
        /* Logo da empresa - Centralizado Premium com Animação */
        <div className={`bp-popup-brand-section${isBrandMinimized ? ' is-minimized' : ''}`} style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '16px 0 12px',
          position: 'relative',
          background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}06)`,
          borderBottom: `1.5px solid ${accentColor}20`,
        }}>
          <button
            type="button"
            className="bp-popup-brand-toggle"
            aria-expanded={!isBrandMinimized}
            aria-label={isBrandMinimized ? 'Expandir logotipo da empresa' : 'Minimizar logotipo da empresa'}
            onClick={() => setIsBrandMinimized((value) => !value)}
          >
            <ChevronDown size={13} aria-hidden="true" />
            <span>{isBrandMinimized ? 'Expandir' : 'Minimizar'}</span>
          </button>
          <div className="bp-popup-brand-frame" style={{
            width: 80, height: 80, borderRadius: 20, flexShrink: 0,
            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}08)`,
            border: `2.5px solid ${accentColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: `0 12px 32px ${accentColor}25, inset 0 1px 3px rgba(255,255,255,0.15)`,
            animation: 'float 3s ease-in-out infinite',
            position: 'relative',
          }}>
            {/* Glow effect */}
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              background: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
              animation: 'glow 2s ease-in-out infinite',
              pointerEvents: 'none',
            }} />

            <img
              src="/icon-logo.png"
              alt="Branco Peres"
              style={{
                width: 70,
                height: 70,
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
                animation: 'spin 20s linear infinite',
                position: 'relative',
                zIndex: 1,
              }}
            />
          </div>
        </div>
      )}

      {/* Nome do implemento agrícola */}
      {poi.implementoAgr && (
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '4px 14px 8px',
        }}>
          <span style={{
            fontSize: 12, fontWeight: 800,
            color: '#f59e0b', background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.25)', borderRadius: 999, padding: '4px 10px',
          }}>
            Nome Implemento Agr.: {poi.implementoAgr}
          </span>
        </div>
      )}

      {/* Carga transportada */}
      {isTransport && poi.transportMaterial && poi.transportQuantity != null && (
        <div className="bp-transport-summary" data-testid="transport-summary">
          <div className="bp-transport-summary-kicker">Carga para este ponto</div>
          <div className="bp-transport-summary-main">
            <span className="bp-transport-summary-material">{transportInfo?.label || poi.transportMaterial}</span>
            <strong>{poi.transportQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {(poi.transportUnit || transportInfo?.unit) === 'bigbags' ? 'BigBags' : 't'}</strong>
          </div>
          <div className="bp-transport-summary-help">
            Transporte por caminhão {usesTransportMunck(poi.transportMaterial) ? 'munck' : 'caçamba'}
            {poi.transportMaterial === 'adubo' && poi.transportFormula ? ` · Fórmula ${poi.transportFormula}` : ''}
          </div>
        </div>
      )}

      {isTransport && (
        <TransportTripsPanel poi={poi} onUpdate={onUpdate} />
      )}

      {isRepresa && (
        <div
          className={`bp-water-status ${poi.waterAvailable === false ? 'is-unavailable' : 'is-available'}`}
          data-testid="water-status"
        >
          <img
            src={poi.waterAvailable === false ? '/poi-water-truck-x.png' : '/poi-water-truck-blue.png'}
            alt=""
            aria-hidden="true"
            className="bp-water-status-icon"
          />
          <div className="bp-water-status-copy">
            <span className="bp-water-status-kicker">Pegador de água</span>
            <strong>{poi.waterAvailable === false ? 'Represa baixa — sem água' : 'Água disponível'}</strong>
          </div>
        </div>
      )}

      {/* Fundo / Talhão */}
      {(poi.fundo || poi.talhao) && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8, padding: '4px 14px 8px',
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: `${accentColor}12`, border: `1px solid ${accentColor}25`,
            color: accentColor,
          }}>
            Fundo {poi.fundo || 'N/A'}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)',
          }}>
            Talhão {poi.talhao || 'N/A'}
          </span>
        </div>
      )}

      {/* Localização operacional do incêndio */}
      {poi.category === 'incendio' && (
        <div
          data-testid="fire-location-card"
          style={{
            margin: '10px 14px 0', padding: '11px 12px', borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(255,153,51,0.08))',
            border: '1px solid rgba(255,126,72,0.5)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 5px 18px rgba(220,38,38,0.16)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#ffd166', fontSize: 10, fontWeight: 950, letterSpacing: '0.11em' }}>
            <PoiCategoryIcon category="incendio" size={16} color="#ffd166" />
            FOCO DE INCÊNDIO · LOCALIZAÇÃO
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
            <MapPin size={15} color="#ff9b72" />
            <span style={{ color: 'rgba(255,245,238,0.74)', fontSize: 11 }}>Coordenadas registradas</span>
            <code style={{ marginLeft: 'auto', color: '#fff7ed', fontSize: 11, fontWeight: 800, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
              {poi.lat.toFixed(6)}, {poi.lng.toFixed(6)}
            </code>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Navegar até aqui (GPS offline) — destaque para alertas/incêndio */}
        {onNavigate && (
          <button
            data-testid="navigate-to-poi-btn"
            onClick={() => onNavigate(poi)}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', fontWeight: 900, fontSize: 14,
              background: isAlert
                ? 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(239,68,68,0.14))'
                : `linear-gradient(135deg, ${accentColor}28, ${accentColor}12)`,
              border: `1px solid ${isAlert ? 'rgba(239,68,68,0.5)' : `${accentColor}50`}`,
              color: isAlert ? '#fca5a5' : accentColor,
              boxShadow: isAlert ? '0 4px 16px rgba(239,68,68,0.25)' : 'none',
            }}
          >
            <Navigation size={16} />
            {isAlert ? 'Navegar até o foco (GPS)' : 'Navegar até aqui (GPS)'}
          </button>
        )}

        {isEditing ? (
          <>
            <label style={{ fontSize: 10, fontWeight: 800, color: `${accentColor}90`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Título</label>
            <input
              data-testid="poi-edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título da marcação"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'white', fontSize: 13, outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <label style={{ fontSize: 10, fontWeight: 800, color: `${accentColor}90`, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Descrição</label>
            <textarea
              data-testid="poi-edit-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              placeholder="Descrição..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'white', fontSize: 13, outline: 'none', resize: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <label style={{ fontSize: 10, fontWeight: 800, color: `${accentColor}90`, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Mensagem</label>
            <textarea
              data-testid="poi-edit-message"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              rows={2}
              placeholder="Mensagem especial..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'white', fontSize: 13, outline: 'none', resize: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {isTransport && (
              <div className="bp-transport-edit-fields">
                <label htmlFor="poi-edit-transport-material">Insumo</label>
                <select
                  id="poi-edit-transport-material"
                  data-testid="poi-edit-transport-material"
                    value={editTransportMaterial}
                    onChange={(e) => {
                      const nextMaterial = e.target.value as TransportMaterial;
                      setEditTransportMaterial(nextMaterial);
                      setEditTransportUnit(getTransportMaterial(nextMaterial)?.unit || 'toneladas');
                      if (nextMaterial !== 'adubo') setEditTransportFormula('');
                    }}
                >
                  {TRANSPORT_MATERIALS.map((material) => <option key={material.value} value={material.value}>{material.label}</option>)}
                </select>
                {(editTransportMaterial === 'reativo_bigbag' || editTransportMaterial === 'adubo') && (
                  <div className="bp-transport-edit-unit-choice" role="radiogroup" aria-label={`Unidade do ${editTransportMaterial === 'adubo' ? 'Adubo' : 'Reativo'} na edição`}>
                    <span>Controlar {editTransportMaterial === 'adubo' ? 'Adubo' : 'Reativo'} por</span>
                    <div>
                      {getTransportUnits(editTransportMaterial).map((unit) => (
                        <button
                          type="button"
                          key={unit}
                          role="radio"
                          aria-checked={editTransportUnit === unit}
                          onClick={() => {
                            setEditTransportUnit(unit);
                            setEditTransportQuantity((prev) => {
                              if (!prev) return prev;
                              if (unit === 'bigbags') return String(parseTons(prev) || '').replace('NaN', '');
                              return formatTonsInput(prev);
                            });
                          }}
                          className={editTransportUnit === unit ? 'is-selected' : ''}
                        >
                          {unit === 'bigbags' ? 'BigBags' : 'Peso (t)'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label htmlFor="poi-edit-transport-quantity">Quantidade ({editTransportUnit === 'bigbags' ? 'BigBags' : 'toneladas'})</label>
                <input
                  id="poi-edit-transport-quantity"
                  data-testid="poi-edit-transport-quantity"
                  type={editTransportUnit === 'bigbags' ? 'number' : 'text'}
                  min="0"
                  step={editTransportUnit === 'bigbags' ? 1 : 0.01}
                  inputMode={editTransportUnit === 'bigbags' ? 'numeric' : 'decimal'}
                  value={editTransportQuantity}
                  placeholder={editTransportUnit === 'bigbags' ? 'Ex: 24' : 'Ex: 22.300 ou 18,50'}
                  onChange={(e) => setEditTransportQuantity(
                    editTransportUnit === 'bigbags' ? e.target.value : formatTonsInput(e.target.value),
                  )}
                />
                {editTransportMaterial === 'adubo' && (
                  <label className="bp-transport-formula-field" htmlFor="poi-edit-transport-formula">
                    Fórmula do Adubo <span className="bp-transport-label-hint">opcional</span>
                    <input
                      id="poi-edit-transport-formula"
                      data-testid="poi-edit-transport-formula"
                      type="text"
                      value={editTransportFormula}
                      onChange={(e) => setEditTransportFormula(e.target.value)}
                      placeholder="Ex.: 18-04-18"
                      autoComplete="off"
                      maxLength={40}
                    />
                  </label>
                )}
              </div>
            )}
            {isRepresa && (
              <div className="bp-water-edit-fields" data-testid="poi-edit-water-fields">
                <span className="bp-water-edit-label">Disponibilidade de água</span>
                <div className="bp-water-toggle-row" role="radiogroup" aria-label="Disponibilidade de água na represa">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={editWaterAvailable}
                    data-testid="poi-edit-water-yes"
                    className={`bp-water-toggle-btn is-available ${editWaterAvailable ? 'is-selected' : ''}`}
                    onClick={() => setEditWaterAvailable(true)}
                  >
                    <Check size={15} aria-hidden="true" /> Disponível
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!editWaterAvailable}
                    data-testid="poi-edit-water-no"
                    className={`bp-water-toggle-btn is-unavailable ${!editWaterAvailable ? 'is-selected' : ''}`}
                    onClick={() => setEditWaterAvailable(false)}
                  >
                    <X size={15} aria-hidden="true" /> Represa baixa
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                setIsEditing(false);
                setEditTitle(poi.title || '');
                setEditDescription(poi.description || '');
                setCurrentMessage(poi.message || '');
                setEditTransportMaterial((poi.transportMaterial as TransportMaterial) || 'torta');
                setEditTransportUnit(poi.transportUnit || (poi.transportMaterial === 'reativo_bigbag' ? 'bigbags' : 'toneladas'));
                setEditTransportQuantity(poi.transportQuantity == null ? '' : formatTonsInput(String(poi.transportQuantity)));
                setEditTransportFormula(poi.transportFormula || '');
                setEditWaterAvailable(poi.waterAvailable !== false);
              }} style={{
                flex: 1, padding: '9px 0', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>Cancelar</button>
              <button data-testid="poi-save-btn" onClick={handleSave} style={{
                flex: 1, padding: '9px 0', borderRadius: 12,
                background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
                color: '#4ade80', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Save size={13} /> Salvar
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Descrição */}
            {poi.description && (
              <div style={{
                background: `${accentColor}08`, border: `1px solid ${accentColor}18`,
                borderRadius: 12, padding: '10px 12px',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: `${accentColor}70`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Descrição
                </p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>
                  {poi.description}
                </p>
              </div>
            )}

            {/* Mensagem */}
            {poi.message && (
              <div style={{
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 12, padding: '10px 12px',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(139,92,246,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Mensagem
                </p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', lineHeight: 1.4 }}>
                  "{poi.message}"
                </p>
              </div>
            )}

            {/* Vazio */}
            {!poi.description && !poi.message && !poi.implementoAgr && !poi.transportMaterial && !poi.transportFormula && (
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '12px',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                  Nenhuma informação adicional
                </p>
              </div>
            )}
          </>
        )}

        {/* Coordenadas */}
        <div className="bp-custom-poi-coordinates" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '8px 12px',
        }}>
          <MapPin className="bp-custom-poi-coordinates-icon" size={13} color="rgba(255,255,255,0.35)" />
          <span className="bp-custom-poi-coordinates-value" style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
            {poi.lat?.toFixed(6) ?? 'N/A'}, {poi.lng?.toFixed(6) ?? 'N/A'}
          </span>
          <button
            onClick={handleCopyCoords}
            className="bp-custom-poi-copy-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
            title="Copiar coordenadas"
            aria-label={copied ? 'Coordenadas copiadas' : 'Copiar coordenadas'}
          >
            {copied
              ? <Check size={14} />
              : <Copy size={14} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      </div>
    </div>

    {/* Lightbox da foto em tela cheia */}
    {lightbox && poi.photo && (
      <div
        onClick={() => setLightbox(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, cursor: 'zoom-out',
        }}
      >
        <img
          src={poi.photo}
          alt={poi.title}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}
        />
        <button
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', top: 16, right: 16,
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={22} />
        </button>
      </div>
    )}
    </>
  );
}

// ── Botão de ação pequeno ─────────────────────────────────────────────────────
function ActionBtn({ children, onClick, title, color, testid }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  color: string;
  testid?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      onPointerDown={(event) => event.stopPropagation()}
      title={title}
      data-testid={testid}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28, borderRadius: 8,
        background: hover ? `${color}20` : 'rgba(255,255,255,0.06)',
        border: `1px solid ${hover ? `${color}40` : 'rgba(255,255,255,0.10)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: hover ? color : 'rgba(255,255,255,0.5)',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}
