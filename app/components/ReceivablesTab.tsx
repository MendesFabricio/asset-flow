'use client';
import { useState, useEffect } from 'react';
import { Plus, CheckCircle, User, Calendar, CheckSquare, Pencil, Trash2, X, Wallet, Filter, History, Check } from 'lucide-react';
import { formatMoney } from '../utils';

// 🛡️ Interfaces estritas para tipagem do fluxo de caixa e parcelamentos
interface ReceivableItem {
    id: number;
    descricao: string;
    valor_total: number;
    valor_parcela: number;
    total_parcelas: number;
    parcela_atual: number;
    devedor: string;
    dia: number;
    status: string;
}

interface ProjectedReceivableItem extends ReceivableItem {
    parcela_visual: number;
    valor: number;
    status: string;
    isVisible: boolean;
}

const getMonthName = (offset: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

export const ReceivablesTab = () => {
    // 🧼 Substituído useState<any[]> por tipos estritos
    const [items, setItems] = useState<ReceivableItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loadingPay, setLoadingPay] = useState(false);

    // Filtros
    const [selectedPerson, setSelectedPerson] = useState<string>('Todos');

    // Form
    const [editingId, setEditingId] = useState<number | null>(null);
    const [desc, setDesc] = useState('');
    const [val, setVal] = useState('');
    const [parc, setParc] = useState('1');
    const [who, setWho] = useState('');

    const fetchItems = async () => {
        const res = await fetch('http://localhost:5328/api/finance/receivables');
        const data = await res.json() as ReceivableItem[];
        setTimeout(() => setItems(data), 0);
    };

    useEffect(() => { fetchItems(); }, []);

    // Filtros
    const debtors = ['Todos', ...Array.from(new Set(items.map(i => i.devedor))).sort()];
    const filteredItems = selectedPerson === 'Todos' ? items : items.filter(i => i.devedor === selectedPerson);

    // Total Geral a Receber (Soma apenas o futuro/pendente)
    const totalGeneral = filteredItems.reduce((acc, item) => {
        const parcelasRestantes = Math.max(0, item.total_parcelas - item.parcela_atual + 1);
        return acc + (parcelasRestantes * item.valor_parcela);
    }, 0);

    // CRUD - Tipagem estrita aplicada nas propriedades do item editado
    const openNewModal = () => { setEditingId(null); setDesc(''); setVal(''); setParc('1'); setWho(''); setIsModalOpen(true); };
    const handleEdit = (item: ReceivableItem) => { setEditingId(item.id); setDesc(item.descricao); setVal(item.valor_total.toString()); setParc(item.total_parcelas.toString()); setWho(item.devedor); setIsModalOpen(true); };

    const handleSave = async () => {
        if (!desc || !val || !who) return alert("Preencha todos os campos.");
        const payload = { descricao: desc, valor: val, parcelas: parc || 1, devedor: who, dia: 10 };
        const url = editingId ? `http://localhost:5328/api/finance/receivables/${editingId}` : 'http://localhost:5328/api/finance/receivables';
        await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        setIsModalOpen(false); fetchItems();
    };

    const handleDelete = async () => {
        if (!editingId || !confirm("Excluir permanentemente?")) return;
        await fetch(`http://localhost:5328/api/finance/receivables/${editingId}`, { method: 'DELETE' });
        setIsModalOpen(false); fetchItems();
    };

    const handlePay = async (id: number) => {
        if (!confirm("Confirmar recebimento?")) return;
        await fetch(`http://localhost:5328/api/finance/receivables/${id}/pay`, { method: 'POST' });
        fetchItems();
    };

    const handlePayBatch = async (ids: number[], monthName: string) => {
        if (!confirm(`Receber TODOS em ${monthName}?`)) return;
        setLoadingPay(true);
        await fetch(`http://localhost:5328/api/finance/receivables/pay-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        setLoadingPay(false); fetchItems();
    };

    // --- LÓGICA DE MESES ---
    const monthsData = Array.from({ length: 7 }, (_, i) => {
        const offset = i - 1;
        const monthTitle = getMonthName(offset);

        const monthItems = filteredItems.map((item): ProjectedReceivableItem => {
            const projectedParcel = item.parcela_atual + offset;

            let status = 'future';
            if (projectedParcel < item.parcela_atual) status = 'paid';
            else if (projectedParcel === item.parcela_atual) status = 'pending';

            if (item.status === 'Concluido' && projectedParcel <= item.total_parcelas) {
                status = 'paid';
            }

            return {
                ...item,
                parcela_visual: projectedParcel,
                valor: item.valor_parcela,
                status,
                isVisible: projectedParcel > 0 && projectedParcel <= item.total_parcelas
            };
        }).filter(item => item.isVisible);

        const totalPending = monthItems
            .filter(i => i.status === 'pending' || i.status === 'future')
            .reduce((acc, i) => acc + i.valor, 0);

        const totalPaid = monthItems
            .filter(i => i.status === 'paid')
            .reduce((acc, i) => acc + i.valor, 0);

        return {
            title: monthTitle,
            items: monthItems,
            totalPending,
            totalPaid,
            isCurrentMonth: offset === 0,
            isPast: offset < 0
        };
    });

    return (
        <div className="space-y-6 animate-in fade-in pb-10">
            {/* Header */}
            <div className="flex flex-col gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-6 w-full md:w-auto">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Calendar className="text-blue-500" /> Fluxo de Recebimentos</h2>
                        <div className="hidden md:block h-8 w-px bg-slate-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase font-bold leading-none mb-1">Total a Receber</span>
                            <div className="flex items-center gap-2 text-emerald-400"><Wallet size={16} /><span className="text-lg font-bold font-mono leading-none">{formatMoney(totalGeneral)}</span></div>
                        </div>
                    </div>
                    <button type="button" onClick={openNewModal} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-blue-900/20 transition-all"><Plus size={16} /> Novo</button>
                </div>

                {/* Filtro de Pessoas */}
                {debtors.length > 1 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50 overflow-x-auto pb-2 scrollbar-thin">
                        <div className="flex items-center gap-1 text-slate-500 mr-2 shrink-0"><Filter size={14} /><span className="text-[10px] uppercase font-bold">Filtrar:</span></div>
                        {debtors.map(person => (
                            <button type="button" key={person} onClick={() => setSelectedPerson(person)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${selectedPerson === person ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}>
                                {person !== 'Todos' && <User size={12} />} {person}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {monthsData.map((month, idx) => (
                    <div key={idx} className={`rounded-xl border flex flex-col h-full max-h-[400px] transition-all duration-300 ${month.isCurrentMonth ? 'bg-slate-900 border-blue-500/50 ring-1 ring-blue-500/20 shadow-lg shadow-blue-900/10' : month.isPast ? 'bg-slate-900/30 border-orange-900/20 opacity-90' : 'bg-slate-900/50 border-slate-800 opacity-90'}`}>

                        {/* Cabeçalho do Card */}
                        <div className={`p-4 border-b flex justify-between items-start rounded-t-xl ${month.isCurrentMonth ? 'bg-blue-950/20 border-blue-900/30' : month.isPast ? 'bg-orange-950/10 border-orange-900/20' : 'bg-slate-950/30 border-slate-800'}`}>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    {month.isPast && <History size={12} className="text-orange-400" />}
                                    <p className={`text-xs uppercase font-bold ${month.isCurrentMonth ? 'text-blue-400' : month.isPast ? 'text-orange-400' : 'text-slate-500'}`}>{month.title}</p>
                                </div>

                                <div className="space-y-1">
                                    {month.isPast ? (
                                        <>
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] text-slate-500 uppercase font-bold">Recebido</span>
                                                <span className="text-lg font-bold text-slate-300 font-mono">{formatMoney(month.totalPaid)}</span>
                                            </div>
                                            {month.totalPending > 0 && (
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[10px] text-red-400 uppercase font-bold">Falta</span>
                                                    <span className="text-sm font-bold text-red-400 font-mono">{formatMoney(month.totalPending)}</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-baseline">
                                                <span className={`text-[10px] uppercase font-bold ${month.totalPending > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>A Receber</span>
                                                <span className={`text-lg font-bold font-mono ${month.totalPending > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{formatMoney(month.totalPending)}</span>
                                            </div>
                                            {month.totalPaid > 0 && (
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold">Já Recebido</span>
                                                    <span className="text-sm font-bold text-slate-500 font-mono">{formatMoney(month.totalPaid)}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* 🧼 Removido 'any' do loop de verificação em lote */}
                            {month.items.some((i: ProjectedReceivableItem) => i.status === 'pending') && (
                                <button type="button" onClick={() => handlePayBatch(month.items.filter((i: ProjectedReceivableItem) => i.status === 'pending').map((i: ProjectedReceivableItem) => i.id), month.title)} disabled={loadingPay} className="ml-3 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1.5 rounded flex items-center gap-1 transition-colors font-bold shrink-0">
                                    <CheckSquare size={14} /> Receber
                                </button>
                            )}
                        </div>

                        {/* Lista */}
                        <div className="p-2 flex-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                            {month.items.length > 0 ? (
                                month.items.map((item: ProjectedReceivableItem) => ( // 🧼 Substituído 'item: any' por tipo projetado
                                    <div key={item.id} className={`p-3 rounded-lg border flex items-center justify-between group transition-all ${item.status === 'paid' ? 'bg-slate-900/20 border-slate-800/30 opacity-60' : 'bg-slate-950/50 border-slate-800/50 hover:border-slate-700'}`}>
                                        <div className="flex-1 min-w-0 mr-2">
                                            <div className="flex items-center gap-2">
                                                <p className={`text-sm font-medium truncate ${item.status === 'paid' ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-200'}`}>{item.descricao}</p>
                                                {item.status !== 'paid' && <button type="button" onClick={() => handleEdit(item)} className="text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all p-1 rounded-md hover:bg-slate-800 shrink-0"><Pencil size={12} /></button>}
                                            </div>
                                            <div className="flex gap-2 mt-1.5 overflow-hidden">
                                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1 font-medium whitespace-nowrap"><User size={10} /> {item.devedor}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold tabular-nums whitespace-nowrap ${item.status === 'paid' ? 'bg-emerald-950/30 text-emerald-600 border-emerald-900/30' : 'bg-slate-800/80 text-blue-400 border-slate-700/80'}`}>
                                                    {item.status === 'paid' ? 'PAGO' : `${item.parcela_visual}/${item.total_parcelas}`}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-3 shrink-0">
                                            <div>
                                                <p className={`text-sm font-bold font-mono ${item.status === 'paid' ? 'text-slate-500' : 'text-emerald-400'}`}>{formatMoney(item.valor)}</p>
                                                <p className="text-[10px] text-slate-600 font-medium">Dia {item.dia}</p>
                                            </div>
                                            {item.status === 'pending' && <button type="button" onClick={() => handlePay(item.id)} className="text-slate-500 hover:text-emerald-400 transition-colors p-1.5 rounded-full hover:bg-emerald-500/10" title="Receber agora"><CheckCircle size={20} /></button>}
                                            {item.status === 'paid' && <div className="text-emerald-500/40 p-1.5"><Check size={18} /></div>}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs py-8 opacity-50 gap-2"><CheckCircle size={24} className="opacity-50" /> Nada pendente</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md space-y-5 shadow-2xl animate-in zoom-in-95 relative">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">{editingId ? <Pencil size={18} className="text-blue-500" /> : <Plus size={18} className="text-blue-500" />} {editingId ? 'Editar Reembolso' : 'Novo Reembolso'}</h3>
                        <div className="space-y-4">
                            <div><label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Descrição</label><input placeholder="Ex: Compra TV" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors" value={desc} onChange={e => setDesc(e.target.value)} /></div>
                            <div className="flex gap-3"><div className="w-2/3"><label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Valor Total (R$)</label><input type="number" placeholder="0,00" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-bold text-lg" value={val} onChange={e => setVal(e.target.value)} /></div><div className="w-1/3"><label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Parcelas</label><input type="number" placeholder="1" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors font-bold text-lg text-center" value={parc} onChange={e => setParc(e.target.value)} /></div></div>
                            <div><label className="text-[11px] text-slate-400 uppercase font-bold pl-1 mb-1 block">Quem deve?</label><input placeholder="Ex: Pai..." className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white outline-none focus:border-blue-500 transition-colors" value={who} onChange={e => setWho(e.target.value)} /></div>
                        </div>
                        <div className="flex gap-3 pt-2 border-t border-slate-800/50 mt-4">
                            {editingId && <button type="button" onClick={handleDelete} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-3 rounded-lg font-bold border border-red-500/20 transition-colors flex items-center justify-center gap-2"><Trash2 size={18} /> <span className="hidden sm:inline">Excluir</span></button>}
                            <button type="button" onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"><CheckCircle size={18} /> {editingId ? 'Salvar' : 'Criar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
