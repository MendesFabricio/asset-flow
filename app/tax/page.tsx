"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Receipt, PieChart, ArrowLeft } from 'lucide-react';
import TaxMonthlyReport from '@/features/tax/components/TaxMonthlyReport';
import TaxAnnualReport from '@/features/tax/components/TaxAnnualReport';
import TaxProfileModal from '@/features/tax/components/TaxProfileModal';

export default function TaxPage() {
  const [activeTab, setActiveTab] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f111a] text-slate-900 dark:text-slate-200 font-sans p-4 md:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-4 group"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
            Voltar para o Dashboard
          </Link>
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Receipt className="w-8 h-8 text-blue-500" />
                Imposto de Renda
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Acompanhe o recolhimento mensal de DARF e prepare sua declaração anual
              </p>
            </div>
            <div>
              <TaxProfileModal />
            </div>
          </div>
        </div>

      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('monthly')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'monthly'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Receipt className="w-4 h-4" />
          DARF (Mensal)
        </button>
        <button
          onClick={() => setActiveTab('annual')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'annual'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
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
