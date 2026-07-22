'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Check, AlertTriangle, ShieldCheck, FileText, Trash2, AlertCircle, ExternalLink, Settings } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiCall } from '@/lib/api';
import { Asset } from '@/types';
import { CorporateActionGlobalModal } from '@/features/assets/components/CorporateActionGlobalModal';

interface ParsedTransaction {
  ticker: string;
  name?: string;
  type: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  date: string;
  category?: string;
  error?: string;
  force_duplicate?: boolean;
  description?: string;
  db_matched?: boolean;
}

function parseOption(ticker: string) {
  if (!ticker) return null;
  const match = ticker.match(/^([A-Z]{4})([A-X])(\d{1,3})$/i);
  if (!match) return null;
  const monthChar = match[2].toUpperCase();
  const monthOrd = monthChar.charCodeAt(0);
  const type = monthOrd <= 'L'.charCodeAt(0) ? 'CALL' : 'PUT';
  return { type, strike: Number(match[3]) };
}

interface UnifiedImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UnifiedImportModal({ isOpen, onClose, onSuccess }: UnifiedImportModalProps) {
  const [importMode, setImportMode] = useState<'brokerage' | 'b3'>('brokerage');
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // Brokerage Note State
  const [brokerageTxs, setBrokerageTxs] = useState<ParsedTransaction[]>([]);
  const [noteDate, setNoteDate] = useState<string>('');
  
  // B3 State
  const [dividends, setDividends] = useState<ParsedTransaction[]>([]);
  const [b3Transactions, setB3Transactions] = useState<ParsedTransaction[]>([]);
  const [corporateEvents, setCorporateEvents] = useState<ParsedTransaction[]>([]);
  
  const [b3ActiveTab, setB3ActiveTab] = useState<'auditoria' | 'proventos' | 'eventos'>('auditoria');
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  
  const [mounted, setMounted] = useState(false);
  const { notify: toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Corporate Action Modal Integration
  const [userAssets, setUserAssets] = useState<Asset[]>([]);
  const [activeCorpEvent, setActiveCorpEvent] = useState<{ ticker: string; type: string; date: string } | null>(null);
  const [isCorpModalOpen, setIsCorpModalOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!isOpen || !mounted) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      toast('Por favor, selecione arquivos PDF válidos.', 'error');
      return;
    }

    setIsUploading(true);

    try {
      if (importMode === 'brokerage') {
        const allNewTxs: ParsedTransaction[] = [];
        let lastDate = noteDate;
        
        for (const file of pdfFiles) {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/ocr/parse-brokerage-note', { method: 'POST', body: formData });
          const data = await res.json();
          if (res.ok && data.transactions) {
            allNewTxs.push(...data.transactions);
            if (data.date) lastDate = data.date;
          }
        }
        
        if (allNewTxs.length === 0) {
          toast('Nenhuma operação identificada.', 'error');
        } else {
          // Adjust category if it's an option
          const mappedTxs = allNewTxs.map(tx => {
            if (parseOption(tx.ticker)) {
              return { ...tx, category: "Opções" };
            }
            return tx;
          });
          setBrokerageTxs(prev => [...prev, ...mappedTxs]);
          if (lastDate) setNoteDate(lastDate);
          toast(`${allNewTxs.length} operações encontradas!`, 'success');
        }
      } else {
        // B3 Mode
        const allB3Txs: ParsedTransaction[] = [];
        const allDividends: ParsedTransaction[] = [];
        const allCorporateEvents: ParsedTransaction[] = [];

        for (const file of pdfFiles) {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/ocr/parse-b3-extract', { method: 'POST', body: formData });
          const data = await res.json();
          
          if (!res.ok) throw new Error(data.msg || `Erro ao processar o arquivo ${file.name}.`);
          
          if (data.transactions) allB3Txs.push(...data.transactions);
          if (data.dividends) allDividends.push(...data.dividends);
          if (data.corporate_events_suggestions) allCorporateEvents.push(...data.corporate_events_suggestions);
        }
        
        setB3Transactions(prev => [...prev, ...allB3Txs]);
        setDividends(prev => [...prev, ...allDividends]);
        setCorporateEvents(prev => [...prev, ...allCorporateEvents]);
        
        toast(`${allB3Txs.length} operações, ${allDividends.length} proventos e ${allCorporateEvents.length} eventos!`, 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Erro ao processar arquivos.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Brokerage Note Functions ---
  const handleImportBrokerage = async () => {
    if (brokerageTxs.length === 0) return;
    const missing = brokerageTxs.filter(tx => !tx.ticker.trim());
    if (missing.length > 0) {
      toast(`Preencha o ticker de todos os ativos antes de importar.`, 'error');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    const newTransactions = [...brokerageTxs];

    try {
      for (let i = 0; i < brokerageTxs.length; i++) {
        const tx = brokerageTxs[i];
        try {
          const res = await fetch('/api/asset-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: tx.ticker.trim(),
              type: tx.type,
              quantity: tx.quantity,
              unit_price: tx.unit_price,
              date: tx.date || noteDate || new Date().toISOString().split('T')[0],
              category: tx.category || "Ação",
              force_duplicate: tx.force_duplicate
            })
          });
          
          if (res.ok) {
            successCount++;
            newTransactions[i] = { ...tx, error: 'SUCCESS' };
          } else {
            const errData = await res.json();
            newTransactions[i] = { ...tx, error: errData.msg || 'Erro' };
          }
        } catch (err: any) { 
          newTransactions[i] = { ...tx, error: err.message || 'Erro' };
        }
        setBrokerageTxs([...newTransactions]);
      }

      const remaining = newTransactions.filter(tx => tx.error !== 'SUCCESS');
      setBrokerageTxs(remaining);

      if (successCount > 0) {
        toast(`${successCount} operações importadas com sucesso!`, 'success');
        onSuccess();
      }
    } catch {
      toast('Erro geral na importação.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // --- B3 Functions ---
  const handleImportDividends = async () => {
    if (dividends.length === 0) return;
    setIsImporting(true);
    let successCount = 0;
    const newDividends = [...dividends];

    try {
      for (let i = 0; i < dividends.length; i++) {
        const div = dividends[i];
        if (div.db_matched || div.error === 'SUCCESS') continue; // Skip already matched

        let typeVal = "DIVIDEND";
        if (div.type.toLowerCase().includes("juros")) typeVal = "JCP";
        if (div.type.toLowerCase().includes("rendimento")) typeVal = "RENDIMENTO";
        
        try {
          const res = await fetch('/api/dividends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: div.ticker,
              type: typeVal,
              amount: div.total_value,
              date: div.date
            })
          });
          
          if (res.ok) {
            successCount++;
            newDividends[i] = { ...div, error: 'SUCCESS' };
          }
        } catch {}
      }

      const remaining = newDividends.filter(d => d.error !== 'SUCCESS' && !d.db_matched);
      setDividends(newDividends); // Keep them but marked as SUCCESS

      if (successCount > 0) {
        toast(`${successCount} proventos importados com sucesso!`, 'success');
        onSuccess();
      }
    } catch {
      toast('Erro geral na importação de proventos.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleOpenCorpModal = async (ev: ParsedTransaction) => {
    setActiveCorpEvent({
      ticker: ev.ticker,
      type: ev.type,
      date: ev.date
    });
    setIsCorpModalOpen(true);

    if (userAssets.length === 0) {
      try {
        const res = await apiCall<any>('/api/assets');
        const list = Array.isArray(res) ? res : (res?.assets || []);
        setUserAssets(list);
      } catch (e) {
        console.error('Falha ao carregar ativos:', e);
      }
    }
  };

  const handleImportB3Transactions = async () => {
    const missingTxs = b3Transactions.filter(t => !t.db_matched && t.error !== 'SUCCESS');
    if (missingTxs.length === 0) return;

    setIsImporting(true);
    let successCount = 0;
    const newB3Txs = [...b3Transactions];

    try {
      for (let i = 0; i < b3Transactions.length; i++) {
        const tx = b3Transactions[i];
        if (tx.db_matched || tx.error === 'SUCCESS') continue;

        try {
          const res = await fetch('/api/asset-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: tx.ticker.trim(),
              type: tx.type,
              quantity: tx.quantity,
              unit_price: tx.unit_price,
              date: tx.date || new Date().toISOString().split('T')[0],
              category: parseOption(tx.ticker) ? "Opções" : (tx.category || "Ação")
            })
          });

          if (res.ok) {
            successCount++;
            newB3Txs[i] = { ...tx, db_matched: true, error: 'SUCCESS' };
          } else {
            const errData = await res.json();
            newB3Txs[i] = { ...tx, error: errData.msg || 'Erro' };
          }
        } catch (err: any) {
          newB3Txs[i] = { ...tx, error: err.message || 'Erro' };
        }
      }

      setB3Transactions([...newB3Txs]);

      if (successCount > 0) {
        toast(`${successCount} operações da B3 importadas com sucesso!`, 'success');
        onSuccess();
      }
    } catch {
      toast('Erro geral na importação de operações da B3.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCorpSuccess = () => {
    setIsCorpModalOpen(false);
    if (activeCorpEvent) {
      setCorporateEvents(prev => prev.map(item => 
        item.ticker === activeCorpEvent.ticker && item.date === activeCorpEvent.date 
          ? { ...item, db_matched: true, error: 'SUCCESS' } 
          : item
      ));
    }
    toast('Evento corporativo registrado com sucesso!', 'success');
    onSuccess();
  };

  const handleIgnoreCorpEvent = (evToIgnore: ParsedTransaction) => {
    setCorporateEvents(prev => prev.map(item => 
      item.ticker === evToIgnore.ticker && item.date === evToIgnore.date && item.type === evToIgnore.type
        ? { ...item, db_matched: true, error: 'SUCCESS' } 
        : item
    ));
    toast('Evento ignorado.', 'success');
  };

  const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const hasLoadedData = brokerageTxs.length > 0 || b3Transactions.length > 0 || dividends.length > 0 || corporateEvents.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

        <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-left my-8">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0 bg-slate-900/95 sticky top-0 z-10 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${importMode === 'brokerage' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                {importMode === 'brokerage' ? <FileText size={20} /> : <ShieldCheck size={20} />}
              </div>
              <div>
                <h2 className="text-xl font-bold font-heading text-white">Importação e Conciliação</h2>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="mode" checked={importMode === 'brokerage'} onChange={() => { setImportMode('brokerage'); setBrokerageTxs([]); setB3Transactions([]); setDividends([]); setCorporateEvents([]); }} className="text-blue-500 bg-slate-800 border-slate-700" />
                    Nota de Corretagem
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="mode" checked={importMode === 'b3'} onChange={() => { setImportMode('b3'); setBrokerageTxs([]); setB3Transactions([]); setDividends([]); setCorporateEvents([]); }} className="text-purple-500 bg-slate-800 border-slate-700" />
                    Extrato B3
                  </label>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
               {hasLoadedData && (
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5">
                  <Upload size={14} /> Outro Arquivo
                </button>
              )}
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          <input type="file" ref={fileInputRef} accept="application/pdf" multiple className="hidden" onChange={handleFileChange} disabled={isUploading} />

          {/* Body */}
          <div className="p-5 overflow-y-auto max-h-[65vh]">
            {!hasLoadedData ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-800 rounded-xl">
                <div className="p-4 bg-slate-800/50 rounded-full text-slate-400 mb-4">
                  <Upload size={32} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {importMode === 'brokerage' ? 'Selecione suas Notas de Corretagem' : 'Selecione o Extrato da B3'}
                </h3>
                <p className="text-sm text-slate-400 text-center max-w-md mb-6">
                  {importMode === 'brokerage' 
                    ? 'Envie as notas de corretagem (padrão SINACOR) em PDF. As operações serão extraídas automaticamente.'
                    : 'Faça o download dos seus extratos de movimentação na Área logada da B3 e envie aqui para conciliação.'}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`px-6 py-3 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-white ${importMode === 'brokerage' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'}`}
                >
                  {isUploading ? (
                    <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />Processando...</>
                  ) : 'Escolher Arquivos PDF'}
                </button>
              </div>
            ) : importMode === 'brokerage' ? (
              /* --- BROKERAGE NOTE UI --- */
              <div className="space-y-4">
                <div className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
                  ⚠️ As notas SINACOR mostram o <strong>nome abreviado</strong> da empresa, não o ticker. Verifique e corrija os tickers antes de importar.
                </div>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Op.</th>
                        <th className="px-3 py-2.5 font-medium">Data</th>
                        <th className="px-3 py-2.5 font-medium">Ticker <span className="text-amber-400">(editável)</span></th>
                        <th className="px-3 py-2.5 font-medium">Categoria</th>
                        <th className="px-3 py-2.5 font-medium text-right">Qtd</th>
                        <th className="px-3 py-2.5 font-medium text-right">Total</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {brokerageTxs.map((tx, idx) => {
                        if (tx.error === 'SUCCESS') return null;
                        return (
                          <React.Fragment key={idx}>
                            <tr className={`group ${tx.error ? 'bg-rose-500/5' : 'hover:bg-slate-800/20'}`}>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tx.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                  {tx.type === 'BUY' ? 'C' : 'V'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-300 font-mono">
                                {tx.date ? tx.date.split('-').reverse().join('/') : '-'}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={tx.ticker}
                                  onChange={e => {
                                    const updated = [...brokerageTxs];
                                    updated[idx].ticker = e.target.value.toUpperCase();
                                    setBrokerageTxs(updated);
                                  }}
                                  placeholder="Ex: PETR4"
                                  className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-blue-500"
                                />
                                {tx.name && <div className="text-[9px] text-slate-500 mt-0.5 truncate max-w-[100px]">{tx.name}</div>}
                                {parseOption(tx.ticker) && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 mt-0.5 rounded text-[8px] font-bold uppercase ${parseOption(tx.ticker)?.type === 'CALL' ? 'bg-blue-500/10 text-blue-400' : 'bg-fuchsia-500/10 text-fuchsia-400'}`}>
                                    {parseOption(tx.ticker)?.type} {parseOption(tx.ticker)?.strike}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={tx.category || "Ação"}
                                  onChange={e => {
                                    const updated = [...brokerageTxs];
                                    updated[idx].category = e.target.value;
                                    setBrokerageTxs(updated);
                                  }}
                                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                                >
                                  <option value="Ação">Ação</option>
                                  <option value="FII">FII</option>
                                  <option value="Renda Fixa">Renda Fixa</option>
                                  <option value="Internacional">Internacional</option>
                                  <option value="Cripto">Cripto</option>
                                  <option value="Opções">Opções</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-300">{tx.quantity}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-200">{fmt(tx.total_value)}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setBrokerageTxs(prev => prev.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-rose-400 transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                            {tx.error && (
                              <tr className="bg-rose-500/5">
                                <td colSpan={7} className="px-3 py-1.5 text-xs text-rose-400 border-t-0 flex justify-between items-center">
                                  <span><AlertCircle size={12} className="inline mr-1"/> {tx.error.replace("DUPLICATE_ERROR:", "").trim()}</span>
                                  {tx.error.includes("DUPLICATE_ERROR") && (
                                    <label className="flex items-center gap-2 cursor-pointer text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
                                      <input type="checkbox" checked={tx.force_duplicate} onChange={() => {
                                        const updated = [...brokerageTxs];
                                        updated[idx].force_duplicate = !updated[idx].force_duplicate;
                                        setBrokerageTxs(updated);
                                      }} className="rounded bg-slate-900 border-amber-500/50 text-amber-500"/>
                                      Forçar importação
                                    </label>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* --- B3 UI --- */
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setB3ActiveTab('auditoria')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${b3ActiveTab === 'auditoria' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5' : 'text-slate-400 hover:text-slate-300'}`}>
                      Auditoria ({b3Transactions.length})
                    </button>
                    <button onClick={() => setB3ActiveTab('proventos')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${b3ActiveTab === 'proventos' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5' : 'text-slate-400 hover:text-slate-300'}`}>
                      Proventos ({dividends.length})
                    </button>
                    <button onClick={() => setB3ActiveTab('eventos')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${b3ActiveTab === 'eventos' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-400 hover:text-slate-300'}`}>
                      Eventos Corporativos ({corporateEvents.length})
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer px-2">
                    <input type="checkbox" checked={showOnlyMissing} onChange={e => setShowOnlyMissing(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-purple-500" />
                    Ocultar salvos
                  </label>
                </div>

                {b3ActiveTab === 'auditoria' && (
                  <div>
                    <div className="text-xs text-slate-400 bg-slate-800/50 rounded-lg px-3 py-2 mb-3">
                      Compara suas transações da B3 com as Notas de Corretagem já importadas.
                    </div>
                    
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="px-3 py-2.5 font-medium">Status</th>
                            <th className="px-3 py-2.5 font-medium">Data</th>
                            <th className="px-3 py-2.5 font-medium">Ticker</th>
                            <th className="px-3 py-2.5 font-medium">Operação</th>
                            <th className="px-3 py-2.5 font-medium text-right">Qtd</th>
                            <th className="px-3 py-2.5 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {b3Transactions
                            .filter(tx => !showOnlyMissing || !tx.db_matched)
                            .map((tx, idx) => (
                            <tr key={idx} className={`group ${!tx.db_matched ? 'bg-rose-500/5' : 'hover:bg-slate-800/20'}`}>
                              <td className="px-3 py-2">
                                {tx.db_matched ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded">
                                    <Check size={12}/> Bateu
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-rose-400 text-[10px] font-bold uppercase bg-rose-500/10 px-2 py-0.5 rounded">
                                    <AlertTriangle size={12}/> Faltando Nota
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-300 font-mono">{tx.date ? tx.date.split('-').reverse().join('/') : '-'}</td>
                              <td className="px-3 py-2 font-mono font-bold text-white">
                                {tx.ticker}
                                {parseOption(tx.ticker) && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 ml-2 rounded text-[8px] font-bold uppercase ${parseOption(tx.ticker)?.type === 'CALL' ? 'bg-blue-500/10 text-blue-400' : 'bg-fuchsia-500/10 text-fuchsia-400'}`}>
                                    {parseOption(tx.ticker)?.type} {parseOption(tx.ticker)?.strike}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-400 text-xs">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...b3Transactions];
                                      const realIdx = b3Transactions.findIndex(item => item === tx);
                                      if (realIdx !== -1) {
                                        updated[realIdx].type = tx.type === 'BUY' ? 'SELL' : 'BUY';
                                        setB3Transactions(updated);
                                      }
                                    }}
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-pointer hover:scale-105 transition-all ${
                                      tx.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                    }`}
                                    title="Clique para alternar entre Compra e Venda"
                                  >
                                    {tx.type === 'BUY' ? 'C' : 'V'}
                                  </button>
                                  <span className="text-slate-400 text-[11px]">{(tx as any).original_type || tx.type}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-300">{tx.quantity}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-200">{fmt(tx.total_value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {b3ActiveTab === 'proventos' && (
                  <div>
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="px-3 py-2.5 font-medium">Status</th>
                            <th className="px-3 py-2.5 font-medium">Data Pago</th>
                            <th className="px-3 py-2.5 font-medium">Ticker</th>
                            <th className="px-3 py-2.5 font-medium">Tipo</th>
                            <th className="px-3 py-2.5 font-medium text-right">Qtd Ref</th>
                            <th className="px-3 py-2.5 font-medium text-right">Valor Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {dividends
                            .filter(div => !showOnlyMissing || !(div.db_matched || div.error === 'SUCCESS'))
                            .map((div, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/20">
                              <td className="px-3 py-2">
                                {div.error === 'SUCCESS' || div.db_matched ? (
                                  <span className="text-emerald-400 text-[10px] font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1"><Check size={12}/> Salvo</span>
                                ) : (
                                  <span className="text-amber-400 text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1">Pendente</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-300 font-mono">{div.date ? div.date.split('-').reverse().join('/') : '-'}</td>
                              <td className="px-3 py-2 font-mono font-bold text-white">{div.ticker}</td>
                              <td className="px-3 py-2 text-emerald-400 text-xs font-medium uppercase">{div.type}</td>
                              <td className="px-3 py-2 text-right text-slate-400">{div.quantity}</td>
                              <td className="px-3 py-2 text-right font-medium text-emerald-400">{fmt(div.total_value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {b3ActiveTab === 'eventos' && (
                  <div>
                    <div className="text-xs text-blue-400 bg-blue-500/10 rounded-lg px-3 py-2 mb-3">
                      Eventos corporativos detectados no seu extrato. Clique em <strong>Configurar Evento</strong> para revisar os parâmetros (fator, percentual ou novo ticker) e registrá-lo.
                    </div>
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/50 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="px-3 py-2.5 font-medium">Status</th>
                            <th className="px-3 py-2.5 font-medium">Data</th>
                            <th className="px-3 py-2.5 font-medium">Ticker</th>
                            <th className="px-3 py-2.5 font-medium">Evento</th>
                            <th className="px-3 py-2.5 font-medium text-right">Qtd</th>
                            <th className="px-3 py-2.5 font-medium text-right">Fração (R$)</th>
                            <th className="px-3 py-2.5 font-medium text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {corporateEvents
                            .filter(ev => !showOnlyMissing || !(ev.db_matched || ev.error === 'SUCCESS'))
                            .map((ev, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/20">
                              <td className="px-3 py-2">
                                {ev.db_matched || ev.error === 'SUCCESS' ? (
                                  <span className="text-emerald-400 text-[10px] font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1"><Check size={12}/> Registrado</span>
                                ) : (
                                  <span className="text-amber-400 text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1">Pendente</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-300 font-mono">{ev.date ? ev.date.split('-').reverse().join('/') : '-'}</td>
                              <td className="px-3 py-2 font-mono font-bold text-white">{ev.ticker}</td>
                              <td className="px-3 py-2 text-blue-400 text-xs font-medium">{ev.type}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{ev.quantity}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-200">{fmt(ev.total_value)}</td>
                              <td className="px-3 py-2 text-center">
                                {!(ev.db_matched || ev.error === 'SUCCESS') && (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => handleOpenCorpModal(ev)}
                                      className="px-2.5 py-1 text-[11px] font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-md transition-colors inline-flex items-center gap-1"
                                    >
                                      <Settings size={12} /> Configurar Evento
                                    </button>
                                    <button
                                      onClick={() => handleIgnoreCorpEvent(ev)}
                                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
                                      title="Ignorar evento"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {hasLoadedData && (
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/50 rounded-b-xl mt-auto">
              <button onClick={onClose} disabled={isImporting} className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                Fechar
              </button>
              
              {importMode === 'brokerage' && brokerageTxs.length > 0 && (
                <button
                  onClick={handleImportBrokerage}
                  disabled={isImporting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isImporting ? 'Importando...' : `Confirmar ${brokerageTxs.filter(t => !t.error || t.error.includes('DUPLICATE')).length} Operações`}
                </button>
              )}

              {importMode === 'b3' && b3ActiveTab === 'auditoria' && b3Transactions.some(d => !d.db_matched && d.error !== 'SUCCESS') && (
                <button
                  onClick={handleImportB3Transactions}
                  disabled={isImporting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isImporting ? 'Importando...' : `Importar ${b3Transactions.filter(t => !t.db_matched && t.error !== 'SUCCESS').length} Operações Faltantes da B3`}
                </button>
              )}

              {importMode === 'b3' && b3ActiveTab === 'proventos' && dividends.some(d => !d.db_matched && d.error !== 'SUCCESS') && (
                <button
                  onClick={handleImportDividends}
                  disabled={isImporting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isImporting ? 'Salvando...' : 'Importar Proventos Pendentes'}
                </button>
              )}

            </div>
          )}

          {isCorpModalOpen && (
            <CorporateActionGlobalModal
              isOpen={isCorpModalOpen}
              onClose={() => setIsCorpModalOpen(false)}
              onSuccess={handleCorpSuccess}
              assets={userAssets}
              initialData={activeCorpEvent || undefined}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
