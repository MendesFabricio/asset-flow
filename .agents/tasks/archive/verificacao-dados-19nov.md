# Verificação de dados e funções — com o app rodando

**Data:** 19/11/2026 · **Método:** API real (`localhost:5328`) contra o SQLite real, com sessão válida gerada pelo próprio app
**Status das correções:** P1 (`VIVR3`/não-opções a R$ 0 ignoradas no IR em `tax_engine.py` e `annual_irpf.py`; 126 cartões de teste removidos e limpeza automática em `test_credit_cards_invoices.py`), P2 (série mensal alinhada ao diário + mês corrente vivo em `monthly_snapshot.py`; prefixo `No período —` em `ReturnsKpiCards.tsx`; `gordon_price` bloqueado para `AMER3`/sem DY válido) e P3 (`twr_clamped_months = 0` confirmado em `twr_pct = 49,9987%`) **implementados**. (`/api/history` downsample em cliente e amortização de tickers não importados no Radar mantidos como P3).

---

## 1. Como foi verificado

1. Inventário do banco real: 28 tabelas, 6 usuários, 2.344 KB.
2. Token de sessão gerado com `generate_session_token(1, "Fabricio", pwd_sig=hash[-16:])` — o mesmo caminho do login, incluindo a assinatura de senha.
3. **122 rotas** do Flask cruzadas contra as **105 chamadas de API do frontend**.
4. Números da API recomputados de forma independente a partir do banco.
5. IR recomputado à mão, transação por transação, e comparado com `/api/tax/monthly`.

---

## 2. Confirmado correto — com número

### 2.1 Toda chamada do frontend tem rota

105 endpoints distintos chamados pela UI; **11 sem correspondência, todos falsos positivos**:
`/api/test`, `/api/fail`, `/api/dedup`, `/api/abort`, `/api/empty`, `/api/import`, `/api/nodedup`, `/api/timeout`
são endpoints fictícios de `app/lib/api.test.ts`; `/api/jarvis` e `/api/quant` são fragmentos de string na lista de
timeouts de `app/lib/api.ts:17`; `/api/valuation/signals/history${qs}` é template com query string.

**Nenhuma chamada real aponta para rota inexistente.**

### 2.2 Os totais do dashboard batem com o banco, ao centavo

| Métrica | Banco (recomputado) | `/api/index` resumo |
|---|---|---|
| Total investido | R$ 48.097,36 | **48.097,3586** ✓ |
| Patrimônio (cotação) | R$ 47.942,39 | **47.942,39** ✓ |
| Lucro | R$ -154,97 | **-154,9686** ✓ |
| Posições ativas | 29 | **29 ativos** ✓ |
| Categorias no gráfico | 7 | **6 + Total** ✓ |

Categorias somam o total: Ação 13.196,21 + FII 12.516,38 + Internacional 7.390,76 + Renda Fixa 1.604,96 +
Reserva 12.244,73 + Cripto 989,35 = **47.942,39** ✓

Dividendos: banco R$ 12.101,48 vs `attribution.total_dividendos` R$ 12.101,49 (1 centavo de arredondamento) ✓

### 2.3 A atribuição fecha as identidades contábeis

```
soma(variacao_mercado da série) = -1.210,45  =  total_variacao_mercado  ✓
soma(aportes_liquidos da série) = 49.386,99  =  total_aportes_liquidos   ✓
retorno_total_acumulado 10.891,04 = -1.210,45 (mercado) + 12.101,49 (dividendos)  ✓
último patrimonio_fim 48.176,54  =  summary.patrimonio_atual  ✓
```
80 meses de série · `ipca_source: bcb_cache` · `ipca_fallback_months: 1` (só 1 mês estimado em 80) ✓

### 2.4 O motor de IR está correto

Recomputei mês a mês e o lucro bate com precisão de centavo:

| Mês | Meu cálculo (lucro) | `/api/tax/monthly` |
|---|---|---|
| 2025-12 | -271,68 (ações) | **-271,681191** ✓ |
| 2025-04 | +3,60 | **+3,60275** ✓ |
| 2026-01 | -1.487,89 | **-1.487,892** ✓ |

- Separação de buckets correta: 2025-12 teve prejuízo total de 595,35, dividido pela API em
  `stocks_st: 271,68` + `fiis: 323,67` = **595,35** ✓
- Isenção de R$ 20 mil aplicada corretamente: vendas de dez/2025 = R$ 2.628,41 → isento, DARF 0 ✓
- `details[]` traz transação a transação com `sale_value`, `cost_value` e `profit` — conferi ITUB3
  (4,23 − 4,2281 = 0,0019) ✓
- DARF zero em todos os meses é **correto**, não bug: as vendas dele nunca passaram de R$ 20 mil.

### 2.5 O IRPF anual reconstrói o patrimônio na data certa

`annual_irpf.py:36-45` filtra `transaction_date <= 31/12/ano`. Para 2025 retorna **26 itens** somando
**R$ 30.221,52** — que é o patrimônio de 31/12/2025, não o de hoje (R$ 48.097,36). 24 posições têm
histórico anterior a 2026; as 5 restantes nasceram em 2026. **Método correto.**

O item traz `description` pronta para a declaração ("90 ações de AURE3 (AUREN ON NM). CNPJ: ... adquiridas
ao custo total de R$ 1.080,79 (Preço Médio de R$ 12,01)") ✓

E `rendimentos_isentos` de 2025: dividendos 2.797,04 + lucro em vendas < 20k 3,60 = **2.800,64** ✓

### 2.6 Todos os gráficos do quant têm dados

| Endpoint | Status | Conteúdo |
|---|---|---|
| `/api/quant/efficient-frontier` | 200 | `cloud`, `frontier`, `max_sharpe`, `min_vol` |
| `/api/quant/sharpe-rolling` | 200 | `dates`, `series` |
| `/api/quant/kelly-criterion` | 200 | `data` |
| `/api/quant/momentum-ranking` | 200 | `data` |
| `/api/quant/fear-greed` | 200 | `data` |
| `/api/quant/rebalance-bands` | 200 | `data` |
| `/api/quant/dca-lump-sum` | 200 | `dca`, `lump_sum`, `history` |
| `/api/quant/attribution-analysis` | 200 | `portfolio_alpha_pct`, `beta`, `return_pct` |
| `/api/quant/reports` | 200 | `reports` |
| `/api/valuation/radar` | 200 | **103 itens**, `sector_averages`, `sectors` |
| `/api/valuation/signals/history` | 200 | `items`, `summary` |
| `/api/performance/attribution` | 200 | 80 meses |
| `/api/history` | 200 | 2.397 pontos |
| `/api/portfolio/monthly-evolution` | 200 | 80 meses + `asset_performance` |

---

## 3. Inconsistências entre telas (números certos, leitura confusa)

### 3.1 O mesmo "patrimônio" vale R$ 47.942 em uma tela e R$ 48.176 em outra ⚠️ médio

| Endpoint | `patrimonio_atual` |
|---|---|
| `/api/index` (dashboard) | **47.942,39** — preço de mercado agora |
| `/api/performance/returns` | 47.942,39 ✓ |
| `/api/performance/attribution` | **48.176,54** — último **fechamento mensal** |

Diferença: **R$ 234,15 (0,49%)**. Não é erro de cálculo: a atribuição usa o último snapshot fechado, o
dashboard usa cotação ao vivo. O problema é que as duas telas rotulam como "patrimônio atual".

**Correção:** rotular na atribuição "fechamento de 10/2026" ou atualizar o mês corrente com preço vivo.

### 3.2 XIRR anualizado e benchmarks acumulados na mesma linha de cards ⚠️ médio

- `xirr_aa_pct` = **7,3% a.a.** (anualizado)
- `cdi_pct` = **91,83%** , `ibov_pct` = **120,86%**, `ipca_pct` = **44,63%** — todos **acumulados em 2.401 dias** (6,6 anos)

São grandezas diferentes exibidas lado a lado. CDI 91,83% em 6,6 anos ≈ 10,3% a.a. — o número está certo,
mas quem lê "CDI: +91,83%" ao lado de "TIR: 7,3% a.a." compara o incomparável.

`pct_cdi` = 64,2% está internamente consistente (58,93 / 91,83) ✓

**Correção:** sufixar "no período" nos benchmarks, ou anualizar todos.

### 3.3 `twr_pct` = exatamente 50,0 — valor redondo demais para ser coincidência 🟡

`twr_pct: 50.0` com `xirr_periodo_pct: 58.93`. Pode ser composição legítima (Modified Dietz encadeado em
80 meses), mas um valor exatamente 50,00 pede conferência: há clamp de retorno mensal em ±5,0 e −0,95
(`xirr.py`), então um mês distorcido pode ter sido truncado.

**Correção:** conferir se algum mês bateu no clamp e expor quantos meses foram truncados.

---

## 4. Anomalias de dados no banco

### 4.1 18 vendas com valor R$ 0 — 16 são corretas, 2 não ⚠️ médio

Investiguei uma por uma. Os tickers são códigos de **opção**: `BHIAL700`, `MGLUH350`, `VIIAH230`, `BBDCQ10`,
`BOVAQ101`, `PETRD304`… Uma opção que vira pó é registrada como SELL de valor 0 com `cost_basis` do prêmio —
**contabilidade correta** (perdeu o prêmio), e o prejuízo de R$ 2.715,19 é legitimamente dedutível.

As duas exceções:

| id | Ativo | Categoria | Qtd | Custo | Data | Problema |
|---|---|---|---|---|---|---|
| 926 | **VIVR3** | **Ação** | 120 | R$ 12,40 | 05/01/2026 | ação vendida por R$ 0 → prejuízo fantasma de **R$ 1.487,89** |
| 893 | IRIM11 | FII (fração) | 0,19 | R$ 96,30 | 03/12/2025 | fração baixada a zero → impacto R$ 18,30, irrelevante |

**A VIVR3 é a única anomalia material:** R$ 1.487,89 de prejuízo em janeiro/2026 que provavelmente não
existe. Ao 15%, isso vale **~R$ 223 de imposto deduzido a mais** no futuro. Vale conferir se foi uma
baixa manual ou um resíduo de importação.

### 4.2 126 de 128 cartões são de teste ⚠️ alto (polui a tela)

```
credit_cards user 1 ....... 128
  com nome "Cartão Teste ..."  126
```
A aba Cartões mostra 126 cartões fictícios. É resíduo das suítes de teste rodando contra o banco real
(`test_credit_cards_invoices.py` cria cartões com `uuid` no nome).

**Correção:** limpar (`is_deleted = 1` onde `name LIKE 'Cartão Teste%'`) e fazer os testes usarem um banco
temporário — hoje eles escrevem no banco de produção.

### 4.3 Uma linha do Radar é internamente inconsistente ⚠️ médio

`AMER3`: `gordon_price = 194,29` com `price = 4,07` — **47× o preço**. Pela fórmula (k=12%, g=5%),
`div_ps` implícito = 13,60. Mas o `dy_12m` máximo do Radar é 34,25%; um dividendo de R$ 13,60 num papel de
R$ 4,07 seria DY de 334%. **Os campos da mesma linha não podem ter vindo da mesma coleta** — provável
linha antiga com preço novo, ou cache misturado.

### 4.4 DY de até 34,25% no Radar — a correção da amortização só cobre o que você importou 🟡

O I1 foi corrigido com `collect_amortization_12m_map` (tabela `Dividend` local). Para os **103 tickers do
Radar**, só existe amortização registrada dos ativos que passaram pela sua carteira. Nos demais, o
`dy_12m` continua vindo do Yahoo com amortização embutida — e 34% de DY é sinal disso.

### 4.5 `/api/history` devolve 2.397 pontos (545 KB) para o gráfico mostrar 200 🟡

O downsample é no cliente. O payload trafega ~9× mais do que é exibido.

---

## 5. O que NÃO foi verificado

- **Não vi os gráficos renderizados.** Confirmei que todos os endpoints respondem com dados e que os números
  reconciliam com o banco. Renderização (Recharts, eixos, tooltips, tema claro) não foi observada — para isso
  seria necessário abrir a tela (Playwright MCP ou manualmente).
- **Não validei os valores de mercado** (cotação das ações contra a B3). Comparei a API com o banco; se o
  `market_data` estiver velho, os dois concordam no erro. Conferi que 29/29 posições têm cotação.
- **Não executei o worker** para ver os jobs rodando.
- **Não testei login por senha** (não tenho a senha); gerei o token pelo mesmo caminho interno, o que valida
  a assinatura mas não o `check_password_hash`.
- **Não verifiquei os 6 usuários** — tudo aqui é user 1 (`Fabricio`).

---

## 6. Prioridade das correções

| P | Item | Impacto |
|---|---|---|
| **P1** | VIVR3 vendida por R$ 0 (R$ 1.487,89 de prejuízo fantasma no IR) | imposto |
| **P1** | 126 cartões de teste no banco de produção | tela mostra dado falso |
| **P2** | `patrimonio_atual` divergente entre dashboard e atribuição (R$ 234) | confiança |
| **P2** | Benchmarks acumulados ao lado de XIRR anualizado | leitura errada |
| **P2** | Linha do Radar com `gordon_price` 47× o preço (AMER3) | valuation exibido |
| **P3** | `twr_pct` exatamente 50,0 — conferir clamps | confiança |
| **P3** | `/api/history` 545 KB para 200 pontos | performance |
| **P3** | DY do Radar sem amortização para ticker não importado | yield inflado |
