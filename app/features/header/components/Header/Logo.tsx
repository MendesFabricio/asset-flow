'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <div className="bg-blue-600 p-2 rounded-xl shadow-sm group-hover:bg-blue-500 transition-colors duration-200">
        <Wallet className="text-white" size={17} />
      </div>
      <h1 className="text-lg font-bold text-text-primary tracking-tight mr-1 select-none">
        AssetFlow <span className="text-blue-500 text-xs font-semibold ml-0.5">Pro</span>
      </h1>
    </Link>
  );
}
