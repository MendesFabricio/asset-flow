export const formatMoney = (v: number) => {
  return v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00';
};

export const getStatusBg = (status: string) => {
  switch (status) {
    case 'COMPRA_FORTE':
      return 'bg-green-500';
    case 'COMPRAR':
      return 'bg-blue-500';
    case 'AGUARDAR':
      return 'bg-yellow-500';
    default:
      return 'bg-slate-600';
  }
};
