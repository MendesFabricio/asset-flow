'use client';
import { useEffect, useState } from 'react';
import { Activity, BarChart3, Bell, RefreshCw, Volume2, VolumeX, Sparkles, FileSpreadsheet } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';
import { apiCall } from '@/lib/api';
import { ModalShell } from '@/components/ModalShell';
import { ValuationPanel } from '@/features/valuation/components/ValuationPanel';
import { usePrivacy } from '@/context/PrivacyContext';
import { useTheme } from '@/context/ThemeContext';

interface AssetDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: Asset | null;
}

export const AssetDetailsModal = ({ isOpen, onClose, asset }: AssetDetailsModalProps) => {
    const [chartLoaded, setChartLoaded] = useState(false);
    const { isHidden } = usePrivacy();
    const { theme } = useTheme();
    const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));

    const [targetPrice, setTargetPrice] = useState('');
    const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
    const [note, setNote] = useState('');
    const [loadingAlert, setLoadingAlert] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Score Explainer States
    const [explanationText, setExplanationText] = useState('');
    const [explaining, setExplaining] = useState(false);
    const [speaking, setSpeaking] = useState(false);

    interface KpiData {
        rendimento_distribuido?: number | string | null;
        valor_patrimonial?: number | string | null;
        vacancia_fisica_pct?: number | string | null;
        vacancia_financeira_pct?: number | string | null;
        receita_liquida?: number | string | null;
        ebitda?: number | string | null;
        lucro_liquido?: number | string | null;
        divida_liquida?: number | string | null;
        observacao_geral?: string | null;
    }

    // RI KPIs States
    const [kpiData, setKpiData] = useState<KpiData | null>(null);
    const [loadingKpi, setLoadingKpi] = useState(false);
    const [kpiError, setKpiError] = useState<string | null>(null);

    // History Tab States removed as they are moved to ManageAssetModal



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
        } catch {
            setStatusMsg({ type: 'error', text: 'Erro ao conectar no servidor.' });
        } finally {
            setLoadingAlert(false);
        }
    };

    const handleExplainScore = () => {
        if (!asset) return;
        setExplaining(true);
        setExplanationText('');
        apiCall<{ status: string; explanation?: string; msg?: string }>(`/api/ai/explain-score/${asset.ticker}`)
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
        apiCall<{ status: string; kpis?: KpiData; msg?: string }>(`/api/ai/analyze-pdf`, {
            method: 'POST',
            body: JSON.stringify({ ticker: asset.ticker })
        })
            .then((res) => {
                if (res.status === 'Sucesso') {
                    setKpiData(res.kpis ?? null);
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
        setChartLoaded(false);
    }, [isOpen, asset?.ticker, theme]);

    if (!isOpen || !asset) return null;

    let tvSymbol = asset.ticker;
    const type = asset.tipo;
    if (type === 'Cripto') {
        tvSymbol = `BINANCE:${asset.ticker.replace('-USD', '')}USDT`;
    } else if (type === 'Ação' || type === 'FII' || asset.ticker.endsWith('.SA')) {
        tvSymbol = `BMFBOVESPA:${asset.ticker.replace('.SA', '')}`;
    } else if (type === 'Internacional') {
        tvSymbol = `NASDAQ:${asset.ticker}`;
    }

    const isLightTheme = theme === 'light';
    const tradingViewConfig = {
        autosize: true,
        symbol: tvSymbol,
        interval: 'D',
        timezone: 'America/Sao_Paulo',
        theme: isLightTheme ? 'light' : 'dark',
        style: '1',
        locale: 'br',
        enable_publishing: false,
        backgroundColor: isLightTheme ? 'rgba(255, 255, 255, 1)' : 'rgba(15, 23, 42, 1)',
        gridColor: isLightTheme ? 'rgba(226, 232, 240, 1)' : 'rgba(30, 41, 59, 1)',
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        calendar: false,
        hide_volume: true,
        support_host: 'https://www.tradingview.com',
    };
    const tradingViewSrc = `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=br#${encodeURIComponent(
        JSON.stringify(tradingViewConfig)
    )}`;

    return (
        <ModalShell
            onClose={onClose}
            title={
                <span className="flex items-center gap-2 text-xl font-semibold">
                    {asset.ticker}
                    <span className="text-xs bg-surface-input text-text-muted px-2 py-0.5 rounded-md border border-border-subtle font-normal">{asset.tipo}</span>
                </span>
            }
            subtitle={
                <span className="flex items-center gap-3 mt-1 text-sm tabular-nums">
                    <span className="text-text-muted">Preço: <strong className="text-text-primary">{money(asset.preco_atual)}</strong></span>
                    <span className={`${(asset.change_percent ?? 0) >= 0 ? 'text-status-success' : 'text-status-error'} font-semibold`}>
                        {(asset.change_percent ?? 0) > 0 ? '+' : ''}{(asset.change_percent ?? 0).toFixed(2)}%
                    </span>
                </span>
            }
            icon={<BarChart3 size={24} />}
            maxWidth="5xl"
            noPadding
        >
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-[70vh]">

                {/* Esquerda: Conteúdo Principal (Gráfico) */}
                <div className="flex-1 flex flex-col relative border-r border-border-subtle bg-surface-card min-h-[440px] lg:min-h-[520px]">
                    {!chartLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center text-text-muted gap-2 text-xs pointer-events-none z-10">
                            <Activity className="animate-spin" size={16} /> Carregando Gráfico...
                        </div>
                    )}
                    <iframe
                        key={`${tvSymbol}-${theme}`}
                        src={tradingViewSrc}
                        title={`Gráfico ${asset.ticker}`}
                        className="w-full h-full min-h-[440px] lg:min-h-[520px] border-0"
                        allowFullScreen
                        onLoad={() => setChartLoaded(true)}
                    />
                </div>

                {/* Direita: Indicadores Rápidos */}
                <div className="w-full lg:w-80 bg-surface-elevated p-6 overflow-y-auto border-l border-border-subtle space-y-6">

                    <div>
                        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Minha Posição</h3>
                        <div className="space-y-3 tabular-nums">
                            <div className="flex justify-between items-center p-3 bg-surface-card rounded-lg border border-border-subtle">
                                <span className="text-sm text-text-muted">Total Investido</span>
                                <span className="text-sm font-semibold text-text-primary">{money(asset.total_investido)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-surface-card rounded-lg border border-border-subtle">
                                <span className="text-sm text-text-muted">Valor Atual</span>
                                <span className="text-sm font-semibold text-text-primary">{money(asset.total_atual)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-surface-card rounded-lg border border-border-subtle">
                                <span className="text-sm text-text-muted">Lucro</span>
                                <span className={`text-sm font-semibold ${asset.lucro_valor >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                    {money(asset.lucro_valor)} ({asset.lucro_pct.toFixed(2)}%)
                                </span>
                            </div>
                        </div>
                    </div>

                    {(asset.tipo === 'Ação' || asset.tipo === 'FII') && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Fundamentos</h3>
                                <div className="grid grid-cols-2 gap-2 tabular-nums">
                                    <div className="p-3 bg-surface-card rounded-lg border border-border-subtle text-center">
                                        <p className="text-2xs text-text-muted uppercase">P/VP</p>
                                        <p className="text-sm font-semibold text-accent">{asset.p_vp ? asset.p_vp.toFixed(2) : '-'}</p>
                                    </div>
                                    <div className="p-3 bg-surface-card rounded-lg border border-border-subtle text-center">
                                        <p className="text-2xs text-text-muted uppercase">DY Est.</p>
                                        <p className="text-sm font-semibold text-status-success">{asset.manual_dy ? (asset.manual_dy * 100).toFixed(2) + '%' : '-'}</p>
                                    </div>
                                    {asset.tipo === 'Ação' && (
                                        <div className="p-3 bg-surface-card rounded-lg border border-border-subtle text-center col-span-2">
                                            <p className="text-2xs text-text-muted uppercase">Margem Graham</p>
                                            <p className={`text-sm font-semibold ${(asset.mg_graham ?? 0) > 0 ? 'text-status-success' : 'text-status-error'}`}>
                                                {asset.mg_graham ? asset.mg_graham.toFixed(1) + '%' : '-'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <ValuationPanel ticker={asset.ticker} assetType={asset.tipo} compact />
                        </div>
                    )}

                    <div>
                        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 font-mono">Definir Alerta de Preço</h3>
                        <form onSubmit={handleCreatePriceAlert} className="space-y-3 bg-surface-card p-4 rounded-xl border border-border-subtle">
                            <div className="flex bg-surface-input p-1 rounded-lg border border-border-subtle gap-1">
                                <button
                                    type="button"
                                    onClick={() => setCondition('ABOVE')}
                                    className={`flex-1 text-2xs uppercase tracking-wider py-1.5 font-semibold rounded-md transition-colors ${condition === 'ABOVE' ? 'bg-status-success text-white' : 'text-text-muted hover:text-text-primary'}`}
                                >
                                    Subir Acima ▲
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCondition('BELOW')}
                                    className={`flex-1 text-2xs uppercase tracking-wider py-1.5 font-semibold rounded-md transition-colors ${condition === 'BELOW' ? 'bg-status-error text-white' : 'text-text-muted hover:text-text-primary'}`}
                                >
                                    Cair Abaixo ▼
                                </button>
                            </div>

                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-xs text-text-muted font-mono">R$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0,00"
                                    value={targetPrice}
                                    onChange={(e) => setTargetPrice(e.target.value)}
                                    className="w-full bg-surface-input border border-border-subtle rounded-lg pl-9 pr-3 py-2 text-xs text-text-primary font-mono tabular-nums placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                                    required
                                />
                            </div>

                            <input
                                type="text"
                                placeholder="Nota / Observação"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full bg-surface-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                            />

                            <button
                                type="submit"
                                disabled={loadingAlert}
                                className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-2xs font-semibold uppercase tracking-wider py-2 rounded-lg transition-colors"
                            >
                                {loadingAlert ? (
                                    <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                    <Bell size={12} />
                                )}
                                Criar Alerta
                            </button>

                            {statusMsg && (
                                <p className={`text-2xs font-semibold text-center mt-2 ${statusMsg.type === 'success' ? 'text-status-success' : 'text-status-error'}`}>
                                    {statusMsg.text}
                                </p>
                            )}
                        </form>
                    </div>

                    {asset.recomendacao && (
                        <div className={`p-4 rounded-xl border flex flex-col gap-2.5 ${asset.recomendacao.includes('COMPRA') ? 'bg-status-success/10 border-status-success/20 text-status-success' : 'bg-surface-card border-border-subtle text-text-primary'}`}>
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70 flex items-center gap-1.5">
                                    <Sparkles size={12} className="text-accent" />
                                    Recomendação IA
                                </h3>
                                <p className="font-semibold text-sm mb-1">{asset.recomendacao}</p>
                                <p className="text-xs opacity-75 leading-relaxed">{asset.motivo}</p>
                            </div>

                            {/* Score Explainer Button & Text */}
                            <div className="border-t border-border-subtle pt-2.5">
                                {explanationText ? (
                                    <div className="space-y-2">
                                        <p className="text-2xs leading-relaxed text-text-primary bg-surface-elevated p-2.5 rounded-lg border border-border-subtle">
                                            {explanationText}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleSpeakExplanation}
                                            className="w-full flex items-center justify-center gap-1.5 bg-surface-input hover:bg-surface-elevated text-text-primary text-2xs font-semibold uppercase tracking-wider py-1.5 rounded-lg transition-colors"
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
                                        className="w-full flex items-center justify-center gap-1.5 bg-accent-soft hover:bg-accent/20 text-accent text-2xs font-semibold uppercase tracking-wider py-1.5 rounded-lg transition-colors border border-accent/20"
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
                        <div className="p-4 rounded-xl bg-surface-card border border-border-subtle flex flex-col gap-2.5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                <FileSpreadsheet size={12} className="text-status-success" />
                                KPIs de Relatório de RI (IA)
                            </h3>

                            {kpiData ? (
                                <div className="space-y-3">
                                    <div className="overflow-x-auto w-full border border-border-subtle rounded-lg">
                                        <table className="w-full text-2xs text-left border-collapse bg-surface-elevated">
                                            <tbody className="divide-y divide-border-subtle text-text-muted tabular-nums">
                                                {asset.tipo === 'FII' ? (
                                                    <>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">Rendimento Distr.:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {typeof kpiData.rendimento_distribuido === 'number'
                                                                    ? formatMoney(kpiData.rendimento_distribuido)
                                                                    : kpiData.rendimento_distribuido || '-'}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">VP da Cota:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {typeof kpiData.valor_patrimonial === 'number'
                                                                    ? formatMoney(kpiData.valor_patrimonial)
                                                                    : kpiData.valor_patrimonial || '-'}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">Vacância Física:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {kpiData.vacancia_fisica_pct != null ? `${kpiData.vacancia_fisica_pct}%` : '-'}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">Vacância Financeira:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {kpiData.vacancia_financeira_pct != null ? `${kpiData.vacancia_financeira_pct}%` : '-'}
                                                            </td>
                                                        </tr>
                                                    </>
                                                ) : (
                                                    <>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">Receita Líquida:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {typeof kpiData.receita_liquida === 'number'
                                                                    ? formatMoney(kpiData.receita_liquida)
                                                                    : kpiData.receita_liquida || '-'}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">EBITDA:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {typeof kpiData.ebitda === 'number'
                                                                    ? formatMoney(kpiData.ebitda)
                                                                    : kpiData.ebitda || '-'}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">Lucro Líquido:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
                                                                {typeof kpiData.lucro_liquido === 'number'
                                                                    ? formatMoney(kpiData.lucro_liquido)
                                                                    : kpiData.lucro_liquido || '-'}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="p-2 text-text-muted">Dívida Líquida:</td>
                                                            <td className="p-2 font-semibold text-text-primary">
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
                                        <p className="text-2xs leading-relaxed text-text-muted bg-surface-elevated p-2 rounded-lg">
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
                                        className="w-full flex items-center justify-center gap-1.5 bg-status-success/15 hover:bg-status-success/25 text-status-success text-2xs font-semibold uppercase tracking-wider py-1.5 rounded-lg transition-colors border border-status-success/20"
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
                                        <p className="text-2xs text-status-error text-center font-semibold">{kpiError}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </ModalShell>
    );
};
