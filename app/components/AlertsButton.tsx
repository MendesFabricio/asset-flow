'use client';
import { useState, useEffect } from 'react';
import { apiCall } from '../utils/apiClient';
import { Bell, AlertTriangle, CheckCircle, WifiOff, AlertOctagon, Info, Settings, RefreshCw, ChevronRight, FileText } from 'lucide-react';

// Interface alinhada com o backend Python
interface Alert {
  id: string;
  asset_id: number;
  ticker: string;
  type: string;
  message: string;
  field: string;
  severity: number; // 1 a 5
  action: 'edit' | 'sync' | 'view' | 'refresh' | null;
}

interface Props {
  onFixAsset: (assetId: number) => void;
}

export const AlertsButton = ({ onFixAsset }: Props) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchAlerts = async () => {
    try {
      const data = await apiCall('/api/alerts');

      if (Array.isArray(data)) {
        setAlerts(data);
        setHasError(false);
      } else {
        setAlerts([]);
      }
    } catch (error) {
      console.error("Falha ao buscar alertas:", error);
      setHasError(true);
      setAlerts([]);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- Helpers Visuais Modernos ---

  const getSeverityStyles = (severity: number, type: string) => {
    // Retorna: [Cor do Ícone, Classe da Borda Lateral Neon, Classe do Background Hover]
    if (severity === 5) return [<AlertOctagon size={18} className="text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.5)]" />, "border-red-500/80 shadow-[inset_3px_0_0_0_rgba(239,68,68,0.6)]", "hover:bg-red-950/20"];
    if (severity === 4) return [<AlertTriangle size={18} className="text-amber-500 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]" />, "border-amber-500/80 shadow-[inset_3px_0_0_0_rgba(245,158,11,0.6)]", "hover:bg-amber-950/20"];
    if (type === 'CONFIG') return [<Settings size={18} className="text-blue-400 drop-shadow-[0_0_3px_rgba(96,165,250,0.5)]" />, "border-blue-400/80 shadow-[inset_3px_0_0_0_rgba(96,165,250,0.6)]", "hover:bg-blue-950/20"];
    if (type === 'OPORTUNIDADE') return [<RefreshCw size={18} className="text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]" />, "border-emerald-400/80 shadow-[inset_3px_0_0_0_rgba(52,211,153,0.6)]", "hover:bg-emerald-950/20"];
    if (type === 'NOVIDADE') return [<FileText size={18} className="text-purple-400 drop-shadow-[0_0_3px_rgba(192,132,252,0.5)]" />, "border-purple-400/80 shadow-[inset_3px_0_0_0_rgba(192,132,252,0.6)]", "hover:bg-purple-950/20"];
    // Default (DADOS/INFO)
    return [<Info size={18} className="text-slate-400" />, "border-slate-600/50", "hover:bg-slate-800/50"];
  };

  const getActionLabel = (action: string | null) => {
    if (action === 'sync') return 'Sincronizar';
    if (action === 'refresh') return 'Verificar';
    if (action === 'view') return 'Ver';
    return 'Resolver';
  };

  // Verifica se há alertas críticos para o pulso vermelho
  const hasCritical = alerts.some(a => a.severity >= 4);

  return (
    <div className="relative z-50">
      {/* Botão Principal (Trigger) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg transition-all border relative group overflow-hidden ${isOpen
            ? 'bg-slate-700 border-slate-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700/80 hover:border-blue-500/30'
          }`}
        title="Central de Notificações"
      >
        <Bell size={18} className={`transition-colors ${alerts.length > 0 ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-200'}`} />

        {/* Bolinha Pulsante (Estilo Neon) */}
        {hasCritical && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-[#0b0f19] shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span>
          </span>
        )}
      </button>

      {/* Dropdown Menu Moderno */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" onClick={() => setIsOpen(false)}></div>

          <div className="absolute right-0 mt-3 w-80 origin-top-right bg-[#0b0f19]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-white/5">

            {/* Header Clean */}
            <div className="px-4 py-3 border-b border-slate-800/80 flex justify-between items-center bg-slate-950/30">
              <h3 className="font-bold text-slate-100 text-sm tracking-wide flex items-center gap-2">
                Notificações
                {alerts.length > 0 && <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></span>}
              </h3>
              {alerts.length > 0 && (
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {alerts.length} {alerts.length === 1 ? 'ativo' : 'ativos'}
                </span>
              )}
            </div>

            {/* Lista Scrollável */}
            <div className="max-h-[28rem] overflow-y-auto custom-scrollbar p-2 space-y-2 bg-slate-950/20">
              {hasError ? (
                <div className="text-center py-10 text-slate-500 flex flex-col items-center justify-center gap-3">
                  <div className="p-3 bg-slate-800/50 rounded-full"><WifiOff size={24} className="opacity-40" /></div>
                  <p className="text-xs font-medium">Erro de conexão com o servidor.</p>
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 flex flex-col items-center justify-center gap-4">
                  <div className="p-4 bg-emerald-500/10 rounded-full border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <CheckCircle size={32} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-300">Tudo limpo por aqui!</p>
                    <p className="text-xs mt-1 opacity-70">Sua carteira não possui pendências.</p>
                  </div>
                </div>
              ) : (
                alerts.map((alert) => {
                  const [icon, borderClass, hoverClass] = getSeverityStyles(alert.severity, alert.type);
                  return (
                    <div
                      key={alert.id}
                      className={`relative flex gap-4 p-4 rounded-xl border border-slate-800/60 bg-slate-900/40 transition-all duration-300 group ${hoverClass} ${borderClass}`}
                    >
                      {/* Ícone da Esquerda */}
                      <div className="mt-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        {icon}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-sm tracking-tight">{alert.ticker}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-800/80 px-1.5 py-0.5 rounded-[4px] border border-slate-700/50">
                              {alert.type}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pr-2">{alert.message}</p>
                      </div>

                      {/* Botão de Ação (Seta na direita) */}
                      <button
                        onClick={() => { onFixAsset(alert.asset_id); setIsOpen(false); }}
                        className={`shrink-0 self-center p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 duration-200 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${alert.severity >= 4
                            ? 'text-red-400 hover:bg-red-500/20 hover:text-red-200'
                            : 'text-blue-400 hover:bg-blue-500/20 hover:text-blue-200'
                          }`}
                        title={getActionLabel(alert.action)}
                      >
                        <span className="hidden sm:inline">{getActionLabel(alert.action)}</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            {/* Footer sutil */}
            {alerts.length > 0 && (
              <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800/50 text-[10px] text-slate-500 text-center font-medium uppercase tracking-wider">
                AssetFlow Intelligence
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
