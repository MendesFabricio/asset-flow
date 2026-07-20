import { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes, forwardRef } from 'react';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className = '', children, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={`w-full border-collapse text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
);
Table.displayName = 'Table';

export function TableHeader({ className = '', children, ...props }: ThHTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-slate-900/50 text-slate-400 text-[11px] uppercase tracking-wider ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableRow({ className = '', children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${className}`} {...props}>
      {children}
    </tr>
  );
}

interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function TableHead({ className = '', align = 'left', children, ...props }: TableHeadProps) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th className={`px-4 py-3 font-semibold ${alignClass} ${className}`} {...props}>
      {children}
    </th>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function TableCell({ className = '', align = 'left', children, ...props }: TableCellProps) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <td className={`px-4 py-3 text-slate-200 ${alignClass} ${className}`} {...props}>
      {children}
    </td>
  );
}

export function TableBody({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}
