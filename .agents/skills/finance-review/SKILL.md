---
name: finance-review
description: Regras financeiras permanentes do AssetFlow para validação de sinais (apply_strategy), modelos de valuation (Bazin, Graham, Gordon, DCF), precisão decimal, moedas e privacidade.
---

# Finance Review — AssetFlow

Regras obrigatórias ao criar ou alterar lógica financeira, valuation, sinais ou UI de valores:

## 1. Sinais de Investimento (`apply_strategy`)
- **Exigência de valuation mínimo por classe**:
  - `Ação`: exigir pelo menos um valuation calculável (`mg_graham != 0` ou `mg_bazin != 0`). Sem valuation → nunca emitir `COMPRA_FORTE`, `COMPRAR` ou `OPORTUNIDADE` (retornar `status = "INCONCLUSIVO"`).
  - `FII`: exigir `p_vp > 0` (com VPA > 0) ou `mg_bazin != 0`. Sem valuation → `status = "INCONCLUSIVO"`.
  - `Cripto`, `Internacional`, `Reserva`, `Renda Fixa`: não exigir Graham/Bazin.
- **Veto duro de ativo caro**:
  - `Ação`: se `mg_graham <= -20` ou (`mg_graham <= 0` e `mg_bazin <= -20`) → vetar compra (`NEUTRO` / `🟡 MANTER`), independente do score acumulado.
  - `FII`: se `p_vp >= 1.05` ou `mg_bazin <= -20` → vetar compra (`NEUTRO` / `🟡 MANTER`).
- **Qualidade (`quality_score`) e critérios não avaliados**:
  - Nunca ignorar `quality_score == 0` com checagem truthy (`0` recebe penalidade `-15`; apenas `None` representa ausência de dado).
  - Sempre popular `criterios_nao_avaliados` listando critérios ausentes para transparência na UI.

## 2. Modelos de Valuation
- **Gordon & DCF**: validar `g / 100 >= k` (`gt / 100 >= w`) e retornar `None` **antes** de qualquer clamp.
- **Bazin**: exigir dividendo nos últimos 12 meses (`div_12m > 0`); empresa que zerou proventos nos últimos 12m fica sem teto Bazin.
- **Hierarquia de VPA**: VPA oficial (`manual_vpa` / FNet CVM / PL CVM ÷ Market Cap) prevalece sobre `priceToBook` do Yahoo Finance.
- **Moeda USD vs BRL**: ativos em USD devem multiplicar `preco * fator` (taxa USD/BRL) antes de dividir por `vpa` (já convertido para BRL).
- **FCF sintético**: quando FCL/ação for estimado por fallback (`LPA * 0.7`), sinalizar `dcf_is_estimate = True`.

## 3. Banco de Dados, Tipos e UI
- Valores monetários e quantidades no banco usam `Numeric(18, 4)` e cálculos financeiros usam `Decimal`.
- Soft deletes onde aplicável e `safe_commit` nas gravações SQLite.
- Componentes de UI e gráficos devem respeitar `usePrivacy().isHidden` e usar tokens semânticos de tema (`bg-surface`, `bg-surface-card`, `text-text-primary`, etc.).
