'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 group">
      <div className="bg-accent p-1.5 rounded-lg transition-colors duration-150">
        <Wallet className="text-white" size={18} />
      </div>
      <h1 className="text-lg font-semibold text-text-primary tracking-tight mr-2 select-none">
        AssetFlow <span className="text-accent text-xs font-normal ml-1">Pro</span>
      </h1>
    </Link>
  );
}
