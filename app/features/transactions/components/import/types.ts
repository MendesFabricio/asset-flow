export interface ParsedTransaction {
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
  original_type?: string;
}

export type ImportMode = 'brokerage' | 'b3' | 'backup';

export type B3Tab = 'auditoria' | 'proventos' | 'eventos';

export function parseOption(ticker: string) {
  if (!ticker) return null;
  const match = ticker.trim().match(/^([A-Z]{4}\d?)([A-X])(\d{1,4})(E?)$/i);
  if (!match) return null;
  const monthChar = match[2].toUpperCase();
  const monthOrd = monthChar.charCodeAt(0);
  const type = monthOrd <= 'L'.charCodeAt(0) ? 'CALL' : 'PUT';
  return { type, strike: Number(match[3]) };
}
