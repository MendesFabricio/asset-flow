'use client';

import { useState, useEffect } from 'react';
import { 
  Bell, AlertTriangle, CheckCircle, WifiOff, AlertOctagon, 
  Info, Settings, RefreshCw, ChevronRight, FileText, 
  Trash2, ArrowLeft 
} from 'lucide-react';
import { apiCall } from '../../utils/apiClient';

interface Alert {
  id: string;
  asset_id: number;
  ticker: string;
  type: string;
  message: string;
  field: string;
  severity: number;
  action: 'edit' | 'sync' | 'view' | 'refresh' | null;
}

interface PriceAlertNotification {
  ticker: string;
  condition: 'ABOVE' | 'BELOW';
  target_price: number;
  current_price: number;
  note: string;
  triggered_at: string;
}

interface ActivePriceAlert {
  id: number;
  ticker: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  note: string;
  created_at: string;
}

interface ActivePriceAlertsResponse {
  status: string;
  alerts: ActivePriceAlert[];
}

interface NotificationsProps {
  onFixAsset: (assetId: number) => void;
}

export function Notifications({ onFixAsset }: NotificationsProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [showActiveAlertsManager, setShowActiveAlertsManager] = useState(false);
  const [activePriceAlerts, setActivePriceAlerts] = useState<ActivePriceAlert[]>([]);
  const [loadingActiveAlerts, setLoadingActiveAlerts] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowActiveAlertsManager(false);
    }
  }, [isOpen]);

  const fetchActivePriceAlerts = async () => {
    setLoadingActiveAlerts(true);
    try {
      const data = await apiCall<ActivePriceAlertsResponse>('/api/price-alerts');
      if (data.status === 'Sucesso' && Array.isArray(data.alerts)) {
        setActivePriceAlerts(data.alerts);
      }
    } catch (err) {
      console.error("Erro ao buscar alertas ativos:", err);
    } finally {
      setLoadingActiveAlerts(false);
    }
  };

  useEffect(() => {
    if (showActiveAlertsManager) {
      fetchActivePriceAlerts();
    }
  }, [showActiveAlertsManager]);

  const handleDeletePriceAlert = async (alertId: number) => {
    try {
      const data = await apiCall<{ status: string }>('/api/price-alerts/' + alertId, {
        method: 'DELETE',
      });
      if (data.status === 'Sucesso') {
        setActivePriceAlerts(prev => prev.filter(alert => alert.id !== alertId));
      }
    } catch (err) {
      console.error("Erro ao deletar alerta ativo:", err);
    }
  };

  const fetchAlerts = async () => {
    try {
      const [alertsData, priceAlertsRes] = await Promise.all([
        apiCall<Alert[]>('/api/alerts'),
        apiCall<{ status: string; notifications: PriceAlertNotification[] }>('/api/price-alerts/notifications')
      ]);

      let newAlerts: Alert[] = [];
      if (Array.isArray(alertsData)) {
        newAlerts = [...alertsData];
      }

      if (priceAlertsRes && priceAlertsRes.status === 'Sucesso' && Array.isArray(priceAlertsRes.notifications)) {
        const mappedPriceAlerts: Alert[] = priceAlertsRes.notifications.map((n: PriceAlertNotification, idx: number) => {
          const severity = n.condition === 'BELOW' ? 4 : 5;
          const conditionText = n.condition === 'BELOW' ? 'caiu abaixo de' : 'subiu acima de';
          const noteText = n.note ? ` - Motivo: ${n.note}` : '';
          
          return {
            id: `price-alert-${n.ticker}-${n.triggered_at}-${idx}`,
            asset_id: 0,
            ticker: n.ticker,
            type: 'ALERTA',
            message: `[${n.ticker}] Alvo atingido: ${conditionText} R$ ${n.target_price.toFixed(2)}${noteText}`,
            field: 'price',
            severity: severity,
            action: null
          };
        });

        setAlerts(prev => {
          const prevPriceAlerts = prev.filter(a => a.id.startsWith('price-alert-'));
          const combined = [...newAlerts, ...prevPriceAlerts];
          mappedPriceAlerts.forEach(ma => {
            if (!combined.some(existing => existing.id === ma.id)) {
              combined.push(ma);
            }
          });
          return combined;
        });
      } else {
        setAlerts(prev => {
          const prevPriceAlerts = prev.filter(a => a.id.startsWith('price-alert-'));
          return [...newAlerts, ...prevPriceAlerts];
        });
      }
      setHasError(false);
    } catch (error) {
      console.error("Falha ao buscar alertas:", error);
      setHasError(true);
      setAlerts([]);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAlerts();
    }, 0);

    const interval = setInterval(fetchAlerts, 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const getSeverityStyles = (severity: number, type: string) => {
    if (severity === 5) {
      return {
        icon: <AlertOctagon size={18} className="text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.5)]" />,
        borderClass: "border-red-500/85 shadow-[inset_3px_0_0_0_rgba(239,68,68,0.6)] bg-red-950/5",
        hoverClass: "hover:bg-red-950/15"
      };
    }
    if (severity === 4) {
      return {
        icon: <AlertTriangle size={18} className="text-amber-500 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]" />,
        borderClass: "border-amber-500/85 shadow-[inset_3px_0_0_0_rgba(245,158,11,0.6)] bg-amber-950/5",
        hoverClass: "hover:bg-amber-950/15"
      };
    }
    if (type === 'CONFIG') {
      return {
        icon: <Settings size={18} className="text-blue-400 drop-shadow-[0_0_3px_rgba(96,165,250,0.5)]" />,
        borderClass: "border-blue-400/85 shadow-[inset_3px_0_0_0_rgba(96,165,250,0.6)]",
        hoverClass: "hover:bg-blue-950/15"
      };
    }
    if (type === 'OPORTUNIDADE') {
      return {
        icon: <RefreshCw size={18} className="text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]" />,
        borderClass: "border-emerald-400/85 shadow-[inset_3px_0_0_0_rgba(52,211,153,0.6)]",
        hoverClass: "hover:bg-emerald-950/15"
      };
    }
    if (type === 'NOVIDADE') {
      return {
        icon: <FileText size={18} className="text-purple-400 drop-shadow-[0_0_3px_rgba(192,132,252,0.5)]" />,
        borderClass: "border-purple-400/85 shadow-[inset_3px_0_0_0_rgba(192,132,252,0.6)]",
        hoverClass: "hover:bg-purple-950/15"
      };
    }
    return {
      icon: <Info size={18} className="text-slate-400" />,
      borderClass: "border-slate-800",
      hoverClass: "hover:bg-slate-900/50"
    };
  };

  const getActionLabel = (action: string | null) => {
    if (action === 'sync') return 'Sincronizar';
    if (action === 'refresh') return 'Verificar';
    if (action === 'view') return 'Ver';
    return 'Resolver';
  };

  const hasCritical = alerts.some(a => a.severity >= 4);

  return (
    <div className="relative select-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg transition-all border relative group ${
          isOpen
            ? 'bg-slate-900 border-slate-700 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)]'
            : 'bg-slate-900/60 hover:bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
        }`}
        title="Central de Notificações"
      >
        <Bell 
          size={16} 
          className={`transition-all duration-300 ${
            alerts.length > 0 
              ? 'text-amber-400 animate-[wiggle_1s_ease-in-out_infinite]' 
              : 'text-slate-400 group-hover:text-slate-200'
          }`} 
        />

        {alerts.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 border border-slate-950 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]">
            {alerts.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[0.5px]" onClick={() => setIsOpen(false)}></div>

          <div className="absolute right-0 mt-3 w-80 origin-top-right bg-slate-950 border border-slate-800 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            
            <div className="px-4 py-3 border-b border-slate-800/80 flex justify-between items-center bg-slate-950/50">
              <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider flex items-center gap-2">
                {showActiveAlertsManager ? 'Alertas Ativos' : 'Notificações'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowActiveAlertsManager(!showActiveAlertsManager)}
                  className={`p-1.5 rounded-lg border transition-all duration-200 ${
                    showActiveAlertsManager
                      ? 'bg-slate-900 border-slate-700 text-slate-200 hover:text-white'
                      : 'bg-slate-900/60 border-slate-850 text-slate-400 hover:text-slate-200'
                  }`}
                  title={showActiveAlertsManager ? "Voltar para Notificações" : "Gerenciar Alertas Ativos"}
                >
                  {showActiveAlertsManager ? <ArrowLeft size={13} /> : <Settings size={13} />}
                </button>
              </div>
            </div>

            <div className="max-h-[24rem] overflow-y-auto p-2 space-y-2 bg-slate-950/20 scrollbar-thin">
              {showActiveAlertsManager ? (
                loadingActiveAlerts ? (
                  <div className="text-center py-10 text-slate-500 flex flex-col items-center justify-center gap-2">
                    <RefreshCw size={20} className="animate-spin text-blue-500" />
                    <p className="text-[10px]">Carregando alertas...</p>
                  </div>
                ) : activePriceAlerts.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 flex flex-col items-center justify-center gap-2">
                    <Bell size={20} className="opacity-30" />
                    <p className="text-[10px]">Nenhum alerta de preço configurado.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activePriceAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-2.5 bg-slate-900/50 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-all gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-200 text-xs">{alert.ticker}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.25 rounded ${
                              alert.condition === 'ABOVE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/10' : 'bg-red-950 text-red-400 border border-red-500/10'
                            }`}>
                              {alert.condition === 'ABOVE' ? 'Acima ▲' : 'Abaixo ▼'}
                            </span>
                            <span className="text-xs font-mono font-bold text-blue-400">R$ {alert.target_price.toFixed(2)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeletePriceAlert(alert.id)}
                          className="p-1 bg-slate-950 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 rounded-md border border-slate-850 hover:border-rose-500/20 transition-all shrink-0"
                          title="Excluir Alerta"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : hasError ? (
                <div className="text-center py-10 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <WifiOff size={20} className="opacity-30 text-rose-500" />
                  <p className="text-[10px] font-medium">Falha na rede ou servidor instável.</p>
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-10 text-slate-500 flex flex-col items-center justify-center gap-3">
                  <div className="p-3 bg-emerald-500/5 rounded-full border border-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                    <CheckCircle size={24} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-300">Sem notificações ativas</p>
                    <p className="text-[10px] mt-0.5 opacity-60">Sua carteira está 100% monitorada.</p>
                  </div>
                </div>
              ) : (
                alerts.map((alert) => {
                  const { icon, borderClass, hoverClass } = getSeverityStyles(alert.severity, alert.type);
                  return (
                    <div
                      key={alert.id}
                      className={`relative flex gap-3 p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/30 transition-all duration-200 group ${hoverClass} ${borderClass}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {icon}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-200 text-xs">{alert.ticker}</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase bg-slate-900/60 px-1 py-0.25 rounded border border-slate-800">
                              {alert.type}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug pr-1">{alert.message}</p>
                      </div>

                      {alert.action && (
                        <button
                          onClick={() => { onFixAsset(alert.asset_id); setIsOpen(false); }}
                          className={`shrink-0 self-center p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 flex items-center text-[9px] font-bold uppercase tracking-wider ${
                            alert.severity >= 4
                              ? 'text-red-400 hover:bg-red-500/10'
                              : 'text-blue-400 hover:bg-blue-500/10'
                          }`}
                          title={getActionLabel(alert.action)}
                        >
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {alerts.length > 0 && (
              <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-900 text-[8px] text-slate-600 text-center font-bold uppercase tracking-widest select-none">
                AssetFlow Signal
              </div>
            )}
          </div>
        </>
      )}
      
      {/* Estilo para animação de balanço do sino */}
      <style jsx global>{`
        @keyframes wiggle {
          0% { transform: rotate(0); }
          15% { transform: rotate(8deg); }
          30% { transform: rotate(-8deg); }
          45% { transform: rotate(4deg); }
          60% { transform: rotate(-4deg); }
          75% { transform: rotate(2deg); }
          90% { transform: rotate(-2deg); }
          100% { transform: rotate(0); }
        }
      `}</style>
    </div>
  );
}
