"use client";

import { useState } from 'react';
import { Receipt, PieChart } from 'lucide-react';
import TaxMonthlyReport from '@/features/tax/components/TaxMonthlyReport';
import TaxAnnualReport from '@/features/tax/components/TaxAnnualReport';
import TaxProfileModal from '@/features/tax/components/TaxProfileModal';
import { SubPageHeader } from '@/components/ui/SubPageHeader';

export default function TaxPage() {
  const [activeTab, setActiveTab] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      <SubPageHeader />
      <div className="max-w-5xl mx-auto p-4 md:p-6 flex flex-col gap-6">
        <div>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
                <Receipt className="w-8 h-8 text-accent" />
                Imposto de Renda
              </h2>
              <p className="text-text-muted text-sm mt-1">
                Acompanhe o recolhimento mensal de DARF e prepare sua declaração anual
              </p>
            </div>
            <div>
              <TaxProfileModal />
            </div>
          </div>
        </div>

      <div className="flex border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('monthly')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'monthly'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Receipt className="w-4 h-4" />
          DARF (Mensal)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('annual')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'annual'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <PieChart className="w-4 h-4" />
          IRPF (Anual)
        </button>
      </div>

      <div className="mt-4">
        {activeTab === 'monthly' && <TaxMonthlyReport />}
        {activeTab === 'annual' && <TaxAnnualReport />}
      </div>
      </div>
    </div>
  );
}
