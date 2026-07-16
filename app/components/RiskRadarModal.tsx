'use client';
import React from 'react';
import { ModalShell } from './ModalShell';
import { Shield } from 'lucide-react';
import { RiskRadar } from '../features/quant/components/RiskRadar';
import { Alerta } from '../types';

interface RiskRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  alertas: (string | Alerta)[];
}

export function RiskRadarModal({ isOpen, onClose, alertas }: RiskRadarModalProps) {
  if (!isOpen) return null;

  return (
    <ModalShell
      onClose={onClose}
      title="Radar de Mercado"
      subtitle="Monitoramento de riscos sistêmicos e correlações."
      icon={<Shield size={20} />}
      maxWidth="3xl"
    >
      <div className="w-full min-h-[400px]">
        <RiskRadar alertas={alertas} />
      </div>
    </ModalShell>
  );
}
