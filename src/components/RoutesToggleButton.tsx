/**
 * RoutesToggleButton — Botão para Ativar/Desativar Sistema de Rotas
 * 
 * Funcionalidades:
 * - Botão flutuante para abrir/fechar sistema de rotas
 * - Indicador de rotas disponíveis
 * - Animações suaves
 */

import React, { useState } from 'react';
import { Truck, X } from 'lucide-react';
import { COLORS } from '@/config/constants';

interface RoutesToggleButtonProps {
  rotasCount: number;
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
}

export const RoutesToggleButton: React.FC<RoutesToggleButtonProps> = ({
  rotasCount,
  isOpen,
  onToggle,
}) => {
  return (
    <>
      {/* Botão Flutuante */}
      <button
        onClick={() => onToggle(!isOpen)}
        className={`routes-toggle-button ${isOpen ? 'active' : ''}`}
        title={isOpen ? 'Fechar Sistema de Rotas' : 'Abrir Sistema de Rotas'}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <Truck className="w-6 h-6" />
            {rotasCount > 0 && (
              <span className="routes-badge">{rotasCount}</span>
            )}
          </>
        )}
      </button>

      {/* Estilos */}
      <style>{`
        .routes-toggle-button {
          position: fixed;
          bottom: 100px;
          right: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(173, 255, 47, 0.2), rgba(173, 255, 47, 0.1));
          border: 2px solid rgba(173, 255, 47, 0.5);
          color: #adff2f;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(173, 255, 47, 0.2);
          z-index: 40;
        }

        .routes-toggle-button:hover {
          background: linear-gradient(135deg, rgba(173, 255, 47, 0.3), rgba(173, 255, 47, 0.2));
          border-color: rgba(173, 255, 47, 0.8);
          box-shadow: 0 6px 30px rgba(173, 255, 47, 0.3);
          transform: scale(1.1);
        }

        .routes-toggle-button.active {
          background: linear-gradient(135deg, rgba(173, 255, 47, 0.3), rgba(173, 255, 47, 0.2));
          border-color: rgba(173, 255, 47, 0.8);
        }

        .routes-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 28px;
          height: 28px;
          background: #FF6B35;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: bold;
          border: 2px solid rgba(26, 35, 51, 0.97);
          box-shadow: 0 2px 10px rgba(255, 107, 53, 0.3);
        }

        @media (max-width: 768px) {
          .routes-toggle-button {
            bottom: 80px;
            right: 15px;
            width: 48px;
            height: 48px;
          }

          .routes-toggle-button svg {
            width: 24px;
            height: 24px;
          }

          .routes-badge {
            width: 24px;
            height: 24px;
            font-size: 0.7rem;
          }
        }
      `}</style>
    </>
  );
};

export default RoutesToggleButton;
