'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { apiCall } from '@/lib/api';
import { Asset } from '@/types';
import { ParsedTransaction, ImportMode, B3Tab, parseOption } from './types';

export function useUnifiedImport(onSuccess: () => void, onClose: () => void) {
  const [importMode, setImportMode] = useState<ImportMode>('brokerage');
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupPayload, setBackupPayload] = useState<Record<string, unknown> | null>(null);
  const [backupMode, setBackupMode] = useState<'replace' | 'merge'>('replace');

  const [brokerageTxs, setBrokerageTxs] = useState<ParsedTransaction[]>([]);
  const [noteDate, setNoteDate] = useState<string>('');

  const [dividends, setDividends] = useState<ParsedTransaction[]>([]);
  const [b3Transactions, setB3Transactions] = useState<ParsedTransaction[]>([]);
  const [corporateEvents, setCorporateEvents] = useState<ParsedTransaction[]>([]);

  const [b3ActiveTab, setB3ActiveTab] = useState<B3Tab>('auditoria');
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [userAssets, setUserAssets] = useState<Asset[]>([]);
  const [activeCorpEvent, setActiveCorpEvent] = useState<{ ticker: string; type: string; date: string } | null>(null);
  const [isCorpModalOpen, setIsCorpModalOpen] = useState(false);

  const { notify: toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const switchMode = (mode: ImportMode) => {
    setImportMode(mode);
    setBrokerageTxs([]);
    setB3Transactions([]);
    setDividends([]);
    setCorporateEvents([]);
    if (mode !== 'backup') {
      setBackupPayload(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const files = Array.from(inputEl.files || []);
    if (files.length === 0) return;

    const pdfFiles = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
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
          try {
            const data = await apiCall<{ transactions?: ParsedTransaction[]; date?: string }>(
              '/api/ocr/parse-brokerage-note',
              { method: 'POST', body: formData }
            );
            if (data.transactions) {
              allNewTxs.push(...data.transactions);
              if (data.date) lastDate = data.date;
            }
          } catch {}
        }

        if (allNewTxs.length === 0) {
          toast('Nenhuma operação identificada.', 'error');
        } else {
          const mappedTxs = allNewTxs.map((tx) =>
            parseOption(tx.ticker) ? { ...tx, category: 'Opções' } : tx
          );
          setBrokerageTxs((prev) => [...prev, ...mappedTxs]);
          if (lastDate) setNoteDate(lastDate);
          toast(`${allNewTxs.length} operações encontradas!`, 'success');
        }
      } else {
        const allB3Txs: ParsedTransaction[] = [];
        const allDividends: ParsedTransaction[] = [];
        const allCorporateEvents: ParsedTransaction[] = [];

        for (const file of pdfFiles) {
          const formData = new FormData();
          formData.append('file', file);
          const data = await apiCall<{
            transactions?: ParsedTransaction[];
            dividends?: ParsedTransaction[];
            corporate_events_suggestions?: ParsedTransaction[];
          }>('/api/ocr/parse-b3-extract', { method: 'POST', body: formData });

          if (data.transactions) allB3Txs.push(...data.transactions);
          if (data.dividends) allDividends.push(...data.dividends);
          if (data.corporate_events_suggestions) allCorporateEvents.push(...data.corporate_events_suggestions);
        }

        setB3Transactions((prev) => [...prev, ...allB3Txs]);
        setDividends((prev) => [...prev, ...allDividends]);
        setCorporateEvents((prev) => [...prev, ...allCorporateEvents]);
        toast(`${allB3Txs.length} operações, ${allDividends.length} proventos e ${allCorporateEvents.length} eventos!`, 'success');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro ao processar arquivos.', 'error');
    } finally {
      setIsUploading(false);
      inputEl.value = '';
    }
  };

  const handleImportBrokerage = async () => {
    if (brokerageTxs.length === 0) return;
    if (brokerageTxs.some((tx) => !tx.ticker.trim())) {
      toast('Preencha o ticker de todos os ativos antes de importar.', 'error');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    const newTransactions = [...brokerageTxs];

    try {
      for (let i = 0; i < brokerageTxs.length; i++) {
        const tx = brokerageTxs[i];
        try {
          await apiCall('/api/asset-transactions', {
            method: 'POST',
            body: JSON.stringify({
              ticker: tx.ticker.trim(),
              type: tx.type,
              quantity: tx.quantity,
              unit_price: tx.unit_price,
              date: tx.date || noteDate || new Date().toISOString().split('T')[0],
              category: tx.category || 'Ação',
              force_duplicate: tx.force_duplicate,
            }),
          });
          successCount++;
          newTransactions[i] = { ...tx, error: 'SUCCESS' };
        } catch (err: unknown) {
          newTransactions[i] = { ...tx, error: err instanceof Error ? err.message : 'Erro' };
        }
        setBrokerageTxs([...newTransactions]);
      }

      setBrokerageTxs(newTransactions.filter((tx) => tx.error !== 'SUCCESS'));
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

  const handleImportDividends = async () => {
    if (dividends.length === 0) return;
    setIsImporting(true);
    let successCount = 0;
    const newDividends = [...dividends];

    try {
      for (let i = 0; i < dividends.length; i++) {
        const div = dividends[i];
        if (div.db_matched || div.error === 'SUCCESS') continue;

        let typeVal = 'DIVIDEND';
        if (div.type.toLowerCase().includes('juros')) typeVal = 'JCP';
        if (div.type.toLowerCase().includes('rendimento')) typeVal = 'RENDIMENTO';

        try {
          await apiCall('/api/dividends', {
            method: 'POST',
            body: JSON.stringify({
              ticker: div.ticker,
              type: typeVal,
              amount: div.total_value,
              date: div.date,
            }),
          });
          successCount++;
          newDividends[i] = { ...div, error: 'SUCCESS' };
        } catch {}
      }

      setDividends(newDividends);
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
    setActiveCorpEvent({ ticker: ev.ticker, type: ev.type, date: ev.date });
    setIsCorpModalOpen(true);

    if (userAssets.length === 0) {
      try {
        const res = await apiCall<Asset[] | { assets?: Asset[] }>('/api/assets');
        setUserAssets(Array.isArray(res) ? res : (res?.assets || []));
      } catch (e) {
        console.error('Falha ao carregar ativos:', e);
      }
    }
  };

  const handleImportB3Transactions = async () => {
    const missingTxs = b3Transactions.filter((t) => !t.db_matched && t.error !== 'SUCCESS');
    if (missingTxs.length === 0) return;

    setIsImporting(true);
    let successCount = 0;
    const newB3Txs = [...b3Transactions];

    try {
      for (let i = 0; i < b3Transactions.length; i++) {
        const tx = b3Transactions[i];
        if (tx.db_matched || tx.error === 'SUCCESS') continue;

        try {
          await apiCall('/api/asset-transactions', {
            method: 'POST',
            body: JSON.stringify({
              ticker: tx.ticker.trim(),
              type: tx.type,
              quantity: tx.quantity,
              unit_price: tx.unit_price,
              date: tx.date || new Date().toISOString().split('T')[0],
              category: parseOption(tx.ticker) ? 'Opções' : (tx.category || 'Ação'),
            }),
          });
          successCount++;
          newB3Txs[i] = { ...tx, db_matched: true, error: 'SUCCESS' };
        } catch (err: unknown) {
          newB3Txs[i] = { ...tx, error: err instanceof Error ? err.message : 'Erro' };
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
      setCorporateEvents((prev) =>
        prev.map((item) =>
          item.ticker === activeCorpEvent.ticker && item.date === activeCorpEvent.date
            ? { ...item, db_matched: true, error: 'SUCCESS' }
            : item
        )
      );
    }
    toast('Evento corporativo registrado com sucesso!', 'success');
    onSuccess();
  };

  const handleIgnoreCorpEvent = (evToIgnore: ParsedTransaction) => {
    setCorporateEvents((prev) =>
      prev.map((item) =>
        item.ticker === evToIgnore.ticker && item.date === evToIgnore.date && item.type === evToIgnore.type
          ? { ...item, db_matched: true, error: 'SUCCESS' }
          : item
      )
    );
    toast('Evento ignorado.', 'success');
  };

  const handleExportBackup = async () => {
    try {
      const data = await apiCall<Record<string, unknown>>('/api/portfolio/export-history');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `historico_tratado_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast('Histórico tratado exportado com sucesso!', 'success');
    } catch {
      toast('Erro ao exportar histórico tratado.', 'error');
    }
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.schema_version || !Array.isArray(data.positions) || !Array.isArray(data.transactions)) {
        toast('Arquivo JSON inválido: estrutura de histórico tratado não reconhecida.', 'error');
        return;
      }
      setBackupPayload(data as Record<string, unknown>);
      toast('Backup carregado para conferência.', 'success');
    } catch {
      toast('Não foi possível ler o arquivo JSON selecionado.', 'error');
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupPayload) return;
    setIsImporting(true);
    try {
      const data = await apiCall<{
        imported?: { positions?: number; transactions?: number; dividends?: number };
      }>('/api/portfolio/import-history', {
        method: 'POST',
        body: JSON.stringify({ ...backupPayload, mode: backupMode }),
      });
      const imp = data.imported || {};
      toast(
        `Histórico restaurado! ${imp.positions ?? 0} posições, ${imp.transactions ?? 0} transações e ${imp.dividends ?? 0} proventos.`,
        'success'
      );
      setBackupPayload(null);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexão ao restaurar histórico tratado.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return {
    importMode,
    switchMode,
    isUploading,
    isImporting,
    backupPayload,
    backupMode,
    setBackupMode,
    brokerageTxs,
    setBrokerageTxs,
    dividends,
    b3Transactions,
    setB3Transactions,
    corporateEvents,
    b3ActiveTab,
    setB3ActiveTab,
    showOnlyMissing,
    setShowOnlyMissing,
    mounted,
    userAssets,
    activeCorpEvent,
    isCorpModalOpen,
    setIsCorpModalOpen,
    handleFileChange,
    handleImportBrokerage,
    handleImportDividends,
    handleOpenCorpModal,
    handleImportB3Transactions,
    handleCorpSuccess,
    handleIgnoreCorpEvent,
    handleExportBackup,
    handleBackupFileChange,
    handleRestoreBackup,
  };
}
