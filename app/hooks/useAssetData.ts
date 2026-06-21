import useSWR, { mutate } from 'swr';
import { DashboardData } from '../types';
import { API_BASE_URL } from '../config/api';

// O fetcher padrão que o SWR vai usar
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erro API: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  if (data.status === 'Erro') throw new Error(data.msg || 'Erro desconhecido');
  return data;
};

export function useAssetData() {
  // 1. Hook para os dados principais (Dashboard)
  // refreshInterval: 60000 faz ele atualizar sozinho a cada 1 minuto se a janela estiver aberta
  const {
    data,
    error: errorDashboard,
    isLoading: loadingDashboard,
    mutate: mutateDashboard
  } = useSWR<DashboardData>('/api/index', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true
  });

  // 2. Hook para o histórico (pode ser carregado separado)
  const {
    data: history,
    error: errorHistory,
    isLoading: loadingHistory
  } = useSWR<any[]>('/api/history', fetcher);

  // Função para forçar atualização (ex: botão "Atualizar Agora")
  const refreshAll = async () => {
    // Primeiro chama a API forçando atualização no backend
    await fetch('/api/index?force=true');
    // Depois diz pro SWR revalidar os dados locais
    mutateDashboard();
  };

  return {
    data,
    history: history || [],
    loading: loadingDashboard || loadingHistory,
    error: errorDashboard ? errorDashboard.message : (errorHistory ? errorHistory.message : null),
    refetch: refreshAll
  };
}
