'use client';
import { useEffect, useState } from 'react';
import { apiCall } from '../utils/apiClient';
import { Receipt, TrendingUp, CheckCircle2 } from 'lucide-react';
import { formatMoney } from '../utils';
import { usePrivacy } from '../context/PrivacyContext';

interface DividendRecord {
  ticker: string;
  date: string;
  total: number;
  status: string;
}

export const DividendHistory = () => {
  const [history, setHistory] = useState<DividendRecord[]>([]);
  const { isHidden } = usePrivacy();

  useEffect(() => {
    apiCall('/api/dividends/history')
      .then(data => setHistory(data as DividendRecord[]))
      .catch(err => console.error("Erro ao carregar extrato:", err));
  }, []);

  if (history.length === 0) return null;

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
      {/* Cabeçalho Sincronizado */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Receipt size={16} className="text-emerald-400" />
          </div>
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest leading-none">
            Extrato de Proventos
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 size={12} />
          <span className="text-[10px] font-bold uppercase tracking-tight">Confirmados</span>
        </div>
      </div>

      {/* Lista com Scroll Interno para não quebrar o layout da página */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-800/50 scrollbar-thin scrollbar-thumb-slate-700">
        {history.map((div, i) => (
          <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-800/20 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-500 group-hover:border-emerald-500/30 transition-colors">
                <TrendingUp size={14} />
              </div>
              <div>
                <p className="font-bold text-slate-200 text-sm">{div.ticker}</p>
                <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                  PAGO EM: {new Date(div.date).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-emerald-400 font-mono font-bold text-sm">
                {isHidden ? '••••••' : formatMoney(div.total)}
              </p>
              <p className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter">Liquidado</p>
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé informativo discreto */}
      <div className="p-3 bg-slate-900/30 border-t border-slate-800 text-center">
        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
          Histórico de Recebimentos Reais
        </p>
      </div>
    </div>
  );
};
