'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Activity, BarChart3, Bell, RefreshCw } from 'lucide-react'; // 🧼 Removidos TrendingUp e DollarSign que não eram usados
import { formatMoney } from '../utils';
import { Asset } from '../types'; // 🌟 Importa a interface unificada de ativos

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5328";

interface AssetDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: Asset | null; // 🛡️ Substituído 'any' por tipo estrito e seguro
}

export const AssetDetailsModal = ({ isOpen, onClose, asset }: AssetDetailsModalProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [targetPrice, setTargetPrice] = useState('');
    const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
    const [note, setNote] = useState('');
    const [loadingAlert, setLoadingAlert] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Limpa mensagem de status quando o modal é aberto ou fechado
    useEffect(() => {
        if (isOpen) {
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
            const res = await fetch(`${API_BASE}/api/price-alerts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ticker: asset.ticker,
                    target_price: parseFloat(targetPrice),
                    condition: condition,
                    note: note,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.status === 'Sucesso') {
                    setStatusMsg({ type: 'success', text: 'Alerta criado com sucesso!' });
                    setTargetPrice('');
                    setNote('');
                } else {
                    setStatusMsg({ type: 'error', text: data.message || 'Erro ao criar alerta.' });
                }
            } else {
                setStatusMsg({ type: 'error', text: 'Erro de comunicação com o servidor.' });
            }
        } catch (err) {
            setStatusMsg({ type: 'error', text: 'Erro ao conectar no servidor.' });
        } finally {
            setLoadingAlert(false);
        }
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
                            <form onSubmit={handleCreatePriceAlert} className="space-y-3 bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setCondition('ABOVE')}
                                        className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 font-black rounded-md transition-all ${condition === 'ABOVE' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Subir Acima ▲
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCondition('BELOW')}
                                        className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 font-black rounded-md transition-all ${condition === 'BELOW' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
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
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all"
                                        required
                                    />
                                </div>

                                <input
                                    type="text"
                                    placeholder="Nota / Observação"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all"
                                />

                                <button
                                    type="submit"
                                    disabled={loadingAlert}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white text-[11px] font-bold uppercase tracking-wider py-2 rounded-lg transition-all"
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
                            <div className={`p-4 rounded-lg border ${asset.recomendacao.includes('COMPRA') ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-yellow-900/20 border-yellow-500/30'}`}>
                                <h3 className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">Recomendação IA</h3>
                                <p className="font-bold text-sm mb-1">{asset.recomendacao}</p>
                                <p className="text-xs opacity-70 leading-relaxed">{asset.motivo}</p>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};
