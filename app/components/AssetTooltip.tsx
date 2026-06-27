import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatMoney } from '../utils';

interface AssetTooltipProps {
    type: 'rec' | 'fin';
    data: {
        ticker: string;
        score: number;
        motivos: string[];
        rsi: number;
        variacaoFinanceira: number;
        variacaoPct: number;
        isUSD: boolean;
    };
    style: React.CSSProperties;
}

export const AssetTooltip = ({ type, data, style }: AssetTooltipProps) => {
    const isPositive = data.variacaoFinanceira >= 0;

    const formattedMoney = data.isUSD
        ? `$ ${Math.abs(data.variacaoFinanceira).toFixed(2)}`
        : formatMoney(Math.abs(data.variacaoFinanceira));

    const getBulletClass = (text: string) => {
        const t = text.toLowerCase();
        if (t.includes('desconto') || t.includes('bola de neve') || t.includes('graham')) return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]';
        if (t.includes('esticado') || t.includes('caro') || t.includes('ágio')) return 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]';
        return 'bg-blue-400';
    };

    return (
        <div
            className="absolute z-[9999] p-0 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl text-left pointer-events-none animate-in fade-in zoom-in-95 duration-200"
            style={style}
        >
            {type === 'rec' ? (
                <>
                    <div className="bg-slate-800/80 px-3 py-2 border-b border-slate-700 rounded-t-lg flex justify-between items-center backdrop-blur-sm">
                        <span className="text-[10px] font-bold text-slate-200 flex items-center gap-1">📊 Análise de {data.ticker}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${data.score >= 70 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>Score: {data.score}</span>
                    </div>
                    <div className="p-3 space-y-2.5">
                        {data.motivos.length > 0 ? data.motivos.map((m, i) => (
                            <div key={i} className="text-[10px] text-slate-300 flex items-start gap-2 leading-relaxed">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${getBulletClass(m)}`}></span>
                                {m}
                            </div>
                        )) : <span className="text-[10px] text-slate-500 italic">Apenas rebalanceamento.</span>}
                    </div>
                    <div className="px-3 pb-3 pt-2 border-t border-slate-800/80 bg-slate-800/30 rounded-b-lg">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[9px] text-slate-400 font-bold tracking-wide uppercase">RSI 14D</span>
                            <span className={`text-[9px] font-bold ${data.rsi < 30 ? 'text-emerald-400' : data.rsi > 70 ? 'text-rose-400' : 'text-blue-400'}`}>{data.rsi.toFixed(0)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex relative">
                            <div className={`h-full transition-all duration-1000 ${data.rsi < 30 ? 'bg-emerald-500' : data.rsi > 70 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(data.rsi, 100)}%` }}></div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="relative overflow-hidden bg-slate-900/95 backdrop-blur-xl rounded-lg border border-slate-700/50 shadow-2xl">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div className="pl-4 pr-3 py-2.5 min-w-[140px]">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Resultado Hoje</span>
                                <span className={`text-lg font-mono font-bold tracking-tight leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isPositive ? '+' : '-'}{formattedMoney}
                                </span>
                            </div>
                            <div className={`p-1.5 rounded-lg ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
