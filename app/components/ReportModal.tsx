'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    FileText, Layers, X, ExternalLink, Calendar,
    TrendingUp, TrendingDown, Activity, ShieldAlert,
    BarChart3, PieChart, Coins
} from 'lucide-react';
import { formatMoney } from '../lib/format';
import { Asset } from '../types'; // 🛡️ Importa a interface unificada de ativos
import { PrivateValue } from './ui/PrivateValue';

function formatCompactMoney(val: number): string {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1_000_000_000) {
        return `${sign}R$ ${(abs / 1_000_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`;
    }
    if (abs >= 1_000_000) {
        return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
    }
    return formatMoney(val);
}

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

const ReportModal = ({ isOpen, onClose, ativo }: ReportModalProps) => {
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'docs' | 'saude'>('docs');
    const [subTab, setSubTab] = useState<'eficiencia' | 'divida' | 'rentabilidade'>('eficiencia');
    const [hoveredBar, setHoveredBar] = useState<number | null>(null);

    useEffect(() => {
        setMounted(true);
        let hasFundamentalist = false;
        try {
            const rawData = (ativo as unknown as { last_report_type?: string })?.last_report_type;
            if (typeof rawData === 'string' && rawData.trim().startsWith('{')) {
                const parsedData = JSON.parse(rawData);
                if (parsedData.fundamentalist !== undefined) {
                    hasFundamentalist = !!parsedData.fundamentalist;
                } else {
                    hasFundamentalist = ativo?.tipo === 'Ação';
                }
            }
        } catch {
            hasFundamentalist = ativo?.tipo === 'Ação';
        }

        setActiveTab(hasFundamentalist ? 'saude' : 'docs');
        return () => {
            setMounted(false);
        };
    }, [isOpen, ativo]);

    if (!isOpen || !ativo || !mounted) return null;

    let reports: ReportItem[] = [];
    let fundamentalist: FundamentalistData | null = null;

    try {
        const extAtivo = ativo as Asset & { last_report_type?: string; last_report_url?: string; last_report_at?: string };

        const rawData = extAtivo.last_report_type;
        if (typeof rawData === 'string' && rawData.trim().startsWith('{')) {
            const parsedData = JSON.parse(rawData);
            if (parsedData.fundamentalist !== undefined || parsedData.reports !== undefined) {
                fundamentalist = parsedData.fundamentalist || null;
                reports = parsedData.reports || [];
            } else {
                if (ativo.tipo === 'Ação') {
                    fundamentalist = parsedData as FundamentalistData;
                } else {
                    reports = Object.values(parsedData) as ReportItem[];
                }
            }
        }
        // Fallback para quando não há JSON, mas há URL
        if (reports.length === 0 && extAtivo.last_report_url) {
            reports = [{
                link: extAtivo.last_report_url,
                date: extAtivo.last_report_at || "Recente",
                type: "Relatório Geral"
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
            case 'caixa': return { border: 'border-status-success/20', bg: 'bg-status-success/5', icon: <Coins size={14} className="text-status-success" /> };
            default: return { border: 'border-border-subtle', bg: 'bg-surface-elevated', icon: <BarChart3 size={14} className="text-text-muted" /> };
        }
    };

    // 🛡️ Mapeamento de abas fortemente tipado para eliminar o 'as any' no clique
    const subTabsMenu: Array<{ id: 'eficiencia' | 'divida' | 'rentabilidade'; label: string; icon: React.ReactNode }> = [
        { id: 'eficiencia', label: 'Eficiência', icon: <BarChart3 size={12} /> },
        { id: 'divida', label: 'Dívida & Caixa', icon: <ShieldAlert size={12} /> },
        { id: 'rentabilidade', label: 'Rentabilidade', icon: <PieChart size={12} /> }
    ];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-[120ms]">
            <div className="bg-surface-card w-full max-w-md rounded-xl border border-border-subtle shadow-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-[120ms]">

                {/* HEADER */}
                <div className="flex justify-between items-center p-4 border-b border-border-subtle bg-surface-elevated">
                    <div className="flex items-center gap-3">
                        <div className="bg-accent-soft p-2 rounded-lg border border-accent/30">
                            <Layers size={18} className="text-accent" />
                        </div>
                        <div>
                            <h3 className="text-text-primary font-semibold text-sm tracking-tight">{ativo.ticker}</h3>
                            <p className="text-2xs text-text-muted uppercase font-semibold tracking-wider">Terminal Fundamentalista</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-surface-input rounded-lg text-text-muted hover:text-text-primary transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* ABAS PRINCIPAIS */}
                <div className="flex p-1 bg-surface-elevated border-b border-border-subtle">
                    <button type="button" onClick={() => setActiveTab('saude')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-2xs font-semibold uppercase transition-colors rounded-md ${activeTab === 'saude' ? 'bg-surface-card text-accent shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
                        <Activity size={14} /> Saúde e Risco
                    </button>
                    <button type="button" onClick={() => setActiveTab('docs')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-2xs font-semibold uppercase transition-colors rounded-md ${activeTab === 'docs' ? 'bg-surface-card text-accent shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
                        <FileText size={14} /> Documentos
                    </button>
                </div>

                {/* CONTEÚDO */}
                <div className="p-4 overflow-y-auto space-y-4 custom-scrollbar flex-1">
                    {activeTab === 'saude' && (
                        <div className="space-y-6">

                            {/* SUB-ABAS (PILLS) strongly typed */}
                            <div className="flex gap-1 p-1 bg-surface-elevated rounded-lg border border-border-subtle">
                                {subTabsMenu.map((tab) => (
                                    <button
                                        type="button"
                                        key={tab.id}
                                        onClick={() => setSubTab(tab.id)}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-2xs font-semibold uppercase transition-colors rounded-md border ${subTab === tab.id
                                            ? 'bg-accent-soft border-accent/40 text-accent'
                                            : 'border-transparent text-text-muted hover:text-text-primary'
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
                                                    <div key={i} className={`${style.bg} border ${style.border} p-4 rounded-xl flex justify-between items-center group transition-colors`}>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                {style.icon}
                                                                <p className="text-2xs text-text-muted uppercase font-semibold tracking-wider">{card.titulo}</p>
                                                            </div>
                                                            <p className="text-sm text-text-primary font-semibold font-mono tabular-nums" title={card.valor !== undefined ? formatMoney(card.valor) : undefined}>
                                                                <PrivateValue
                                                                    value={card.valor_formatado || formatCompactMoney(card.valor || 0)}
                                                                />
                                                            </p>
                                                            {card.subtitulo && <p className="text-2xs text-text-muted font-medium italic">{card.subtitulo}</p>}
                                                        </div>

                                                        <div className="text-right flex flex-col gap-1 tabular-nums">
                                                            {card.yoy !== undefined && (
                                                                <div className={`flex items-center justify-end gap-1 text-2xs font-semibold ${card.yoy >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                                                    {card.yoy > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                                    {card.yoy > 0 ? '+' : ''}{card.yoy}% <span className="text-2xs opacity-60 font-normal">YoY</span>
                                                                </div>
                                                            )}
                                                            {card.qoq !== undefined && (
                                                                <div className={`flex items-center justify-end gap-1 text-2xs font-semibold ${card.qoq >= 0 ? 'text-accent' : 'text-status-warning'}`}>
                                                                    {card.qoq > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                                    {card.qoq > 0 ? '+' : ''}{card.qoq}% <span className="text-2xs opacity-60 font-normal">QoQ</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="py-12 text-center text-text-muted text-2xs uppercase font-semibold tracking-wider border border-dashed border-border-subtle rounded-xl">
                                                Nenhum indicador nesta categoria
                                            </div>
                                        )}
                                    </div>

                                    {/* GRÁFICO: QUALIDADE DO LUCRO */}
                                    {subTab === 'divida' && fundamentalist.evolucao_grafico.length > 0 && (
                                        <div className="bg-surface-elevated border border-border-subtle p-5 rounded-xl space-y-6 relative">
                                            <div className="flex justify-between items-center">
                                                <div className="space-y-0.5">
                                                    <p className="text-2xs text-text-muted uppercase font-semibold tracking-wider">Qualidade do Lucro</p>
                                                    <p className="text-2xs text-text-muted italic">Comparativo Lucro Líquido vs FCO</p>
                                                </div>
                                                <div className="flex gap-3 bg-surface-card p-1.5 rounded-md border border-border-subtle">
                                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-accent rounded-sm"></div><span className="text-2xs text-text-primary font-semibold uppercase">Lucro</span></div>
                                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-cyan-400 rounded-sm"></div><span className="text-2xs text-text-primary font-semibold uppercase">FCO</span></div>
                                                </div>
                                            </div>

                                            <div className="h-40 flex items-end justify-around gap-2 px-2 pb-8 pt-4 border-b border-border-subtle relative">
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
                                                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-surface-card border border-accent/30 p-2.5 rounded-xl shadow-lg z-30 min-w-[130px] pointer-events-none">
                                                                    <p className="text-2xs text-text-muted font-semibold uppercase mb-1 border-b border-border-subtle pb-1">{item.label}</p>
                                                                    <div className="space-y-1 tabular-nums">
                                                                        <div className="flex justify-between items-center gap-4">
                                                                            <span className="text-2xs text-accent font-semibold">LUCRO:</span>
                                                                            <span className="text-2xs text-text-primary font-mono text-right">{formatCompactMoney(item.lucro)}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center gap-4">
                                                                            <span className="text-2xs text-cyan-400 font-semibold">FCO:</span>
                                                                            <span className="text-2xs text-text-primary font-mono text-right">{formatCompactMoney(item.fco || 0)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="w-full flex items-end justify-center gap-1.5 h-full mb-1">
                                                                <div
                                                                    style={{ height: `${lucroHeight}%` }}
                                                                    className={`w-3 rounded-t-[2px] transition-colors duration-150 ${item.lucro < 0 ? 'bg-status-error' : 'bg-accent/50 group-hover:bg-accent'}`}
                                                                />
                                                                <div
                                                                    style={{ height: `${fcoHeight}%` }}
                                                                    className={`w-3 rounded-t-[2px] transition-colors duration-150 ${(item.fco || 0) < 0 ? 'bg-status-warning' : 'bg-cyan-400/50 group-hover:bg-cyan-400'}`}
                                                                />
                                                            </div>

                                                            <div className="absolute -bottom-6 flex flex-col items-center">
                                                                <span className="text-2xs text-text-muted font-semibold tracking-tighter">{item.label}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-surface-elevated border border-border-subtle p-3 rounded-lg">
                                        <p className="text-2xs text-text-muted font-semibold text-center uppercase tracking-wider">
                                            Fonte: Dados Oficiais CVM · Ref: {fundamentalist.ticker_info.ultimo_periodo}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center space-y-3">
                                    <Activity size={32} className="text-text-muted mx-auto opacity-40" />
                                    <p className="text-xs text-text-muted italic px-4 text-center">Nenhum dado disponível.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'docs' && (
                        <div className="space-y-3">
                            {reports.length > 0 ? reports.map((doc: ReportItem, i: number) => ( // 🧼 Tipado como ReportItem
                                <div key={i} className="bg-surface-elevated border border-border-subtle p-4 rounded-xl space-y-3">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-2xs text-accent font-semibold uppercase tracking-wider">
                                            {(doc.type || "").toLowerCase().includes('gerencial') ? 'Relatório Principal' : 'Documento Oficial'}
                                        </span>
                                        <div className="flex items-start gap-3">
                                            <Calendar size={14} className="text-accent mt-0.5" />
                                            <div>
                                                <p className="text-2xs text-text-muted uppercase font-semibold">Referência</p>
                                                <p className="text-xs text-text-primary font-medium">{doc.date || 'Recente'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {typeof doc.link === 'string' && (
                                        <a href={doc.link} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-surface-input hover:bg-accent text-text-primary hover:text-white py-2 rounded-lg font-semibold text-2xs uppercase transition-colors">
                                            Abrir no Navegador <ExternalLink size={12} />
                                        </a>
                                    )}
                                </div>
                            )) : (
                                <div className="py-8 text-center text-text-muted text-xs italic">Nenhum documento disponível.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export { ReportModal };
