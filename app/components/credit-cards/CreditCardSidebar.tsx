'use client';

import React from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import { usePrivacy } from '../../context/PrivacyContext';

interface CardItem {
  id: number;
  name: string;
  limit: number;
  closing_day: number;
  due_day: number;
}

interface CreditCardSidebarProps {
  cards: CardItem[];
  selectedCard: CardItem | null;
  onSelectCard: (card: CardItem) => void;
  onDeleteCard: (cardId: number) => void;
  onOpenAddCard: () => void;
  onOpenImport: () => void;
}

export function CreditCardSidebar({
  cards,
  selectedCard,
  onSelectCard,
  onDeleteCard,
  onOpenAddCard,
  onOpenImport,
}: CreditCardSidebarProps) {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const totalLimit = cards.reduce((acc, c) => acc + Number(c.limit || 0), 0);

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Meus Cartões</h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenImport}
            title="Importar fatura em PDF/Excel"
            className="flex items-center gap-1 bg-accent hover:bg-accent/90 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
          >
            <FileText size={13} /> Importar
          </button>
          <button
            onClick={onOpenAddCard}
            title="Adicionar novo cartão"
            className="p-1 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {cards.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelectCard(c)}
            className={`p-3 rounded-lg border text-left cursor-pointer transition-colors flex justify-between items-center ${selectedCard?.id === c.id
              ? 'bg-accent-soft border-accent text-text-primary'
              : 'bg-surface-elevated border-border-subtle hover:border-accent/40 text-text-primary'
              }`}
          >
            <div>
              <p className="font-semibold text-sm">{c.name}</p>
              <p className="text-xs text-text-muted tabular-nums">Limite: {money(c.limit)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCard(c.id);
              }}
              className="text-text-muted hover:text-status-error p-1 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {cards.length > 1 && (
          <div
            onClick={() =>
              onSelectCard({
                id: 0,
                name: 'TOTAL',
                limit: totalLimit,
                closing_day: 1,
                due_day: 1,
              })
            }
            className={`p-3 rounded-lg border text-left cursor-pointer transition-colors flex justify-between items-center ${selectedCard?.id === 0
              ? 'bg-accent-soft border-accent text-text-primary'
              : 'bg-surface-elevated border-border-subtle hover:border-accent/40 text-text-primary'
              }`}
          >
            <div>
              <p className="font-semibold text-sm flex items-center gap-1.5 text-accent">
                <span>TOTAL</span>
                <span className="text-2xs font-medium bg-accent-soft text-accent px-1.5 py-0.5 rounded-md border border-accent/30">
                  Consolidado
                </span>
              </p>
              <p className="text-xs text-text-muted mt-0.5 tabular-nums">Limite: {money(totalLimit)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
