'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';

export function Logo() {
  return (
    <a href="/" className="flex items-center gap-3 group">
      <div className="bg-blue-600 p-1.5 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)] group-hover:scale-105 transition-transform duration-200">
        <Wallet className="text-white" size={18} />
      </div>
      <h1 className="text-lg font-bold text-white tracking-tight mr-2 select-none">
        AssetFlow <span className="text-blue-500 text-xs font-normal ml-1">Pro</span>
      </h1>
    </a>
  );
}
