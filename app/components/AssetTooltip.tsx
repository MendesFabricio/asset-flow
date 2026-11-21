import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '../lib/format';
import { usePrivacy } from '../context/PrivacyContext';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface AssetTooltipProps {
    type: 'rec' | 'fin';
    data: {
        ticker: string;
        score: number;
        motivos: string[];
        criteriosNaoAvaliados?: string[];
        rsi: number;
        variacaoFinanceira: number;
        variacaoPct: number;
        isUSD: boolean;
    };
    style: React.CSSProperties;
}

export const AssetTooltip = ({ type, data, style }: AssetTooltipProps) => {
    const [mounted, setMounted] = useState(false);
    const { isHidden } = usePrivacy();

    useEffect(() => {
        setMounted(true);
    }, []);

    const isPositive = data.variacaoFinanceira >= 0;

    const formattedMoney = isHidden
        ? (data.isUSD ? '$ •••••' : 'R$ •••••')
        : (data.isUSD
            ? `$ ${Math.abs(data.variacaoFinanceira).toFixed(2)}`
            : formatMoney(Math.abs(data.variacaoFinanceira)));

    const getBulletClass = (text: string) => {
        const t = text.toLowerCase();
        if (t.includes('desconto') || t.includes('bola de neve') || t.includes('graham')) return 'bg-status-success';
        if (t.includes('esticado') || t.includes('caro') || t.includes('ágio')) return 'bg-status-error';
        return 'bg-accent';
    };

    if (!mounted) return null;

    const tooltipContent = (
        <div
            className="fixed z-[9999] p-0 bg-surface-card border border-border-subtle rounded-xl shadow-lg text-left pointer-events-none overflow-hidden"
            style={style}
        >
            {type === 'rec' ? (
                <>
                    <div className="bg-surface-elevated px-3 py-2.5 border-b border-border-subtle flex justify-between items-center">
                        <span className="text-2xs font-semibold text-text-primary flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                            Análise {data.ticker}
                        </span>
                        <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-md border tabular-nums ${data.score >= 70 ? 'bg-status-success/10 text-status-success border-status-success/20' : 'bg-surface-input text-text-muted border-border-subtle'}`}>
                            SCORE: {data.score}
                        </span>
                    </div>
                    <div className="p-3 space-y-2.5">
                        {data.motivos.length > 0 ? data.motivos.map((m, i) => (
                            <div key={i} className="text-2xs text-text-primary flex items-start gap-2 leading-relaxed">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${getBulletClass(m)}`}></span>
                                {m}
                            </div>
                        )) : <span className="text-2xs text-text-muted italic">Apenas rebalanceamento.</span>}
                        {data.criteriosNaoAvaliados && data.criteriosNaoAvaliados.length > 0 && (
                            <div className="pt-1.5 border-t border-border-subtle text-2xs text-text-muted">
                                <span className="font-semibold uppercase tracking-wider text-text-muted block mb-0.5">Sem dados para avaliar:</span>
                                {data.criteriosNaoAvaliados.join(', ')}
                            </div>
                        )}
                    </div>
                    <div className="px-3 pb-3 pt-2 border-t border-border-subtle bg-surface-elevated rounded-b-lg">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-2xs text-text-muted font-semibold tracking-wide uppercase">RSI 14D</span>
                            <span className={`text-2xs font-semibold tabular-nums ${data.rsi < 30 ? 'text-status-success' : data.rsi > 70 ? 'text-status-error' : 'text-accent'}`}>{data.rsi.toFixed(0)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-input rounded-full overflow-hidden flex relative">
                            <div className={`h-full transition-all duration-300 ${data.rsi < 30 ? 'bg-status-success' : data.rsi > 70 ? 'bg-status-error' : 'bg-accent'}`} style={{ width: `${Math.min(data.rsi, 100)}%` }}></div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="relative overflow-hidden bg-surface-card rounded-xl border border-border-subtle shadow-lg">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-status-success' : 'bg-status-error'}`} />
                    <div className="pl-4 pr-3 py-2.5 min-w-[140px]">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex flex-col">
                                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">Resultado Hoje</span>
                                <span className={`text-lg font-mono font-semibold tabular-nums tracking-tight leading-none ${isPositive ? 'text-status-success' : 'text-status-error'}`}>
                                    {isPositive ? '+' : '-'}{formattedMoney}
                                </span>
                            </div>
                            <div className={`p-1.5 rounded-lg ${isPositive ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'}`}>
                                {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(tooltipContent, document.body);
};
