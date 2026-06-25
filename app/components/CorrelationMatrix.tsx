'use client';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { API_BASE_URL } from '../config/api';
import { Activity } from 'lucide-react';

const CELL_SIZE = 20;
const GAP_SIZE = 1;
const HEADER_HEIGHT = 30;
const LABEL_MARGIN_BOTTOM = 10;

interface CorrelationPoint {
    x: string;
    y: string;
    value: number;
}

interface CorrelationData {
    labels: string[];
    matrix: CorrelationPoint[];
}

const getColorClass = (val: number, isDiagonal: boolean) => {
    if (isDiagonal) return 'bg-slate-800/80 border-slate-700 text-slate-600';
    if (val >= 0.7) return 'bg-emerald-600 text-white font-bold';
    if (val >= 0.4) return 'bg-emerald-500/80 text-emerald-50';
    if (val >= 0.1) return 'bg-emerald-500/30 text-emerald-200/70';
    if (val > -0.1) return 'bg-slate-800/50 text-slate-500';
    if (val > -0.4) return 'bg-rose-500/30 text-rose-200/70';
    if (val > -0.7) return 'bg-rose-500/80 text-rose-50';
    return 'bg-rose-600 text-white font-bold';
};

const MatrixCell = memo(({ row, col, value, isDiagonal, onEnter, onLeave }: {
    row: string;
    col: string;
    value: number;
    isDiagonal: boolean;
    onEnter: (x: string, y: string, val: number) => void;
    onLeave: () => void;
}) => {
    const colorClass = getColorClass(value, isDiagonal);

    const handleEnter = useCallback(() => {
        onEnter(row, col, value);
    }, [onEnter, row, col, value]);

    return (
        <div
            onMouseEnter={handleEnter}
            onMouseLeave={onLeave}
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
            className={`rounded-[2px] flex items-center justify-center cursor-crosshair transition-transform duration-75 hover:scale-110 hover:z-20 hover:shadow-lg hover:ring-1 ring-white/50 relative ${colorClass}`}
        >
            <span className="text-[7px] font-mono select-none tracking-tighter">

                {isDiagonal ? '1.0' : value.toFixed(1)}
            </span>
        </div>
    );
});
MatrixCell.displayName = 'MatrixCell';

const LoadingState = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 animate-pulse h-96">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-slate-500 text-sm">Calculando geometria...</div>
    </div>
);

const EmptyState = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 flex flex-col items-center gap-3 h-96 justify-center">
        <Activity size={32} className="text-slate-700" />
        <p>Dados insuficientes.</p>
    </div>
);

const CorrelationMatrix = () => {
    const [data, setData] = useState<CorrelationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState<CorrelationPoint | null>(null);

    useEffect(() => {
        // ⚡ BLINDAGEM DE MEMÓRIA: Injetado o AbortController nativo do ecossistema JS
        const controller = new AbortController();

        fetch(`${API_BASE_URL}/api/correlation`, { signal: controller.signal })
            .then(res => res.json())
            .then(res => {
                // Seta estados somente se a requisição não tiver sido abortada pelo unmount
                if (!controller.signal.aborted && res.status === 'Sucesso') {
                    setData(res);
                    setLoading(false);
                }
            })
            .catch(err => {
                // Ignora o log se for o cancelamento intencional do Next.js
                if (err.name !== 'AbortError') {
                    console.error("Erro Correlation:", err);
                    if (!controller.signal.aborted) setLoading(false);
                }
            });

        // Retorno de cleanup: Desmontou a tela, mata a busca de rede em background na hora
        return () => controller.abort();
    }, []);

    const matrixMap = useMemo(() => {
        if (!data) return {};
        const map: Record<string, Record<string, number>> = {};
        for (const { x, y, value } of data.matrix) {
            if (!map[x]) map[x] = {};
            map[x][y] = value;
        }
        return map;
    }, [data]);

    const handleEnter = useCallback((x: string, y: string, value: number) => {
        setHovered({ x, y, value });
    }, []);

    const handleLeave = useCallback(() => {
        setHovered(null);
    }, []);

    if (loading) return <LoadingState />;
    if (!data || data.labels.length < 2) return <EmptyState />;

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: `repeat(${data.labels.length}, ${CELL_SIZE}px)`,
        gap: `${GAP_SIZE}px`,
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden min-h-[500px]">

            <div className="flex justify-between items-start mb-0 h-14">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-500/20 p-2 rounded-lg border border-purple-500/30">
                        <Activity size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">Matriz de Correlação</h3>
                        <p className="text-xs text-slate-500">Histórico de 1 ano • Pearson (r)</p>
                    </div>
                </div>
            </div>

            <div className="overflow-auto custom-scrollbar pb-2 pr-2">
                <div className="inline-block">
                    <div className="flex">

                        {/* EIXO Y (Sticky Left) */}
                        <div className="flex flex-col mr-2 sticky left-0 bg-slate-900/95 backdrop-blur z-20 shadow-[2px_0_10px_rgba(0,0,0,0.3)]"
                            style={{ paddingTop: HEADER_HEIGHT + LABEL_MARGIN_BOTTOM, gap: GAP_SIZE }}>
                            {data.labels.map((label) => (
                                <div
                                    key={label}
                                    style={{ height: CELL_SIZE }}
                                    className="flex items-center justify-end pr-2"
                                >
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                        {String(label).substring(0, 6)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div>
                            {/* EIXO X (Sticky Top) */}
                            <div className="sticky top-0 bg-slate-900/95 backdrop-blur z-10"
                                style={{
                                    ...gridStyle,
                                    height: HEADER_HEIGHT,
                                    alignItems: 'end',
                                    marginBottom: LABEL_MARGIN_BOTTOM
                                }}>
                                {data.labels.map((label) => (
                                    <div key={label} style={{ width: CELL_SIZE }} className="relative h-full group">
                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 flex justify-center origin-bottom -rotate-45 pointer-events-none">
                                            <span className="text-[8px] font-bold text-slate-400 uppercase whitespace-nowrap">
                                                {String(label).substring(0, 6)}
                                            </span>
                                        </div>
                                        <div
                                            className="absolute left-1/2 w-px bg-slate-700/40 group-hover:bg-slate-500 transition-colors -translate-x-1/2"
                                            style={{
                                                bottom: `-${LABEL_MARGIN_BOTTOM}px`,
                                                height: `${LABEL_MARGIN_BOTTOM + 8}px`
                                            }}
                                        ></div>
                                    </div>
                                ))}
                            </div>

                            {/* CORPO DA MATRIZ */}
                            <div className="bg-slate-800/50 p-[1px] rounded-sm" style={gridStyle}>
                                {data.labels.map((row) => (
                                    data.labels.map((col) => {
                                        const isDiagonal = row === col;
                                        const value = isDiagonal ? 1 : (matrixMap[row]?.[col] ?? 0);
                                        return (
                                            <MatrixCell
                                                key={`${row}-${col}`}
                                                row={row}
                                                col={col}
                                                value={value}
                                                isDiagonal={isDiagonal}
                                                onEnter={handleEnter}
                                                onLeave={handleLeave}
                                            />
                                        );
                                    })
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-4 text-[10px] text-slate-500 font-medium">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div>Sincronizado</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-slate-800/80 border border-slate-700 rounded-sm"></div>Neutro</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-600 rounded-sm"></div>Hedge</div>
            </div>

            {/* TOOLTIP FLUTUANTE (FIXED HUD) */}
            {hovered && (
                <div className="fixed top-24 right-6 z-50 pointer-events-none animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-4 bg-slate-800/95 backdrop-blur-md px-5 py-3 rounded-xl border border-slate-600/50 shadow-2xl pointer-events-auto ring-1 ring-white/10">
                        <div className="text-right">
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Correlação</div>
                            <div className={`text-2xl font-bold font-mono leading-none ${hovered.value > 0.3 ? 'text-emerald-400' : hovered.value < -0.3 ? 'text-rose-400' : 'text-slate-200'}`}>
                                {hovered.value.toFixed(2)}
                            </div>
                        </div>
                        <div className="h-8 w-px bg-slate-600/50"></div>
                        <div className="flex flex-col justify-center gap-0.5">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="font-bold text-white bg-slate-700/80 px-1.5 py-0.5 rounded shadow-sm border border-slate-600">{hovered.x}</span>
                                <span className="text-slate-500 text-[9px] uppercase font-bold">vs</span>
                                <span className="font-bold text-white bg-slate-700/80 px-1.5 py-0.5 rounded shadow-sm border border-slate-600">{hovered.y}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                                {Math.abs(hovered.value) >= 0.7
                                    ? (hovered.value > 0 ? 'Forte Sincronia 🔗' : 'Hedge Forte 🛡️')
                                    : (Math.abs(hovered.value) < 0.3 ? 'Não Correlacionados 🤷' : 'Correlação Moderada')}
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default CorrelationMatrix;
