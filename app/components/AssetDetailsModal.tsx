'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Activity, BarChart3, Bell, RefreshCw, Volume2, VolumeX, Sparkles, FileSpreadsheet } from 'lucide-react';
import { formatMoney } from '../utils';
import { Asset } from '../types';
import { apiCall } from '../utils/apiClient';

interface AssetDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: Asset | null;
}

export const AssetDetailsModal = ({ isOpen, onClose, asset }: AssetDetailsModalProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [targetPrice, setTargetPrice] = useState('');
    const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
    const [note, setNote] = useState('');
    const [loadingAlert, setLoadingAlert] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Score Explainer States
    const [explanationText, setExplanationText] = useState('');
    const [explaining, setExplaining] = useState(false);
    const [speaking, setSpeaking] = useState(false);

    // RI KPIs States
    const [kpiData, setKpiData] = useState<any | null>(null);
    const [loadingKpi, setLoadingKpi] = useState(false);
    const [kpiError, setKpiError] = useState<string | null>(null);

    // Limpa estados de IA e áudio ao fechar
    useEffect(() => {
        if (!isOpen) {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setSpeaking(false);
            setExplanationText('');
            setKpiData(null);
            setKpiError(null);
        } else {
            setStatusMsg(null);
            setTargetPrice('');
            setNote('');
            setCondition('ABOVE');
        }
    }, [isOpen]);

    const handleCreatePriceAlert = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!asset) return;

        setLoadingAlert(true);
        setStatusMsg(null);

        try {
            const data = await apiCall<{ status: string; message?: string }>('/api/price-alerts', {
                method: 'POST',
                body: JSON.stringify({
                    ticker: asset.ticker,
                    target_price: parseFloat(targetPrice),
                    condition: condition,
                    note: note,
                }),
            });

            if (data.status === 'Sucesso') {
                setStatusMsg({ type: 'success', text: 'Alerta criado com sucesso!' });
                setTargetPrice('');
                setNote('');
            } else {
                setStatusMsg({ type: 'error', text: data.message || 'Erro ao criar alerta.' });
            }
        } catch (err) {
            setStatusMsg({ type: 'error', text: 'Erro ao conectar no servidor.' });
        } finally {
            setLoadingAlert(false);
        }
    };

    const handleExplainScore = () => {
        if (!asset) return;
        setExplaining(true);
        setExplanationText('');
        apiCall<any>(`/api/ai/explain-score/${asset.ticker}`)
            .then((res) => {
                if (res.status === 'Sucesso' && res.explanation) {
                    setExplanationText(res.explanation);
                } else {
                    setExplanationText(res.msg || 'Erro ao obter explicação do score.');
                }
            })
            .catch((err) => {
                console.error(err);
                setExplanationText('Falha de conexão com o servidor.');
            })
            .finally(() => setExplaining(false));
    };

    const handleSpeakExplanation = () => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        
        if (speaking) {
            window.speechSynthesis.cancel();
            setSpeaking(false);
            return;
        }
        
        if (!explanationText) return;
        
        const utterance = new SpeechSynthesisUtterance(explanationText);
        utterance.lang = 'pt-BR';
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
    };

    const handleAnalyzeRI = () => {
        if (!asset) return;
        setLoadingKpi(true);
        setKpiError(null);
        apiCall<any>(`/api/ai/analyze-pdf`, {
            method: 'POST',
            body: JSON.stringify({ ticker: asset.ticker })
        })
            .then((res) => {
                if (res.status === 'Sucesso') {
                    setKpiData(res.kpis);
                } else {
                    setKpiError(res.msg || 'Erro ao analisar PDF.');
                }
            })
            .catch((err) => {
                console.error(err);
                setKpiError('Falha ao comunicar com o servidor.');
            })
            .finally(() => setLoadingKpi(false));
    };

    useEffect(() => {
        if (!isOpen || !asset || !containerRef.current) return;

        // 1. Limpa o container antes de criar um novo gráfico
        containerRef.current.innerHTML = '';

        // 2. Define o símbolo correto para o TradingView
        let tvSymbol = asset.ticker;
        const type = asset.tipo;

        if (type === 'Cripto') {
            tvSymbol = `BINANCE:${asset.ticker.replace('-USD', '')}USDT`;
        } else if (asset.ticker.endsWith('.SA')) {
            tvSymbol = `BMFBOVESPA:${asset.ticker.replace('.SA', '')}`;
        } else if (type === 'Internacional') {
            tvSymbol = `NASDAQ:${asset.ticker}`; // Tenta NASDAQ por padrão, ou NYSE
        }

        // 3. Cria o script do Widget
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "autosize": true,
            "symbol": tvSymbol,
            "interval": "D",
            "timezone": "America/Sao_Paulo",
            "theme": "dark",
            "style": "1",
            "locale": "br",
            "enable_publishing": false,
            "backgroundColor": "rgba(15, 23, 42, 1)", // Cor do seu background (slate-900)
            "gridColor": "rgba(30, 41, 59, 1)",
            "hide_top_toolbar": false,
            "hide_legend": false,
            "save_image": false,
            "calendar": false,
            "hide_volume": true,
            "support_host": "https://www.tradingview.com"
        });

        containerRef.current.appendChild(script);
    }, [isOpen, asset]);

    if (!isOpen || !asset) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 w-full max-w-5xl h-[85vh] rounded-xl border border-slate-700 shadow-2xl flex flex-col relative overflow-hidden">

                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600/20 p-2 rounded-lg border border-blue-600/30">
                            <BarChart3 className="text-blue-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                {asset.ticker}
                                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{asset.tipo}</span>
                            </h2>
                            <div className="flex items-center gap-3 text-sm mt-1">
                                <span className="text-slate-400">Preço: <strong className="text-white">{formatMoney(asset.preco_atual)}</strong></span>
                                <span className={`${(asset.change_percent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold`}>
                                    {(asset.change_percent ?? 0) > 0 ? '+' : ''}{(asset.change_percent ?? 0).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Corpo: Gráfico + Dados */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                    {/* Esquerda: Gráfico TradingView */}
                    <div className="flex-1 h-full relative border-r border-slate-800 bg-[#0f172a]" ref={containerRef}>
                        <div className="flex items-center justify-center h-full text-slate-500 gap-2">
                            <Activity className="animate-spin" /> Carregando Gráfico...
                        </div>
                    </div>

                    {/* Direita: Indicadores Rápidos */}
                    <div className="w-full lg:w-80 bg-slate-950/30 p-6 overflow-y-auto border-l border-slate-800 space-y-6">

                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Minha Posição</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-slate-900 rounded-lg border border-slate-800">
                                    <span className="text-sm text-slate-400">Total Investido</span>
                                    <span className="text-sm font-bold text-white">{formatMoney(asset.total_investido)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-900 rounded-lg border border-slate-800">
                                    <span className="text-sm text-slate-400">Valor Atual</span>
                                    <span className="text-sm font-bold text-white">{formatMoney(asset.total_atual)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-900 rounded-lg border border-slate-800">
                                    <span className="text-sm text-slate-400">Lucro</span>
                                    <span className={`text-sm font-bold ${asset.lucro_valor >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatMoney(asset.lucro_valor)} ({asset.lucro_pct.toFixed(2)}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {(asset.tipo === 'Ação' || asset.tipo === 'FII') && (
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Fundamentos</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                        <p className="text-[10px] text-slate-500 uppercase">P/VP</p>
                                        <p className="text-sm font-bold text-blue-400">{asset.p_vp ? asset.p_vp.toFixed(2) : '-'}</p>
                                    </div>
                                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                                        <p className="text-[10px] text-slate-500 uppercase">DY Est.</p>
                                        <p className="text-sm font-bold text-emerald-400">{asset.manual_dy ? (asset.manual_dy * 100).toFixed(2) + '%' : '-'}</p>
                                    </div>
                                    {asset.tipo === 'Ação' && (
                                        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center col-span-2">
                                            <p className="text-[10px] text-slate-500 uppercase">Margem Graham</p>
                                            <p className={`text-sm font-bold ${(asset.mg_graham ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {asset.mg_graham ? asset.mg_graham.toFixed(1) + '%' : '-'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 font-mono">Definir Alerta de Preço</h3>
                            <form onSubmit={handleCreatePriceAlert} className="space-y-3 bg-slate-900/40 p-4 rounded-lg border border-slate-800/80 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCondition('ABOVE')}
                                        className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 font-black rounded-md transition-all duration-300 ${condition === 'ABOVE' ? 'bg-emerald-600/90 text-white border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.25)]' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Subir Acima ▲
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCondition('BELOW')}
                                        className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 font-black rounded-md transition-all duration-300 ${condition === 'BELOW' ? 'bg-rose-600/90 text-white border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.25)]' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Cair Abaixo ▼
                                    </button>
                                </div>

                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0,00"
                                        value={targetPrice}
                                        onChange={(e) => setTargetPrice(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all duration-300"
                                        required
                                    />
                                </div>

                                <input
                                    type="text"
                                    placeholder="Nota / Observação"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all duration-300"
                                />

                                <button
                                    type="submit"
                                    disabled={loadingAlert}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/40 text-white text-[11px] font-bold uppercase tracking-wider py-2 rounded-lg transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    {loadingAlert ? (
                                        <RefreshCw size={12} className="animate-spin" />
                                    ) : (
                                        <Bell size={12} />
                                    )}
                                    Criar Alerta
                                </button>

                                {statusMsg && (
                                    <p className={`text-[10px] font-bold text-center mt-2 ${statusMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {statusMsg.text}
                                    </p>
                                )}
                            </form>
                        </div>

                        {asset.recomendacao && (
                            <div className={`p-4 rounded-lg border flex flex-col gap-2.5 ${asset.recomendacao.includes('COMPRA') ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-300' : 'bg-slate-900/60 border-slate-800 text-slate-300'}`}>
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70 flex items-center gap-1.5">
                                        <Sparkles size={12} className="text-indigo-400" />
                                        Recomendação IA
                                    </h3>
                                    <p className="font-bold text-sm mb-1">{asset.recomendacao}</p>
                                    <p className="text-xs opacity-75 leading-relaxed">{asset.motivo}</p>
                                </div>
                                
                                {/* Score Explainer Button & Text */}
                                <div className="border-t border-slate-800/40 pt-2.5">
                                    {explanationText ? (
                                        <div className="space-y-2">
                                            <p className="text-[11px] leading-relaxed text-slate-300 bg-slate-950/40 p-2.5 rounded border border-slate-900">
                                                {explanationText}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handleSpeakExplanation}
                                                className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded transition"
                                            >
                                                {speaking ? (
                                                    <>
                                                        <VolumeX size={12} /> Parar Racional
                                                    </>
                                                ) : (
                                                    <>
                                                        <Volume2 size={12} /> Ouvir Explicação
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={explaining}
                                            onClick={handleExplainScore}
                                            className="w-full flex items-center justify-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded transition border border-indigo-500/10"
                                        >
                                            {explaining ? (
                                                <>
                                                    <RefreshCw size={10} className="animate-spin" /> Gerando Racional...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles size={11} /> Explicar Score do Ativo
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* RI KPIs Parser Block */}
                        {asset.last_report_url && (
                            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/80 flex flex-col gap-2.5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <FileSpreadsheet size={12} className="text-emerald-500" />
                                    KPIs de Relatório de RI (IA)
                                </h3>

                                {kpiData ? (
                                    <div className="space-y-3">
                                        <div className="overflow-x-auto w-full border border-slate-900 rounded">
                                            <table className="w-full text-[11px] text-left border-collapse bg-slate-950/20">
                                                <tbody className="divide-y divide-slate-900 text-slate-400">
                                                    {asset.tipo === 'FII' ? (
                                                        <>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">Rendimento Distr.:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {typeof kpiData.rendimento_distribuido === 'number' 
                                                                        ? formatMoney(kpiData.rendimento_distribuido) 
                                                                        : kpiData.rendimento_distribuido || '-'}
                                                                </td>
                                                            </tr>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">VP da Cota:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {typeof kpiData.valor_patrimonial === 'number' 
                                                                        ? formatMoney(kpiData.valor_patrimonial) 
                                                                        : kpiData.valor_patrimonial || '-'}
                                                                </td>
                                                            </tr>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">Vacância Física:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {kpiData.vacancia_fisica_pct != null ? `${kpiData.vacancia_fisica_pct}%` : '-'}
                                                                </td>
                                                            </tr>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">Vacância Financeira:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {kpiData.vacancia_financeira_pct != null ? `${kpiData.vacancia_financeira_pct}%` : '-'}
                                                                </td>
                                                            </tr>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">Receita Líquida:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {typeof kpiData.receita_liquida === 'number' 
                                                                        ? formatMoney(kpiData.receita_liquida) 
                                                                        : kpiData.receita_liquida || '-'}
                                                                </td>
                                                            </tr>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">EBITDA:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {typeof kpiData.ebitda === 'number' 
                                                                        ? formatMoney(kpiData.ebitda) 
                                                                        : kpiData.ebitda || '-'}
                                                                </td>
                                                            </tr>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">Lucro Líquido:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {typeof kpiData.lucro_liquido === 'number' 
                                                                        ? formatMoney(kpiData.lucro_liquido) 
                                                                        : kpiData.lucro_liquido || '-'}
                                                                </td>
                                                            </tr>
                                                            <tr className="hover:bg-slate-900/10">
                                                                <td className="p-2 text-slate-500">Dívida Líquida:</td>
                                                                <td className="p-2 font-bold text-slate-300">
                                                                    {typeof kpiData.divida_liquida === 'number' 
                                                                        ? formatMoney(kpiData.divida_liquida) 
                                                                        : kpiData.divida_liquida || '-'}
                                                                </td>
                                                            </tr>
                                                        </>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        {kpiData.observacao_geral && (
                                            <p className="text-[10px] leading-relaxed text-slate-400 bg-slate-950/40 p-2 rounded">
                                                <strong>IA:</strong> {kpiData.observacao_geral}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            disabled={loadingKpi}
                                            onClick={handleAnalyzeRI}
                                            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded transition border border-emerald-500/10"
                                        >
                                            {loadingKpi ? (
                                                <>
                                                    <RefreshCw size={10} className="animate-spin" /> Extraindo KPIs...
                                                </>
                                            ) : (
                                                'Extrair KPIs de RI por IA'
                                            )}
                                        </button>
                                        {kpiError && (
                                            <p className="text-[9px] text-red-400 text-center font-bold">{kpiError}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};
