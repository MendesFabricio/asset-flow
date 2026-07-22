"use client";

import { useState, useEffect } from 'react';
import { taxService, TaxProfile } from '@/services/tax';
import { Settings, Save } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';

export default function TaxProfileModal() {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [profile, setProfile] = useState<TaxProfile>({
    accumulated_loss_stocks_st: 0,
    accumulated_loss_stocks_dt: 0,
    accumulated_loss_fiis: 0,
    accumulated_darf_balance: 0,
  });

  useEffect(() => {
    if (opened) {
      setLoading(true);
      taxService.getTaxProfile()
        .then(data => setProfile(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [opened]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await taxService.updateTaxProfile(profile);
      setOpened(false);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar os saldos anteriores.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof TaxProfile, value: string) => {
    const num = parseFloat(value) || 0;
    setProfile(prev => ({ ...prev, [field]: num }));
  };

  return (
    <>
      <button
        onClick={() => setOpened(true)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
      >
        <Settings className="w-4 h-4" />
        Configurar Saldos Anteriores
      </button>

      {opened && (
        <ModalShell
          onClose={() => setOpened(false)}
          title="Configurar Saldos de Impostos"
        >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Informe aqui os prejuízos acumulados que você já trazia de outras corretoras antes de usar o Asset Flow, bem como saldos residuais de DARF (menores que R$ 10,00).
          </p>
          
          {loading ? (
            <div className="py-8 text-center text-slate-500">Carregando...</div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Prejuízo Acumulado - Ações (Swing Trade) R$
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={profile.accumulated_loss_stocks_st}
                  onChange={e => handleChange('accumulated_loss_stocks_st', e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Prejuízo Acumulado - Ações (Day Trade) R$
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={profile.accumulated_loss_stocks_dt}
                  onChange={e => handleChange('accumulated_loss_stocks_dt', e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Prejuízo Acumulado - FIIs R$
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={profile.accumulated_loss_fiis}
                  onChange={e => handleChange('accumulated_loss_fiis', e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Saldo residual de DARF a recolher (Menor que R$ 10)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={profile.accumulated_darf_balance}
                  onChange={e => handleChange('accumulated_darf_balance', e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setOpened(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </form>
        </ModalShell>
      )}
    </>
  );
}
