'use client';
import { useState } from 'react';
import { formatMoney } from '../lib/format';
import { PieChart, AlertCircle } from 'lucide-react';
import { Card } from './ui/Card';
import { PrivateValue } from './ui/PrivateValue';
import { apiCall } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useFloatingTooltip } from '../hooks/useFloatingTooltip';
import { GroupedAsset, MetaTooltipData, FinanceTooltipData, CategorySummaryProps } from './category-summary/types';
import { FinanceTooltip } from './category-summary/FinanceTooltip';
import { MetaAnalysisTooltip } from './category-summary/MetaAnalysisTooltip';
import { CategoryRow } from './category-summary/CategoryRow';
import { MetaEditor } from './category-summary/MetaEditor';

const CATEGORY_ORDER = ['Ação', 'FII', 'Internacional', 'Cripto', 'Renda Fixa', 'Reserva'];

export const CategorySummary = ({ ativos, categorias = [], onUpdate }: CategorySummaryProps) => {
  const { notify } = useToast();
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [newMeta, setNewMeta] = useState(0);
  const [loading, setLoading] = useState(false);

  const { tooltip: hoveredInfo, showTooltip: showMetaTooltip, hideTooltip: hideMetaTooltip } = useFloatingTooltip<MetaTooltipData>();
  const { tooltip: financeTooltip, showTooltip: showFinanceTooltip, hideTooltip: hideFinanceTooltip } = useFloatingTooltip<FinanceTooltipData>();

  const getMaxAllowed = (catName: string) => {
    const otherCatsTotal = categorias.filter(c => c.name !== catName).reduce((acc, c) => acc + c.meta, 0);
    return Math.max(0, 100 - otherCatsTotal);
  };

  const handleEdit = (catName: string, currentMeta: number) => {
    setEditingCat(catName);
    setNewMeta(currentMeta);
  };

  const handleSave = async () => {
    if (!editingCat) return;
    setLoading(true);
    try {
      await apiCall('/api/update_category_meta', {
        method: 'POST',
        body: JSON.stringify({ category: editingCat, meta: Number(newMeta) }),
      });
      setEditingCat(null);
      onUpdate();
    } catch (error) {
      console.error(error);
      notify('Erro ao salvar a meta.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!ativos || ativos.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 h-full !bg-surface-card !border-slate-800 text-center min-h-[400px]">
        <div className="p-3 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-indigo-400 mb-4 animate-pulse">
          <PieChart size={24} />
        </div>
        <h4 className="text-sm font-bold text-white mb-1">Nenhum ativo cadastrado</h4>
        <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
          Sua carteira de investimentos está vazia. Cadastre seus ativos em ações, FIIs ou renda fixa para visualizar a distribuição patrimonial e metas.
        </p>
      </Card>
    );
  }

  // --- LÓGICA DE DADOS ---
  const groups = ativos.reduce((acc: Record<string, GroupedAsset>, asset) => {
    const cat = asset.tipo || 'Outros';
    if (!acc[cat]) acc[cat] = { tipo: cat, investido: 0, atual: 0, variacaoPct: 0, variacaoValor: 0 };
    acc[cat].investido += asset.total_investido;
    acc[cat].atual += asset.total_atual;
    return acc;
  }, {});

  const lista = Object.values(groups).map(group => {
    const assetsInCat = ativos.filter(a => (a.tipo || 'Outros') === group.tipo);

    let totalOntem = 0;
    assetsInCat.forEach(a => {
      const pct = a.change_percent || 0;
      const valOntem = a.total_atual / (1 + (pct / 100));
      totalOntem += valOntem;
    });

    const variacaoValor = group.atual - totalOntem;
    const variacaoPct = totalOntem > 0 ? (variacaoValor / totalOntem) * 100 : 0;

    return { ...group, variacaoPct, variacaoValor };
  }).sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a.tipo);
    const idxB = CATEGORY_ORDER.indexOf(b.tipo);
    const valA = idxA === -1 ? 999 : idxA;
    const valB = idxB === -1 ? 999 : idxB;
    return valA - valB;
  });

  const totalInvestidoGeral = lista.reduce((acc, item) => acc + item.investido, 0);
  const totalAtualGeral = lista.reduce((acc, item) => acc + item.atual, 0);

  const totalMetaConfigurada = lista.reduce((acc, item) => {
    if (item.tipo === 'Reserva') return acc;
    const catInfo = categorias.find(c => c.name === item.tipo);
    return acc + (catInfo ? catInfo.meta : 0);
  }, 0);

  return (
    <>
      <Card className="flex flex-col h-[525px] overflow-hidden !bg-surface-card !border-slate-800 shadow-2xl p-0 animate-in fade-in duration-500 relative">
        <div className="p-4 border-b border-slate-800 bg-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <PieChart size={16} className="text-blue-400" />
            </div>
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest leading-none">Consolidação</h3>
          </div>
          {totalMetaConfigurada !== 100 && (
            <div className="flex items-center gap-1.5 text-amber-500/80 animate-pulse">
              <AlertCircle size={12} />
              <span className="text-[9px] font-bold uppercase tracking-tight">Metas: {totalMetaConfigurada}%</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-900/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-3 text-left w-[180px]">Classe</th>
                <th className="px-4 py-3 text-right w-[150px]">Investido</th>
                <th className="px-4 py-3 text-right w-[150px] text-white">Atual</th>
                <th className="px-4 py-3 text-left w-[140px] text-blue-400">% vs Meta</th>
                <th className="px-6 py-3 text-center w-24">Meta</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/30">
              {lista.map((item) => {
                const pctAtual = totalAtualGeral > 0 ? (item.atual / totalAtualGeral) * 100 : 0;
                const catInfo = categorias.find(c => c.name === item.tipo);
                const meta = catInfo ? catInfo.meta : 0;
                const diff = pctAtual - meta;

                let visualWidth = 0;
                if (meta > 0) visualWidth = Math.min((pctAtual / meta) * 100, 100);
                else if (pctAtual > 0) visualWidth = 100;

                return (
                  <CategoryRow
                    key={item.tipo}
                    item={item}
                    meta={meta}
                    pctAtual={pctAtual}
                    diff={diff}
                    visualWidth={visualWidth}
                    onEdit={handleEdit}
                    onShowFinance={showFinanceTooltip}
                    onHideFinance={hideFinanceTooltip}
                    onShowMeta={showMetaTooltip}
                    onHideMeta={hideMetaTooltip}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="py-2 px-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center shrink-0">
          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Patrimônio Atual</p>
            <PrivateValue value={formatMoney(totalAtualGeral)} className="text-lg font-bold text-emerald-400 font-mono" />
          </div>
          <div className="text-right space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Custo Total</p>
            <PrivateValue value={formatMoney(totalInvestidoGeral)} className="text-sm font-bold text-slate-300 font-mono" />
          </div>
        </div>
      </Card>

      {financeTooltip && <FinanceTooltip {...financeTooltip} />}
      {hoveredInfo && <MetaAnalysisTooltip {...hoveredInfo} />}

      {editingCat && (
        <MetaEditor
          categoryName={editingCat}
          value={newMeta}
          maxValue={getMaxAllowed(editingCat)}
          loading={loading}
          onChange={setNewMeta}
          onSave={handleSave}
          onClose={() => setEditingCat(null)}
        />
      )}
    </>
  );
};
