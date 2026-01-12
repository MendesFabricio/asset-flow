'use client';
import { useState, useEffect } from 'react';
import { Plus, CheckCircle, User, Calendar, CheckSquare, Pencil, Trash2, X, Wallet } from 'lucide-react';
import { formatMoney } from '../utils';

const getMonthName = (offset: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

export const ReceivablesTab = () => {
    const [items, setItems] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loadingPay, setLoadingPay] = useState(false);

    // Form States
    const [editingId, setEditingId] = useState<number | null>(null);
    const [desc, setDesc] = useState('');
    const [val, setVal] = useState('');
    const [parc, setParc] = useState('1');
    const [who, setWho] = useState('');

    const fetchItems = async () => {
        const res = await fetch('http://localhost:5328/api/finance/receivables');
        const data = await res.json();
        setItems(data);
    };

    useEffect(() => { fetchItems(); }, []);

    // 👇 CÁLCULO DO TOTAL GERAL A RECEBER
    // Soma: (Parcelas Restantes * Valor da Parcela) de todos os itens
    const totalGeneral = items.reduce((acc, item) => {
        const parcelasRestantes = item.total_parcelas - item.parcela_atual + 1;
        // Evita somar negativos caso algo estranho aconteça no banco
        const valorRestante = parcelasRestantes > 0 ? parcelasRestantes * item.valor_parcela : 0;
        return acc + valorRestante;
    }, 0);

    const openNewModal = () => {
        setEditingId(null);
        setDesc(''); setVal(''); setParc('1'); setWho('');
        setIsModalOpen(true);
    };

    const handleEdit = (item: any) => {
        setEditingId(item.id);
        setDesc(item.descricao);
        setVal(item.valor_total.toString());
        setParc(item.total_parcelas.toString());
        setWho(item.devedor);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!desc || !val || !who) {
            alert("Preencha a descrição, valor e quem deve.");
            return;
        }

        const payload = {
            descricao: desc,
            valor: val,
            parcelas: parc || 1,
            devedor: who,
            dia: 10
        };

        if (editingId) {
            await fetch(`http://localhost:5328/api/finance/receivables/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            await fetch('http://localhost:5328/api/finance/receivables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        setIsModalOpen(false);
        fetchItems();
    };

    const handleDelete = async () => {
        if (!editingId) return;
        if (!confirm("Tem certeza que deseja excluir este registro permanentemente?")) return;

        await fetch(`http://localhost:5328/api/finance/receivables/${editingId}`, {
            method: 'DELETE'
        });
        setIsModalOpen(false);
        fetchItems();
    };

    const handlePay = async (id: number) => {
        if (!confirm("Confirmar recebimento?")) return;
        await fetch(`http://localhost:5328/api/finance/receivables/${id}/pay`, { method: 'POST' });
        fetchItems();
    };

    const handlePayBatch = async (ids: number[], monthName: string) => {
        if (!confirm(`Confirmar recebimento de TODOS (${ids.length}) em ${monthName}?`)) return;
        setLoadingPay(true);
        await fetch(`http://localhost:5328/api/finance/receivables/pay-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        setLoadingPay(false);
        fetchItems();
    };

    const monthsData = Array.from({ length: 6 }, (_, offset) => {
        const monthTitle = getMonthName(offset);
        const monthItems = items.filter(item => {
            const projectedParcel = item.parcela_atual + offset;
            return projectedParcel <= item.total_parcelas;
        }).map(item => ({
            ...item,
            parcela_visual: item.parcela_atual + offset,
            valor: item.valor_parcela
        }));

        const totalMonth = monthItems.reduce((acc, i) => acc + i.valor, 0);

        return {
            title: monthTitle,
            items: monthItems,
            total: totalMonth,
            isCurrentMonth: offset === 0
        };
    });

    return (
        <div className="space-y-6 animate-in fade-in pb-10">
            {/* Header com Total Geral */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800 gap-4">

                {/* Lado Esquerdo: Título e KPI Total */}
                <div className="flex items-center gap-6 w-full md:w-auto">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Calendar className="text-blue-500" /> Fluxo de Recebimentos
                    </h2>

                    {/* Divisor Vertical (só desktop) */}
                    <div className="hidden md:block h-8 w-px bg-slate-700"></div>

                    {/* KPI Total a Receber */}
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 uppercase font-bold leading-none mb-1">Total a Receber</span>
                        <div className="flex items-center gap-2 text-emerald-400">
                            <Wallet size={16} />
                            <span className="text-lg font-bold font-mono leading-none">{formatMoney(totalGeneral)}</span>
                        </div>
                    </div>
                </div>

                {/* Botão Novo */}
                <button onClick={openNewModal} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-blue-900/20 transition-all">
                    <Plus size={16} /> Novo
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthsData.map((month, idx) => (
                    <div key={idx} className={`rounded-xl border flex flex-col h-full max-h-[400px] ${month.isCurrentMonth ? 'bg-slate-900 border-blue-500/50' : 'bg-slate-900/50 border-slate-800 opacity-80 hover:opacity-100 transition-opacity'}`}>
                        <div className="p-4 border-b border-slate-800 flex justify-between items-start bg-slate-950/30 rounded-t-xl">
                            <div>
                                <p className={`text-xs uppercase font-bold mb-1 ${month.isCurrentMonth ? 'text-blue-400' : 'text-slate-500'}`}>{month.title}</p>
                                <h3 className="text-xl font-bold text-emerald-400">{formatMoney(month.total)}</h3>
                            </div>
                            {month.isCurrentMonth && month.items.length > 0 && (
                                <button onClick={() => handlePayBatch(month.items.map((i: any) => i.id), month.title)} disabled={loadingPay} className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1.5 rounded flex items-center gap-1 transition-colors font-bold">
                                    <CheckSquare size={14} /> Receber Tudo
                                </button>
                            )}
                        </div>

                        <div className="p-2 flex-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                            {month.items.length > 0 ? (
                                month.items.map((item: any) => (
                                    <div key={item.id} className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex justify-between items-center group hover:border-slate-700 transition-all">

                                        <div className="flex-1 pr-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-slate-200 truncate">{item.descricao}</p>
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all p-1 rounded-md hover:bg-slate-800"
                                                    title="Editar"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </div>

                                            <div className="flex gap-2 mt-1.5">
                                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1 font-medium">
                                                    <User size={10} /> {item.devedor}
                                                </span>
                                                <span className="text-[10px] bg-slate-800/80 text-blue-400 px-1.5 py-0.5 rounded border border-slate-700/80 font-bold tabular-nums">
                                                    {item.parcela_visual}/{item.total_parcelas}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="text-right flex items-center gap-3 shrink-0">
                                            <div>
                                                <p className="text-sm font-bold text-emerald-400 font-mono">{formatMoney(item.valor)}</p>
                                                <p className="text-[10px] text-slate-600 font-medium">Dia {item.dia}</p>
                                            </div>

                                            {month.isCurrentMonth && (
                                                <button onClick={() => handlePay(item.id)} className="text-slate-600 hover:text-emerald-400 transition-colors p-1 rounded-full hover:bg-emerald-500/10" title="Receber agora">
                                                    <CheckCircle size={20} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs py-8 opacity-50 gap-2">
                                    <CheckCircle size={24} className="opacity-50" />
                                    Nada a receber neste mês
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Criar / Editar */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md space-y-5 shadow-2xl animate-in zoom-in-95 relative">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>

                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            {editingId ? <Pencil size={18} className="text-blue-500" /> : <Plus size={18} className="text-blue-500" />}
                            {editingId ? 'Editar Reembolso' : 'Novo Reembolso'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Descrição</label>
                                <input placeholder="Ex: Compra TV Sala" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-medium" value={desc} onChange={e => setDesc(e.target.value)} />
                            </div>

                            <div className="flex gap-3">
                                <div className="w-2/3">
                                    <label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Valor Total (R$)</label>
                                    <input type="number" placeholder="0,00" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-bold text-lg" value={val} onChange={e => setVal(e.target.value)} />
                                </div>
                                <div className="w-1/3">
                                    <label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Parcelas</label>
                                    <input type="number" placeholder="1" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-bold text-lg text-center" value={parc} onChange={e => setParc(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Quem deve?</label>
                                <input placeholder="Ex: Pai, Mãe..." className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-medium" value={who} onChange={e => setWho(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2 border-t border-slate-800/50 mt-4">
                            {editingId && (
                                <button onClick={handleDelete} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-3 rounded-lg font-bold border border-red-500/20 transition-colors flex items-center justify-center gap-2" title="Excluir permanentemente">
                                    <Trash2 size={18} /> <span className="hidden sm:inline">Excluir</span>
                                </button>
                            )}
                            <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2">
                                <CheckCircle size={18} /> {editingId ? 'Salvar Alterações' : 'Criar Reembolso'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
