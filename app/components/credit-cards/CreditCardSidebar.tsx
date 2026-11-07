'use client';

import React from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { formatMoney } from '../../lib/format';

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
  const totalLimit = cards.reduce((acc, c) => acc + Number(c.limit || 0), 0);

  return (
    <div className="bg-surface-card border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Meus Cartões</h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenImport}
            title="Importar fatura em PDF/Excel"
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition shadow"
          >
            <FileText size={13} /> Importar
          </button>
          <button
            onClick={onOpenAddCard}
            title="Adicionar novo cartão"
            className="p-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition"
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
            className={`p-3 rounded-lg border text-left cursor-pointer transition flex justify-between items-center ${
              selectedCard?.id === c.id
                ? 'bg-indigo-500/10 border-indigo-500 text-white'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div>
              <p className="font-semibold text-sm">{c.name}</p>
              <p className="text-xs text-slate-400">Limite: {formatMoney(c.limit)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCard(c.id);
              }}
              className="text-slate-500 hover:text-rose-400 p-1 rounded transition"
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
            className={`p-3 rounded-lg border text-left cursor-pointer transition flex justify-between items-center ${
              selectedCard?.id === 0
                ? 'bg-indigo-500/10 border-indigo-500 text-white shadow-md shadow-indigo-500/10'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div>
              <p className="font-semibold text-sm flex items-center gap-1.5 text-indigo-300">
                <span>TOTAL</span>
                <span className="text-[10px] font-normal bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                  Consolidado
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Limite: {formatMoney(totalLimit)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
