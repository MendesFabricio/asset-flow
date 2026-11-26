# Verificação: evolução patrimonial e preço médio — 19/11/2026

**Método:** API real contra SQLite real, recomputação independente.
**Status das correções:** P1 (`BONUS` mantido com `unit_cost` fiscal atribuído da Receita Federal/B3 em `portfolio.py` — quando `unit_cost > 0` soma `added_qty * unit_cost`, quando `0` dilui custo), P2/P3/P4 (`ADJUSTMENT` em `monthly_snapshot.py`, snapshots mensais alinhados aos diários e mês corrente calculado ao vivo para bater com `/api/index`) **implementados**.
**Cobertura:** 29 posições ativas, 946 transações, 2.397 snapshots diários, 80 meses, 1.178 proventos, 149 despesas de cartão.

---

## 0. Resultado

**A maior parte está correta e bem construída.** A evolução diária é impecável (2.397 pontos, zero violação de identidade). O preço médio está certo em 26 das 29 posições. Os dividendos estão modelados com rigor — três tipos, bruto e líquido separados.

**Três problemas reais**, dois deles afetando número na tela:

| # | Problema | Impacto |
|---|---|---|
| P1 | **BONUS infla o preço médio** | **R$ 506,51** no custo → lucro exibido **−154,97** quando o real é **+351,54** |
| P2 | Série mensal ≠ série diária | até **R$ 1.531** de divergência entre gráficos |
| P3 | Custo de novembro no mensal está velho | `unrealized` de novembro superestimado em **R$ 1.123,27** |

---

## 1. Preço médio — 26 de 29 corretos

Derivei cada posição por **duas formas independentes** — replay de BUY/SELL com PM inalterado na venda, e custo remanescente via `cost_basis` das vendas — e comparei com o gravado.

### Corretos por replay direto (19 posições)
Buffer, CPLE6, EGIE3, ITSA4, KLBN11… o replay BUY/SELL bate **exatamente** com `positions.quantity` e `positions.average_price`.

### Corretos por evento societário (5 posições)

| Ativo | Gravado (qty/pm) | Custo gravado | Custo do ledger | Veredicto |
|---|---|---|---|---|
| GGRC11 | 100 / 10,8016 | 1.080,16 | 1.080,16 | ✅ bônus de 81,8% |
| HGBS11 | 50 / 20,4960 | 1.024,80 | 1.024,80 | ✅ bônus de 257% |
| CPLE3 | 70 / 7,7472 | — | só `TICKER_CHANGE_IN` q=70 pm=7,7472 | ✅ idêntico ao evento |
| ISAE4 | 35 / 25,3040 | — | só `TICKER_CHANGE_IN` q=35 pm=25,304 | ✅ idêntico |
| JBSS32 | 15 / 39,9684 | — | só `TICKER_CHANGE_IN` q=15 pm=39,9684 | ✅ idêntico |

**Custo preservado nos desdobramentos** — a invariante que importa está respeitada.

### Aceitáveis: as duas caixinhas

`NUBANK RESERVA` (pm 1.823,28) e `NUBANK TURBO` (pm 9.559,75) têm PM que não vem do ledger (único BUY registrado: 1.000 e 9.259,75). São posições de caixa, editadas manualmente (`update_position`). O preço de mercado (2.121,50 e 10.123,23) é maior que o PM, então aparece lucro de R$ 861,70 nas duas — o que é aceitável para caixinha com rendimento, mas mostra que **a edição manual ainda não gera transação de ajuste** (o `ADJUSTMENT` existe no replay, mas não há nenhum no banco).

### ❌ Errados: bônus que aumenta o custo (3 posições)

| Ativo | Custo gravado | Custo correto | Inflado |
|---|---|---|---|
| GOAU4 | 1.019,28 | 826,27 | **+193,01** |
| ITUB3 | 1.040,32 | 910,60 | **+129,72** |
| ROMI3 | 2.105,98 | 1.922,20 | **+183,78** |
| | | | **+506,51** |

**Causa raiz** — `services_modules/portfolio.py:455-463`:

```python
elif action_type == "BONUS":
    percent = Decimal(str(payload.get("percent", 0)))
    unit_cost = Decimal(str(payload.get("unit_cost", 0.0)))
    added_qty = old_qty * (percent / Decimal("100"))
    new_qty = old_qty + added_qty
    if new_qty > 0:
        new_pm = ((old_qty * old_pm) + (added_qty * unit_cost)) / new_qty
```

Bonificação é **gratuita**: você recebe ações sem pagar. O custo total não muda, logo
`new_pm = (old_qty × old_pm) / new_qty`. O código soma `added_qty × unit_cost` ao custo — e o
`unit_cost` gravado nos eventos dele é o **preço de mercado** na data (GOAU4: R$ 8,30).

Prova no GOAU4: 77 ações a PM 10,7662 (custo 829,00). Bônus de 30,3% → 100,33 ações.
Correto: PM = 829,00/100,33 = **8,2627**. Gravado: **10,1928** — exatamente o `unit_price` do evento.

**Efeito no total do dashboard:**

```
como o app mostra:   lucro = 47.942,39 − 48.097,36 = −154,97  (prejuízo)
corrigindo o bônus:  lucro = 47.942,39 − 47.590,85 = +351,54  (lucro)
```

O app está exibindo **prejuízo onde há lucro**, uma inversão de sinal de R$ 506,51.

> **Correção:** `new_pm = (old_qty * old_pm) / new_qty` e ignorar `unit_cost` para BONUS.
> O replay (`:372`) apenas lê `t.unit_price`, então corrigir o valor gravado no evento também
> corrige o replay. Os 3 ativos precisam de recálculo do PM (replay do ledger).

---

## 2. Evolução patrimonial — a série diária está impecável

| Verificação | Resultado |
|---|---|
| Pontos | **2.397**, de 24/04/2020 a 19/11/2026 |
| Datas duplicadas | **0** |
| `UNIQUE (user, date)` | ✅ presente (`_user_date_snapshot_uc`) |
| Identidade `lucro = equity − investido` | **2397/2397 OK** |
| `sum(breakdown) = total_equity` | 0 divergências nos últimos 400 |
| Continuidade | 2021–2025 com 365/366 dias cada (todo dia, inclusive fim de semana) |

O backfill e o snapshot diário estão corretos. Nada a corrigir aqui.

### A série mensal, porém, conta outra história ⚠️ P2

| Mês | `monthly` | último snapshot diário do mês | Diferença |
|---|---|---|---|
| 2026-06 | 49.240,82 | 48.333,16 | **−907,66** |
| 2026-07 | 49.299,34 | 48.234,48 | **−1.064,86** |
| 2026-08 | 49.246,50 | 48.024,45 | **−1.222,05** |
| 2026-09 | 49.742,56 | 48.368,39 | **−1.374,17** |
| 2026-10 | 48.795,93 | 47.264,56 | **−1.531,37** |
| 2026-11 | 48.176,54 | 48.176,54 | ✅ **OK** |

**Causa:** metodologias de preço diferentes nos dois caminhos.

- Mês **fechado** → reconstruído de histórico Yahoo (`monthly_snapshot.py:133` `auto_adjust=False` + fator de split em `:173`)
- Mês **corrente** → recalculado com preço vivo a cada 4h (commit `3498c5e`)

Por isso novembro bate exatamente e os meses fechados não. **Consequência prática:** o gráfico de atribuição (mensal) e o de histórico (diário) mostram valores diferentes para os mesmos meses — e **no fechamento de cada mês o ponto pode saltar** de ~R$ 1.500 quando troca de metodologia.

### Custo de novembro está velho ⚠️ P3

```
monthly 2026-11: total_invested_cost = 46.974,09
custo real hoje:                       48.097,36
diferença:                             +1.123,27
```
É exatamente a edição das duas caixinhas em 18/11 (823,28 + 300,00). O `total_market_value` de novembro foi atualizado, o custo não — então `unrealized_pnl` de novembro está superestimado em R$ 1.123,27.

### O último ponto do histórico ≠ o dashboard ⚠️ P4

```
/api/history (último)  : Patrimônio 48.176,54 · Investido 48.097,36 · Lucro +79,18
/api/index (resumo)    : Total      47.942,39 · TotalInvestido 48.097,36 · Lucro −154,97
```
R$ 234,15 de diferença (0,49%). **Esperado**: o snapshot é do momento em que o worker rodou, o dashboard é cotação viva. O problema é só apresentação — as duas telas dizem "hoje", e os dois lucros têm sinais opostos na mesma sessão.

---

## 3. O que eu conferi e está correto

### Dividendos — modelagem séria ✅

Três tipos, cada um com tratamento fiscal próprio:

| Tipo | Qtd | Total |
|---|---|---|
| Rendimento (FII) | 636 | R$ 5.632,55 |
| Dividendo | 339 | R$ 5.458,88 |
| Juros Sobre Capital Próprio | 203 | R$ 1.010,05 |
| **Total** | 1.178 | **R$ 12.101,48** ✓ bate com a atribuição |

**326 proventos têm `total_value ≠ value_per_share × quantity`** e isso é **correto**:
`value_per_share` é o **bruto** anunciado, `total_value` é o **líquido recebido**. O fator distribui-se em
1,00 (851 proventos, sem retenção), 0,85 (52 — JCP com IRRF de 15%), 0,75–0,81 (76) e outros.
Soma bruta 12.309,78 − retenções 208,40 = **12.101,38** ✓ consistente.

E a separação para o IRPF está certa: dividendo/FII em `rendimentos_isentos`, JCP em
`rendimentos_exclusivos` (tributado na fonte).

### Cartões ✅
149 despesas, **0 divergências**: a soma das parcelas sempre iguala o total da despesa.

### Cotações ✅
29/29 posições com preço. Só as duas caixinhas têm preço de 4 dias — e são manuais por natureza.

### Sinais ✅
58 registros em 2 dias (18 e 19/11), scores de −42 a 86, com status distribuídos
(NEUTRO 32, COMPRA_FORTE 17, COMPRAR 6, REDUZIR 2, **INCONCLUSIVO 1**). A regra A1 está ativa —
há um ativo sendo corretamente classificado como inconclusivo.

---

## 4. Não verificado

- **Não vi os gráficos renderizados** — validei os dados que os alimentam, não o desenho.
- **Recebíveis por devedor**: minha consulta somou pagamentos por usuário, não por contrato; o total
  (emprestado 2.438,32 / recebido 1.602,00) não permite concluir se cada contrato fecha.
- **Preço médio das posições já encerradas** (quantity = 0) não foi conferido — só as 29 ativas.
- **Não validei as cotações contra a B3**; comparei API contra banco.

---

## 5. Prioridade

| P | Item | Onde |
|---|---|---|
| **P1** | Bônus não pode aumentar o custo (`new_pm` sem `unit_cost`) + recálculo dos 3 ativos | `portfolio.py:463` |
| **P2** | Unificar a fonte de preço do mensal (usar o mesmo caminho do diário) ou documentar a diferença | `monthly_snapshot.py:133` |
| **P2** | Propagar edição manual para o snapshot mensal do mês corrente | job de 4h |
| **P3** | Rotular no gráfico que o último ponto é snapshot, não cotação viva | `HistoryChart` |
