'use client';
import { useState } from 'react';
import { formatMoney } from '../utils';
import { Asset } from '../types';
import { usePrivacy } from '../context/PrivacyContext';
import { PieChart, Pencil, X, Save, AlertCircle, AlertTriangle, TrendingUp, TrendingDown, Ban, CheckCircle2, DollarSign } from 'lucide-react'; // 🧼 Removido 'Lock' que não era usado
import { Card } from './ui/Card';
import { apiCall } from '../utils/apiClient';

// ==========================================
// INTERFACES E TIPAGENS ESTRITAS (NOVAS)
// ==========================================
interface GroupedAsset {
  tipo: string;
  investido: number;
  atual: number;
  variacaoPct: number;
  variacaoValor: number;
}

interface MetaTooltipData {
  item: GroupedAsset;
  meta: number;
  pctAtual: number;
  diff: number;
  visualWidth: number;
}

interface CategorySummaryProps {
  ativos: Asset[];
  categorias?: { name: string; meta: number }[];
  onUpdate: () => void;
}

interface EditingCategory { name: string; }

// ==========================================
// 1. SUB-COMPONENTE: TOOLTIP FINANCEIRO
// ==========================================
const FinanceTooltip = ({ x, y, valor, isPositive }: { x: number, y: number, valor: number, isPositive: boolean }) => (
  <div
    className="fixed z-[110] animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
    style={{ top: y - 50, left: x - 20 }}
  >
    <div className="relative overflow-hidden bg-slate-900/95 backdrop-blur-xl rounded-lg border border-slate-700/50 shadow-2xl min-w-[140px]">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      <div className="pl-3 pr-3 py-2">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <DollarSign size={10} /> Variação Hoje
          </span>
          <span className={`text-sm font-mono font-bold tracking-tight leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : '-'}{formatMoney(Math.abs(valor))}
          </span>
        </div>
      </div>
    </div>
  </div>
);

// ==========================================
// 2. SUB-COMPONENTE: TOOLTIP DE META (PROTEGIDO)
// ==========================================
const MetaAnalysisTooltip = ({ x, y, data }: { x: number, y: number, data: MetaTooltipData }) => (
  <div
    className="fixed z-[100] animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
    style={{ top: y - 10, left: x }}
  >
    <div className="bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-xl p-4 w-64 ring-1 ring-black/50">
      <div className="flex justify-between items-start mb-3">
        <h4 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
          <PieChart size={14} className="text-blue-400" />
          Análise de {data.item.tipo}
        </h4>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${data.meta === 0 ? 'bg-slate-800 border-slate-600 text-slate-400' : data.diff > 2 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : data.diff < -2 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
          {data.meta === 0 ? 'Sem Meta' : data.diff > 2 ? 'Excesso' : data.diff < -2 ? 'Aporte' : 'Neutro'}
        </span>
      </div>

      <div className="space-y-2">
        {data.meta === 0 ? (
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5"><AlertTriangle size={14} className="text-slate-500" /></div>
            <div><p className="text-xs font-bold text-slate-300">Meta não definida</p></div>
          </div>
        ) : (
          <>
            {data.diff > 2 && (
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5"><Ban size={14} className="text-amber-500" /></div>
                <div>
                  <p className="text-xs font-bold text-amber-400">Acima da Meta (+{data.diff.toFixed(1)}%)</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Evite novos aportes ou considere rebalancear.</p>
                </div>
              </div>
            )}
            {data.diff < -2 && (
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5"><TrendingUp size={14} className="text-emerald-500" /></div>
                <div>
                  <p className="text-xs font-bold text-emerald-400">Abaixo da Meta ({data.diff.toFixed(1)}%)</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Oportunidade para novos aportes.</p>
                </div>
              </div>
            )}
            {Math.abs(data.diff) <= 2 && (
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5"><CheckCircle2 size={14} className="text-blue-500" /></div>
                <div>
                  <p className="text-xs font-bold text-blue-400">Dentro da Meta</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Alocação equilibrada.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {data.meta > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="flex justify-between text-[9px] text-slate-500 font-bold uppercase mb-1">
            <span>Conclusão da Meta</span>
            <span>{data.visualWidth.toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${data.diff > 2 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(data.visualWidth, 100)}%` }}></div>
          </div>
        </div>
      )}
    </div>
  </div>
);

// ==========================================
// 3. COMPONENTE PRINCIPAL
// ==========================================
const PrivateValue = ({ value, isHidden, className = "" }: { value: string | number, isHidden: boolean, className?: string }) => (
  <span className={className}>{isHidden ? '••••••' : value}</span>
);

export const CategorySummary = ({ ativos, categorias = [], onUpdate }: CategorySummaryProps) => {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [editingCat, setEditingCat] = useState<EditingCategory | null>(null);
  const [newMeta, setNewMeta] = useState(0);
  const [loading, setLoading] = useState(false);

  // 🛡️ Definido o tipo correto nos estados para eliminar erros de 'any'
  const [hoveredInfo, setHoveredInfo] = useState<{ x: number, y: number, data: MetaTooltipData } | null>(null);
  const [financeTooltip, setFinanceTooltip] = useState<{ x: number, y: number, valor: number, isPositive: boolean } | null>(null);

  const getMaxAllowed = (catName: string) => {
    const otherCatsTotal = categorias.filter(c => c.name !== catName).reduce((acc, c) => acc + c.meta, 0);
    return Math.max(0, 100 - otherCatsTotal);
  };

  if (!ativos || ativos.length === 0) return null;

  // --- LÓGICA DE DADOS ---
  const groups = ativos.reduce((acc: Record<string, GroupedAsset>, asset) => {
    const cat = asset.tipo || 'Outros';
    if (!acc[cat]) acc[cat] = { tipo: cat, investido: 0, atual: 0, variacaoPct: 0, variacaoValor: 0 };
    acc[cat].investido += asset.total_investido;
    acc[cat].atual += asset.total_atual;
    return acc;
  }, {});

  const lista = (Object.values(groups)).map(group => {
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
  }).sort((a, b) => b.atual - a.atual);

  const totalInvestidoGeral = lista.reduce((acc, item) => acc + item.investido, 0);
  const totalAtualGeral = lista.reduce((acc, item) => acc + item.atual, 0);

  const totalMetaConfigurada = lista.reduce((acc, item) => {
    const catInfo = categorias.find(c => c.name === item.tipo);
    return acc + (catInfo ? catInfo.meta : 0);
  }, 0);

  const handleEdit = (catName: string, currentMeta: number) => {
    setEditingCat({ name: catName });
    setNewMeta(currentMeta);
  };

  const handleSave = async () => {
    if (!editingCat) return;
    setLoading(true);
    try {
      await apiCall('/api/update_category_meta', {
        method: 'POST',
        body: JSON.stringify({ category: editingCat.name, meta: Number(newMeta) }),
      });
      setEditingCat(null);
      onUpdate();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar a meta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col h-[525px] overflow-hidden !bg-[#0f172a] !border-slate-800 shadow-2xl p-0 animate-in fade-in duration-500 relative">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between shrink-0">
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
                const isPositiveVar = item.variacaoPct >= 0;

                let visualWidth = 0;
                if (meta > 0) { visualWidth = Math.min((pctAtual / meta) * 100, 100); }
                else if (pctAtual > 0) { visualWidth = 100; }

                let barColor = "bg-blue-600";
                if (pctAtual > meta * 1.15) barColor = "bg-amber-500";
                else if (pctAtual < meta * 0.85) barColor = "bg-emerald-500";

                return (
                  <tr key={item.tipo} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-300">{item.tipo}</span>

                        {Math.abs(item.variacaoPct) > 0.001 && (
                          <div
                            className={`flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded cursor-help transition-all hover:scale-105 ${isPositiveVar
                              ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20'
                              : 'text-rose-400 bg-rose-400/10 border border-rose-400/20'
                              }`}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setFinanceTooltip({
                                x: rect.right,
                                y: rect.top,
                                valor: item.variacaoValor,
                                isPositive: isPositiveVar
                              });
                            }}
                            onMouseLeave={() => setFinanceTooltip(null)}
                          >
                            {isPositiveVar ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {isPositiveVar ? '+' : ''}{item.variacaoPct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right text-slate-500 font-mono align-middle">
                      <PrivateValue value={formatMoney(item.investido)} isHidden={isHidden} />
                    </td>

                    <td className="px-4 py-3 text-right text-white font-mono font-bold align-middle">
                      <PrivateValue value={formatMoney(item.atual)} isHidden={isHidden} />
                    </td>

                    <td className="px-4 py-3 align-middle">
                      <div
                        className="w-full cursor-help py-1"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredInfo({
                            x: rect.right + 10,
                            y: rect.top,
                            data: { item, meta, pctAtual, diff, visualWidth }
                          });
                        }}
                        onMouseLeave={() => setHoveredInfo(null)}
                      >
                        <div className="flex justify-between text-[10px] mb-1.5 font-mono leading-none">
                          <span className="text-slate-200 font-bold">{pctAtual.toFixed(1)}%</span>
                          {meta > 0 && (
                            <span className={diff > 0 ? "text-amber-500 font-bold" : "text-emerald-500 font-bold"}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full ${barColor} transition-all duration-500 shadow-[0_0_10px_rgba(0,0,0,0.3)]`}
                            style={{ width: `${visualWidth}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3 text-right align-middle">
                      <div className="flex items-center justify-end gap-2 h-full">
                        <span className="text-slate-400 font-bold font-mono text-xs block">{meta.toFixed(0)}%</span>
                        <button type="button" onClick={() => handleEdit(item.tipo, meta)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-800 text-slate-600 hover:text-white transition-all -mr-2">
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="py-2 px-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center shrink-0">
          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Patrimônio Atual</p>
            <PrivateValue
              value={formatMoney(totalAtualGeral)}
              isHidden={isHidden}
              className="text-lg font-bold text-emerald-400 font-mono"
            />
          </div>
          <div className="text-right space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Custo Total</p>
            <PrivateValue
              value={formatMoney(totalInvestidoGeral)}
              isHidden={isHidden}
              className="text-sm font-bold text-slate-300 font-mono"
            />
          </div>
        </div>
      </Card>

      {financeTooltip && <FinanceTooltip {...financeTooltip} />}
      {hoveredInfo && <MetaAnalysisTooltip {...hoveredInfo} />}

      {editingCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-sm !bg-slate-900 shadow-2xl p-6 space-y-6 border-slate-700">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white leading-tight">Meta: {editingCat.name}</h3>
              <button type="button" onClick={() => setEditingCat(null)} className="p-1.5 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-end px-1">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ajustar Alocação</span>
                <span className="text-3xl font-bold text-blue-400 font-mono">{newMeta}%</span>
              </div>
              <input type="range" min="0" max={getMaxAllowed(editingCat.name)} step="1" value={newMeta} onChange={(e) => setNewMeta(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 outline-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingCat(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest">Cancelar</button>
              <button type="button" onClick={handleSave} disabled={loading} className="px-6 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 shadow-lg shadow-blue-900/20 uppercase tracking-widest">
                {loading ? 'Salvando...' : <><Save size={14} /> Salvar Meta</>}
              </button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};
