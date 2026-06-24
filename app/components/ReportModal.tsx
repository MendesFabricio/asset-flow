'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    FileText, Layers, X, ExternalLink, Calendar,
    TrendingUp, TrendingDown, Activity, ShieldAlert,
    BarChart3, PieChart, Coins
} from 'lucide-react';
import { formatMoney } from '../utils';
import { usePrivacy } from '../context/PrivacyContext';
import { Asset } from '../types'; // 🛡️ Importa a interface unificada de ativos

// Interface atualizada para incluir FCL e EBITDA nos tipos
interface FundamentalistData {
    ticker_info: {
        ultimo_periodo: string;
        data_base: string;
    };
    cards_indicadores: Array<{
        titulo: string;
        valor?: number;
        valor_formatado?: string;
        subtitulo?: string;
        yoy?: number;
        qoq?: number;
        status?: 'positivo' | 'negativo';
        tipo?: 'risco' | 'rentabilidade' | 'caixa' | 'eficiencia' | string;
    }>;
    evolucao_grafico: Array<{
        label: string;
        receita: number;
        lucro: number;
        fco?: number;
        fcl?: number; // Suporte para Fluxo de Caixa Livre no futuro
    }>;
}

// 🛡️ Interface estrita para os relatórios individuais
interface ReportItem {
    link?: string;
    date?: string;
    type?: string;
}

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    ativo: Asset | null; // 🛡️ Ativo tipado de forma estrita
}

const PrivateValue = ({ value, isHidden, className = "" }: { value: string | number, isHidden: boolean, className?: string }) => (
    <span className={className}>{isHidden ? '••••••' : value}</span>
);

const ReportModal = ({ isOpen, onClose, ativo }: ReportModalProps) => {
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'docs' | 'saude'>('docs');
    const [subTab, setSubTab] = useState<'eficiencia' | 'divida' | 'rentabilidade'>('eficiencia');
    const [hoveredBar, setHoveredBar] = useState<number | null>(null);
    const { isHidden } = usePrivacy() as { isHidden: boolean }; // 🧼 Removido 'as any'

    useEffect(() => {
        const timer = setTimeout(() => {
            setMounted(true);
            if (ativo?.tipo === 'Ação') setActiveTab('saude');
        }, 0);
        return () => {
            clearTimeout(timer);
            setMounted(false);
        };
    }, [isOpen, ativo]);

    if (!isOpen || !ativo || !mounted) return null;

    let reports: ReportItem[] = []; // 🧼 Substituído 'any[]' por tipo estrito
    let fundamentalist: FundamentalistData | null = (ativo as Asset & { fundamentalist_data?: FundamentalistData }).fundamentalist_data || null;

    try {
        const rawData = ativo.last_report_type;
        if (typeof rawData === 'string' && rawData.trim().startsWith('{')) {
            const parsedData = JSON.parse(rawData);
            if (ativo.tipo === 'Ação') {
                fundamentalist = parsedData as FundamentalistData;
            } else {
                reports = Object.values(parsedData) as ReportItem[];
            }
        }
        // Fallback para quando não há JSON, mas há URL
        if (reports.length === 0 && ativo.last_report_url) {
            reports = [{
                link: ativo.last_report_url,
                date: ativo.last_report_at || "Recente",
                type: (typeof rawData === 'string' && rawData.length > 2) ? rawData : "Relatório Geral"
            }];
        }
    } catch (e) {
        console.error("Erro ao processar dados:", e);
    }

    // Filtro inteligente para distribuir os cards nas sub-abas
    const filteredCards = fundamentalist?.cards_indicadores.filter(card => {
        if (subTab === 'eficiencia') return !card.tipo || card.tipo === 'eficiencia';
        // Agrupa Risco (Dívida) e Caixa (FCO/FCL) na mesma aba para análise conjunta
        if (subTab === 'divida') return card.tipo === 'risco' || card.tipo === 'caixa';
        if (subTab === 'rentabilidade') return card.tipo === 'rentabilidade';
        return true;
    });

    const getIndicatorStyles = (tipo?: string) => {
        switch (tipo) {
            case 'risco': return { border: 'border-orange-500/20', bg: 'bg-orange-500/5', icon: <ShieldAlert size={14} className="text-orange-400" /> };
            case 'rentabilidade': return { border: 'border-purple-500/20', bg: 'bg-purple-500/5', icon: <PieChart size={14} className="text-purple-400" /> };
            case 'caixa': return { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', icon: <Coins size={14} className="text-emerald-400" /> };
            default: return { border: 'border-slate-700', bg: 'bg-slate-800/40', icon: <BarChart3 size={14} className="text-slate-500" /> };
        }
    };

    // 🛡️ Mapeamento de abas fortemente tipado para eliminar o 'as any' no clique
    const subTabsMenu: Array<{ id: 'eficiencia' | 'divida' | 'rentabilidade'; label: string; icon: React.ReactNode }> = [
        { id: 'eficiencia', label: 'Eficiência', icon: <BarChart3 size={12} /> },
        { id: 'divida', label: 'Dívida & Caixa', icon: <ShieldAlert size={12} /> },
        { id: 'rentabilidade', label: 'Rentabilidade', icon: <PieChart size={12} /> }
    ];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0f172a] w-full max-w-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* HEADER */}
                <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600/20 p-2 rounded-lg border border-blue-500/30">
                            <Layers size={18} className="text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm tracking-tight">{ativo.ticker}</h3>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Terminal Fundamentalista</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* ABAS PRINCIPAIS */}
                <div className="flex p-1 bg-slate-900 border-b border-slate-800">
                    <button type="button" onClick={() => setActiveTab('saude')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase transition-all rounded-md ${activeTab === 'saude' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                        <Activity size={14} /> Saúde e Risco
                    </button>
                    <button type="button" onClick={() => setActiveTab('docs')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase transition-all rounded-md ${activeTab === 'docs' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                        <FileText size={14} /> Documentos
                    </button>
                </div>

                {/* CONTEÚDO */}
                <div className="p-4 overflow-y-auto space-y-4 custom-scrollbar flex-1">
                    {activeTab === 'saude' && (
                        <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">

                            {/* SUB-ABAS (PILLS) strongly typed */}
                            <div className="flex gap-1 p-1 bg-slate-900/50 rounded-lg border border-slate-800">
                                {subTabsMenu.map((tab) => (
                                    <button
                                        type="button"
                                        key={tab.id}
                                        onClick={() => setSubTab(tab.id)}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[9px] font-black uppercase transition-all rounded-md border ${subTab === tab.id
                                            ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-300'
                                            }`}
                                    >
                                        {tab.icon} {tab.label}
                                    </button>
                                ))}
                            </div>

                            {fundamentalist ? (
                                <div className="space-y-6">
                                    {/* LISTA DE CARDS */}
                                    <div className="space-y-3">
                                        {filteredCards && filteredCards.length > 0 ? (
                                            filteredCards.map((card, i) => {
                                                const style = getIndicatorStyles(card.tipo);
                                                return (
                                                    <div key={i} className={`${style.bg} border ${style.border} p-4 rounded-xl flex justify-between items-center group hover:border-opacity-50 transition-all`}>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                {style.icon}
                                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{card.titulo}</p>
                                                            </div>
                                                            <p className="text-sm text-slate-100 font-bold font-mono">
                                                                <PrivateValue
                                                                    value={card.valor_formatado || formatMoney(card.valor || 0)}
                                                                    isHidden={isHidden}
                                                                />
                                                            </p>
                                                            {card.subtitulo && <p className="text-[9px] text-slate-500 font-medium italic">{card.subtitulo}</p>}
                                                        </div>

                                                        <div className="text-right flex flex-col gap-1">
                                                            {card.yoy !== undefined && (
                                                                <div className={`flex items-center justify-end gap-1 text-[10px] font-bold ${card.yoy >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    {card.yoy > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                                    {card.yoy > 0 ? '+' : ''}{card.yoy}% <span className="text-[8px] opacity-60 font-normal">YoY</span>
                                                                </div>
                                                            )}
                                                            {card.qoq !== undefined && (
                                                                <div className={`flex items-center justify-end gap-1 text-[10px] font-bold ${card.qoq >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                                                                    {card.qoq > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                                    {card.qoq > 0 ? '+' : ''}{card.qoq}% <span className="text-[8px] opacity-60 font-normal">QoQ</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="py-12 text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest border border-dashed border-slate-800 rounded-xl">
                                                Nenhum indicador nesta categoria
                                            </div>
                                        )}
                                    </div>

                                    {/* GRÁFICO: QUALIDADE DO LUCRO */}
                                    {subTab === 'divida' && fundamentalist.evolucao_grafico.length > 0 && (
                                        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-6 relative animate-in fade-in duration-500">
                                            <div className="flex justify-between items-center">
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Qualidade do Lucro</p>
                                                    <p className="text-[8px] text-slate-500 italic">Comparativo Lucro Líquido vs FCO</p>
                                                </div>
                                                <div className="flex gap-3 bg-slate-800/50 p-1.5 rounded-md border border-slate-700/50">
                                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-blue-500 rounded-sm"></div><span className="text-[8px] text-slate-300 font-bold uppercase">Lucro</span></div>
                                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-cyan-400 rounded-sm"></div><span className="text-[8px] text-slate-300 font-bold uppercase">FCO</span></div>
                                                </div>
                                            </div>

                                            <div className="h-40 flex items-end justify-around gap-2 px-2 pb-8 pt-4 border-b border-slate-800/50 relative">
                                                {fundamentalist.evolucao_grafico.slice(-6).map((item, idx) => {
                                                    const allValues = fundamentalist!.evolucao_grafico.map(e => [Math.abs(e.lucro), Math.abs(e.fco || 0)]).flat();
                                                    const maxVal = Math.max(...allValues, 1);

                                                    const lucroHeight = Math.max((Math.abs(item.lucro) / maxVal) * 100, 4);
                                                    const fcoHeight = Math.max((Math.abs(item.fco || 0) / maxVal) * 100, 4);

                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="flex-1 flex flex-col items-center relative group h-full justify-end"
                                                            onMouseEnter={() => setHoveredBar(idx)}
                                                            onMouseLeave={() => setHoveredBar(null)}
                                                        >
                                                            {hoveredBar === idx && (
                                                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-900 border border-blue-500/30 p-2.5 rounded-lg shadow-2xl z-30 min-w-[130px] pointer-events-none animate-in zoom-in-95 duration-200">
                                                                    <p className="text-[7px] text-slate-500 font-bold uppercase mb-1 border-b border-slate-800 pb-1">{item.label}</p>
                                                                    <div className="space-y-1">
                                                                        <div className="flex justify-between items-center gap-4">
                                                                            <span className="text-[8px] text-blue-400 font-bold">LUCRO:</span>
                                                                            <span className="text-[8px] text-slate-200 font-mono text-right">{formatMoney(item.lucro)}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center gap-4">
                                                                            <span className="text-[8px] text-cyan-400 font-bold">FCO:</span>
                                                                            <span className="text-[8px] text-slate-200 font-mono text-right">{formatMoney(item.fco || 0)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="w-full flex items-end justify-center gap-1.5 h-full mb-1">
                                                                <div
                                                                    style={{ height: `${lucroHeight}%` }}
                                                                    className={`w-3 rounded-t-[2px] transition-all duration-300 ${item.lucro < 0 ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]' : 'bg-blue-500/40 group-hover:bg-blue-500'}`}
                                                                />
                                                                <div
                                                                    style={{ height: `${fcoHeight}%` }}
                                                                    className={`w-3 rounded-t-[2px] transition-all duration-300 ${(item.fco || 0) < 0 ? 'bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.4)]' : 'bg-cyan-400/40 group-hover:bg-cyan-400'}`}
                                                                />
                                                            </div>

                                                            <div className="absolute -bottom-6 flex flex-col items-center">
                                                                <span className="text-[8px] text-slate-500 font-black tracking-tighter">{item.label}</span>
                                                                <div className={`w-1 h-1 rounded-full mt-1 ${idx % 2 === 0 ? 'bg-blue-500/20' : 'bg-transparent'}`}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="flex justify-center items-center pt-2 opacity-50">
                                                <p className="text-[7px] text-slate-500 italic">Passe o mouse nas barras para detalhes</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg">
                                        <p className="text-[9px] text-slate-500 font-bold text-center uppercase tracking-widest">
                                            Fonte: Dados Oficiais CVM • Ref: {fundamentalist.ticker_info.ultimo_periodo}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center space-y-3">
                                    <Activity size={32} className="text-slate-800 mx-auto animate-pulse" />
                                    <p className="text-xs text-slate-500 italic px-4 text-center">Nenhum dado disponível.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'docs' && (
                        <div className="space-y-3 animate-in slide-in-from-left-2 duration-300">
                            {reports.length > 0 ? reports.map((doc: ReportItem, i: number) => ( // 🧼 Tipado como ReportItem
                                <div key={i} className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl space-y-3">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                                            {(doc.type || "").toLowerCase().includes('gerencial') ? '⭐ Relatório Principal' : 'Documento Oficial'}
                                        </span>
                                        <div className="flex items-start gap-3">
                                            <Calendar size={14} className="text-blue-400 mt-0.5" />
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold">Referência</p>
                                                <p className="text-xs text-slate-200 font-medium">{doc.date || 'Recente'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {typeof doc.link === 'string' && (
                                        <a href={doc.link} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-blue-600 text-white py-2 rounded-lg font-bold text-[10px] uppercase transition-all">
                                            Abrir no Navegador <ExternalLink size={12} />
                                        </a>
                                    )}
                                </div>
                            )) : (
                                <div className="py-8 text-center text-slate-500 text-xs italic">Nenhum documento disponível.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ReportModal;
