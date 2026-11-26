# Roadmap profundo — AssetFlow (18/11/2026)

**Status:** diagnóstico completo + plano por fase
**Assigned:** `@orchestrator` → `@backend-specialist`, `@security-auditor`, `@frontend-specialist`, `@performance-optimizer`, `@test-engineer`
**Rodadas anteriores:** `auditoria-melhorias-assetflow.md` (concluída) · `auditoria-rodada-2.md` (concluída) · `otimizacao-e-limpeza.md` (pendente)

---

## 0. Status de execução — verificado em 18/11, commit `bb91fdf`

| Fase | Item | Status |
|---|---|---|
| F1 | A1 sem valuation → INCONCLUSIVO | ✅ `dashboard_metrics.py:210,219-229` |
| F1 | A2 veto de preço caro | ✅ `dashboard_metrics.py:211` (OR puro em Graham e Bazin) |
| F1 | A3 `quality_score == 0` penaliza | ✅ `:188` (`elif q_score < 45`) |
| F2 | B1 Gordon `g >= k` | ✅ guard antes do clamp, `calculator.py:67-68` |
| F2 | B2 DCF `gt >= w` | ✅ `calculator.py:90-91` |
| F2 | B3 VPA oficial não é bloqueado | ✅ `screener_service.py:229` (`not vpa`) |
| F2 | B4 Bazin com dividendo morto | ✅ `screener_service.py:129-130` (`div_12m <= 0 → None`) |
| F3 | C1 `modals` com `useMemo` | ✅ `useDashboardState.ts:88` |
| F3 | C2 keep-alive | ✅ `page.tsx:170` monta sem gate (solução melhor que a proposta) |
| F3 | C3 constantes de abas unificadas | ✅ `PORTFOLIO_ASSET_TABS` / `DASHBOARD_CONTENT_TABS` |
| F4 | B5 P/VP em USD | ✅ `dashboard_metrics.py:47` (`preco * fator`) |
| F4 | B6 FCF sintético | ✅ `dcf_is_estimate` presente |
| F4 | B7 ETF classificado como FII | ✅ `screener_service.py:146,158-159` |
| F4 | C4 downsample por envelope | ✅ `PerformanceAttributionChart.tsx:139-145` |
| F4 | C5 acessibilidade | ✅ 35 marcações (era ~1) |
| F5 | Livro de sinais | ✅ model + migration + alerta `SIGNAL_CHANGE` + backtest 30/90/180d + UI (`SignalsBookView.tsx`) |
| F6 | C6 `replaceState` | ✅ `:64` |
| F6 | D quant warm 30→60 min + cache prune | ✅ alinhado ao TTL de 1h + `prune_expired_system_cache` no job |

**Pendências fechadas:** A2 OR puro, F5 completo (backtest 30/90/180d + gráfico + alertas `SIGNAL_CHANGE` + testes `SignalsBookView.test.tsx`), `package-lock.json` sincronizado sem `@headlessui/react`, `cleanup_http_sessions` confirmado ativo via `@atexit.register` (`backend.py:222`), e limpeza de código/dependências mortas de `otimizacao-e-limpeza.md` concluídos.

**Verificação independente em 18/11 — 136 testes backend, 55 frontend (`SignalsBookView.test.tsx` adicionado), `tsc` limpo, lockfile sincronizado.**


---

## 1. Estado atual — medido, não estimado

| Métrica | Valor |
|---|---|
| Commits | 262 · branch `feature/valuation-radar-suite` · tree limpo |
| Backend | 22.988 linhas · **133 testes, 133 passando** |
| Frontend | 21.386 linhas · **53 testes, 53 passando** · `tsc --noEmit` limpo |
| Lint | **41 warnings**, 0 erros (era 52) |
| Domínios novos | `domain/valuation/` (Bazin, Gordon, DCF), `domain/quant/passive_income.py`, `infrastructure/screener_service.py` (447 linhas) |
| Features novas | Radar B3, Watchlist, Comparador, Renda Passiva, Valuation, sinais de estratégia |
| Jobs agendados | **9** (5min índices · 10min preços · 30min quant · 4h snapshot · 6h sentimento · 12h fundamentos · 3 crons) |

### Fechado desde a última rodada — não refazer

Verifiquei um por um no código atual:

- ✅ **CDI/IPCA reais** — `fixed_income.py:8-9` importa `get_cdi_period_return` e `get_monthly_ipca_series`. Acabaram as constantes 10,4% / 4,5%.
- ✅ **SAWarning de identity map** — `portfolio.py:536 session.expunge_all()`.
- ✅ **`url_validator` ligado** — 3 usos em produção (era 1, só em teste).
- ✅ **`/api/health` sem Yahoo** — `yf.Ticker` e `get_system_metrics` saíram do arquivo.
- ✅ **`psutil`** — saiu junto; não precisa entrar no requirements.

---

## 2. Área A — O sinal de investimento (dinheiro)

Esta é a área mais importante do projeto, e é onde está o defeito mais grave. Verifiquei os três no código.

### A1. Dado ausente não penaliza: ativo sem nenhum fundamentalista recebe "🟢 APORTAR" ⚠️ crítico

`services_modules/dashboard_metrics.py:133-135, 162-165, 174-181`

Nenhum ramo penaliza ausência de dado — o default é neutro:

- Graham só penaliza com `mg <= -20.0` (`:133`).
- **Bazin inteiro é pulado** com `if mg_bazin != 0.0` (`:165`) — e `0.0` é justamente "não sei".
- Qualidade é pulada com `if ... getattr(screener_item, "quality_score", None)` (`:174`).

Ativo sem LPA, VPA, dividendo e fora do cache do Radar: `+25` (abaixo do alvo) `+20` (RSI 28) `+10` (perto da mínima de 6m) `= 55` ≥ 55 → **"🟢 APORTAR"**. Com DY entra `+8` e chega a 63.

### A2. Ativo caro recebe APORTAR: não existe veto, o score é soma pura ⚠️ crítico

`services_modules/dashboard_metrics.py:128-171, 194-199`

Penalidade máxima por preço caro = **-25** (Graham -15 + Bazin -10). Bônus possível = **+81**.

Papel 20% acima do VI de Graham e do teto de Bazin, abaixo do alvo, DY>6%, RSI 29, perto da mínima, qualidade 80, sentimento positivo:
`+25 +8 +20 +10 -15 +10 -10 +8 = 56` → **"🟢 APORTAR"**.

> **A1 e A2 são o mesmo defeito de arquitetura:** `apply_strategy` é uma soma de bônus sem veto e sem exigência de dados mínimos. O conserto é **uma regra**, não dez remendos:
> 1. **Sem valuation calculável** (Graham e Bazin ambos ausentes/zero) → nunca emitir sinal de compra.
> 2. **Veto duro**: `mg_graham <= -20` **ou** `mg_bazin <= -20` → nunca `APORTAR`/`APORTAR FORTE`, independente do score.
> 3. Sinal precisa ser **explicável**: além de `motivos`, devolver `criterios_nao_avaliados` para a UI mostrar o que faltou.

### A3. `quality_score == 0` escapa da penalidade ⚠️ alto

`services_modules/dashboard_metrics.py:174-181`

`0` é falsy: o `elif 0 < q_score < 45` nunca roda para nota **0**. Só que `evaluate_fundamental_checklist` devolve exatamente **0** quando todos os critérios são `unknown` (`calculator.py:239-241`). Resultado: **ativo sem dado nenhum pontua melhor que ativo com dado ruim.**

Correção: `if screener_item is not None:` → `q is None` = penalidade de ausência; `q == 0 or q < 45` = -15.

---

## 3. Área B — O valuation exibido (desinformação na tela)

### B1. Gordon com `g >= k` devolve preço ≈ 223× o dividendo ⚠️ alto

`domain/valuation/calculator.py:67-71` — verificado por leitura:

```python
g_dec = max(-0.05, min(g / 100.0, k_dec - 0.005))
if k_dec <= g_dec + 0.004:     # ← NUNCA é verdade
    return None
```

O clamp garante `g_dec <= k_dec - 0.005`, logo `g_dec + 0.004 <= k_dec - 0.001 < k_dec`. **O guard é inalcançável.** Com `discount_rate=12` e `growth_rate=12` (livres na query, `valuation.py:110-111`): denominador `0.005` → preço = `D1/0,005` = **223× o dividendo**.

### B2. DCF idem: `terminal_growth >= w` infla o TV ~10× ⚠️ alto

`domain/valuation/calculator.py:91-93` — mesmo padrão, mesmo guard morto. Com `gt=12`, `w=12.5`: TV = **111× o FCF**.

**Correção de B1/B2:** validar `g_pct/100 >= k` → `return None` **antes** do clamp. Os dois modelos não são definidos para g ≥ k.

### B3. O VPA oficial (FNet) é bloqueado pelo P/VP do Yahoo ⚠️ alto — a correção de `6fa84a8` não chega no Radar

`infrastructure/screener_service.py:214-216`

```python
if ov.get("vpa") and ov["vpa"] > 0 and not pvp:   # guard usa PVP, não VPA
    vpa = float(ov["vpa"])
```

O Yahoo quase sempre devolve `priceToBook` → `not pvp` é `False` → o override de `manual_vpa` (VPA oficial) **é descartado**. FII com `bookValue` desatualizado usa Yahoo, o P/VP sai errado, e o checklist de FII (`calculator.py:141-148`, 1/4 do quality_score) inverte ágio/desconto. O fallback contaminando o principal — exatamente o que o commit queria evitar.

### B4. Bazin usa média de 5 anos: empresa que cortou dividendo mantém o teto ⚠️ alto

`screener_service.py:121-124, 229` — `base_div = div_avg_annual if div_avg_annual > 0 else div_12m`. Empresa zerou o provento nos últimos 12m mas pagou em 2021-2024 → teto de Bazin calculado sobre dividendo que não existe mais. Pela regra de Bazin, deveria ficar **sem teto**.

### B5. Ativo em USD: P/VP dividido por ~5,5 ⚠️ médio

`market_data.py:285-287` converte `lpa`/`vpa` para BRL, mas `dashboard.py:58,71` publica `preco_atual` em USD. `dashboard_metrics.py:47` faz `p_vp = preco / vpa` → USD/BRL. Mesmo erro em `risk.py:36`. Não quebra o sinal (Graham só entra em "Ação"), mas o número exibido está errado.

### B6. FCF sintético (`LPA × 0,7`) vira "DCF real" ⚠️ médio

`screener_service.py:205-207` — o FCF inventado vai para `calculate_dcf_price` e o resultado é exibido como valuation, sem marcar que é estimativa. Marcar `dcf_is_estimate: true` ou devolver `None`.

### B7. Classificação por sufixo `11` transforma ETF em FII ⚠️ baixo (só fora da carteira)

`screener_service.py:137` — `"FII" if clean_ticker.endswith("11") else "Ação"`. `BOVA11`, `IVVB11` (ETF) e `SANB11` (unit) caem no checklist de FII.

---

## 4. Área C — Performance do frontend

### C1. O `memo` da tabela nunca acerta — 3,3 re-render/s durante sync ⚠️ alto

`useDashboardState.ts:95` devolve `modals: { ... }` como **objeto literal novo a cada render**. `page.tsx:110-112` usa `useCallback(..., [modals])` → identidade nova → `AssetsTable` e `AssetRow` (ambos `React.memo`) re-renderizam sempre. E o `page.tsx` re-renderiza por causa do SSE (`sync_stream.py:47` reenvia payload a cada 0,3s durante sync).

**Custo:** 0,5 re-render/s em repouso, **3,3/s durante sync**, com **todas** as linhas no DOM (a virtualização foi removida em `9df7fb8`).

**Correção:** `useMemo` no objeto `modals` — ou passar os setters do zustand direto, sem aninhar. Uma linha restaura os dois `memo`.

### C2. O `keep tabs alive` é anulado ao abrir qualquer aba de ativo ⚠️ médio

`page.tsx:169` só monta `DashboardTabContent` se a aba estiver em `DASHBOARD_CONTENT_TABS`, que **não inclui** `Ação`, `FII`, `Internacional`, `Cripto`, `Reserva`. Ao abrir uma delas, o componente desmonta e o `visitedTabs` morre; voltando, o `useState` reinicializa com `['Resumo']`.

**Repro:** Resumo → Evolução → Ações → Evolução. Os 3 gráficos remontam e refazem 3 endpoints. O ganho do commit `7d0356b` se perde no caminho mais comum.

### C3. Oito listas de abas, duas já divergem ⚠️ médio (bug latente)

`page.tsx:44-63` · `useDashboardState.ts:6-27` · `DashboardTabContent.tsx:86-228` · `AssetsTable.tsx:22`

- `'Financeiro'` (legado) sobrevive em 3 listas e não existe em `CONTENT_TAB_IDS`; só funciona por tradução.
- `'Renda Fixa'` está fora de `isExcludedTab` e dentro das outras — nessa aba renderizam **os dois**: `FixedIncomeTab` e a tabela.

**Correção:** exportar `ASSET_TABS` e `CONTENT_TABS` de um único módulo e derivar tudo delas.

### C4. O downsample esconde picos ⚠️ médio

`PerformanceAttributionChart.tsx:138-146` — amostragem por passo: 200 pontos de ~2.500 → 1 a cada ~12 dias. **Um pico de um dia desaparece** — o que o gráfico existe para mostrar. E `historyRange === 'all'` também é truncado em 200.

**Correção:** envelope min/max por bucket (2 pontos por bucket, em ordem) preserva picos com o mesmo custo.

### C5. Acessibilidade do módulo novo ⚠️ médio

`app/features/valuation/components/` — **15 `<input>` sem nome acessível** (nenhum em `<label>`, nenhum `aria-label`), exemplo `RadarTab.tsx:208`. **20 `<th>` sem `scope="col"`**. É o único débito do módulo, que fora isso foi escrito com semântica correta.

### C6. `pushState` por clique de aba polui o histórico ⚠️ baixo

`useDashboardState.ts:61` — 10 cliques = 10 entradas; "voltar" navega entre abas. Se o objetivo é só deep-link/reload, é `replaceState`.

---

## 5. Área D — Orquestração (9 jobs)

`APScheduler` já usa `max_instances=1` (`worker.py:76`, `worker_state.py:81,128,138`), então **o mesmo job não roda em paralelo consigo**. O que resta:

| Item | Observação |
|---|---|
| `scheduled_quant_warm` a cada 30 min | O cache de risco tem TTL de **1h** (`risk.py:18`). Metade das execuções encontra cache fresco e não faz nada — e a outra metade roda Monte Carlo, correlação e fronteira eficiente. Alinhar para 60 min ou tornar sob demanda |
| Jobs diferentes podem se sobrepor | preços (10 min) e índices (5 min) batem no Yahoo e podem coincidir; CVM (12h) pode colidir com o brief das 7h |
| Radar às 08:15 | 120 tickers no universo (`tickers_cache.json`), `ThreadPoolExecutor(max_workers=4)`, staleness 12h, fonte yfinance — risco de rate limit parcial. Um refresh parcial parece sucesso |

---

## 6. Função nova que vale a pena: **livro de sinais**

Só uma. As outras 30 funcionalidades do app já existem — e as duas últimas que sugeri (watchlist, renda passiva) você construiu em 3 dias.

**O problema:** o app agora emite `COMPRA_FORTE / COMPRAR / OPORTUNIDADE / NEUTRO / REDUZIR`, e **não existe nenhuma forma de saber se o sinal acerta**. Pior: A1/A2 mostram que ele pode errar por construção. Sem medição, você não tem como melhorar os pesos.

**A solução (`SignalSnapshot`):** uma tabela `(asset_id, date, score, status, mg_graham, mg_bazin, quality_score)` gravada pelo job diário que já existe.

Isso destrava três coisas com o mesmo dado:

1. **Backtest dos sinais** — "quando o app disse APORTAR nos últimos 12 meses, qual foi o retorno em 30/90/180 dias?". É o número que valida ou mata o seu scoring.
2. **Alerta de mudança de sinal** — comparar com o snapshot anterior. Quando um ativo sai de NEUTRO para APORTAR, notificar. Reusa o `PriceAlert` que já existe.
3. **Auditoria do próprio score** — a série mostra quantas vezes o score passou de 55 por ausência de dado (A1). Você vê o defeito no gráfico em vez de descobrir depois.

Esforço: 1 migration + 1 job (já existe) + 1 endpoint + 1 gráfico. É a única função nova que torna as outras confiáveis.

**Não recomendo agora** (mas fica registrado): relatório mensal em PDF ("carta do mês" com atribuição + XIRR + sinais — reportlab já está lá), nem marcação a mercado de renda fixa com curva ANBIMA (esforço alto, só importa se vender antes do vencimento).

---

## 7. Skills e MCP para instalar

> ⚠️ **Leia isto primeiro.** Um *skill* é um conjunto de instruções que o agente segue **com acesso às suas ferramentas**. Instalar um pacote de terceiros é dar instruções a um agente que edita seu código e lê seu banco. Prefira repositórios oficiais; antes de instalar qualquer pacote comunitário, abra o `SKILL.md` e leia. Não instale coleção inteira — instale as 2 ou 3 que você vai usar.

### Oficial e recomendado

**1. `anthropics/skills`** — repositório oficial. Formato de pastas em `skills/`, você copia a que quiser para `.agents/skills/`.

| Skill | Por que serve pra você |
|---|---|
| **`webapp-testing`** | Você tem 133 testes de backend e 53 de unidade, e **zero teste de navegador**. Todos os bugs de frontend desta auditoria (memo, keep-alive, downsample) passariam por um teste de tela |
| **`skill-creator`** | Para escrever um skill seu, tipo `finance-review`, que codifica as regras que você já me deu: Bazin, Graham, veto de sinal, `Numeric(18,4)`, soft delete. Vira instrução permanente em vez de conversa |
| `pdf` / `xlsx` | Opcional — você já gera PDF com reportlab; o `xlsx` pode ajudar no IRPF/export |

```bash
git clone --depth 1 https://github.com/anthropics/skills.git /tmp/skills
# copie só as escolhidas
cp -r /tmp/skills/skills/webapp-testing  C:/Users/Fabricio/Projetos/asset-flow/.agents/skills/
cp -r /tmp/skills/skills/skill-creator   C:/Users/Fabricio/Projetos/asset-flow/.agents/skills/
```

**2. `github/awesome-copilot`** — repositório oficial do GitHub, com catálogo de skills instaláveis por CLI:
```bash
gh skills install github/awesome-copilot <nome-do-skill>
```

### Específico para o seu IDE

**3. `agentic-awesome-skills`** — instalador npm que suporta **Antigravity nativamente** (é o único que achei com suporte declarado ao seu IDE):
```bash
npx agentic-awesome-skills --antigravity
```
Instala no diretório que o Antigravity espera e traz os comandos `/brainstorming`, etc. **É a instalação de maior retorno por minuto** — mas revise o que ele adiciona ao projeto antes de commitar.

### Diretórios para procurar (não instalar em bloco)

- [agentskillshub.top](https://github.com/zhuyansen/agent-skills-hub) — diretório com 267k projetos, nota de segurança
- [claude-skills-live](https://github.com/pjdurden/claude-skills-live) — índice curado, re-verificado, remove repo morto
- [awesome-agent-skills](https://github.com/YangsonHung/awesome-agent-skills) — coleção por domínio
- [SKILLS-CLAUDE-CODE](https://github.com/artubss/SKILLS-CLAUDE-CODE) — 833 SKILL.md, mas é coletânea comunitária grande: **leia antes**
- [obra/superpowers-marketplace](https://github.com/obra/superpowers-marketplace) — marketplace de plugins

### MCP que vale mais que skill no seu caso

**Playwright MCP** — dá ao agente controle real do navegador: abre `assetflow.localhost`, clica nas abas, confirma que o gráfico renderiza e o tooltip está legível no modo claro. É o que falta para validar visualmente o que o `npm test` não vê (o `PassiveIncomeTab.test.tsx` já emite warning de `width(-1)` — em jsdom o gráfico não é medido).

---

## 8. Ordem de execução

```
F1  Sinais (A1+A2+A3)      ← dinheiro. Uma regra, não dez remendos
F2  Valuation exibido (B1-B4)
F3  Frontend perf (C1, C3, C2) ← C1 é uma linha, maior ganho
F4  Resto do valuation (B5-B7) + a11y (C5)
F5  Livro de sinais (função nova)
F6  Orquestração (D) + histórico (C6)
```

F1 antes de tudo: enquanto o app recomenda compra sem dado, o resto é decoração. F3 logo depois porque C1 é uma linha e devolve o desempenho de uma tabela inteira.

---

## 9. Prompt para o Argon (copiar e colar)

```
Leia `.agents/tasks/roadmap-profundo.md` e execute APENAS a Fase 1 (Área A — sinais de investimento).

Contexto:
- Projeto: C:\Users\Fabricio\Projetos\asset-flow (Flask + SQLite + SQLAlchemy 2 + Alembic + Next 16/React 19).
- Estado: 133 testes backend passando, 53 frontend, tsc limpo. Branch `feature/valuation-radar-suite`.
- Esta fase mexe em RECOMENDAÇÃO DE INVESTIMENTO. Errar aqui custa dinheiro real. Se não tiver certeza da regra, PARE e pergunte.

O defeito, em uma frase: `apply_strategy` é soma de bônus sem veto e sem exigência de dado mínimo. Verifiquei no código:
- A1: dado ausente não penaliza. Bazin é pulado com `mg_bazin != 0.0` (dashboard_metrics.py:165) e qualidade com `quality_score` falsy (:174). Ativo sem fundamentalista nenhum chega a 55 e recebe "APORTAR".
- A2: penalidade máxima por preço caro é -25 (Graham -15 em :134 + Bazin -10 em :170) contra +81 de bônus possível. Ativo 20% acima de Graham E de Bazin recebe "APORTAR".
- A3: `quality_score == 0` é falsy e escapa do `elif 0 < q_score < 45` (:179). E `calculator.py:239-241` devolve 0 quando todos os critérios são unknown — ou seja, ativo sem dado pontua MELHOR que ativo ruim.

Implemente exatamente três regras (não invente outras):
1. Sem valuation calculável (Graham e Bazin ambos ausentes/zero) → nunca emitir COMPRA_FORTE/COMPRAR/OPORTUNIDADE. Status `INCONCLUSIVO`.
2. Veto duro: `mg_graham <= -20` OU `mg_bazin <= -20` → nunca emitir sinal de compra, independente do score.
3. Devolver `criterios_nao_avaliados: []` no payload para a UI mostrar o que faltou.

Restrições:
- Não mudar os pesos existentes. Não recalibrar o score nesta fase.
- Não quebrar os 3 casos de `server/tests/test_valuation.py:174-223` sem justificar por quê.
- `Numeric(18,4)` para dinheiro; `Decimal` no cálculo.

Critérios de aceite (teste que FALHA antes da correção, para cada):
- Ativo sem LPA/VPA/dividendo/quality → não recebe sinal de compra (hoje recebe APORTAR).
- Ativo 20% acima de Graham e 20% acima de Bazin, com todos os bônus → não recebe sinal de compra.
- `quality_score = 0` recebe a penalidade de qualidade baixa, não o neutro.
- `pytest` 133+ verde, `npm test` 53+ verde, `tsc --noEmit` limpo.

Ao final: arquivos alterados, saída dos testes, e a tabela de antes/depois do status para os ativos da sua carteira.
```

---

## 10. O que não fazer

- **Não recalibrar os pesos do score** antes de existir o livro de sinais (F5). Sem medir, você troca um erro por outro.
- **Não remover o sinal de compra** para "resolver" A1/A2. O sinal é o produto — o conserto é veto e exigência de dado, não silêncio.
- **Não voltar a virtualização** em `AssetsTable` sem resolver o `flushSync` do React 19 (`9df7fb8`). O caminho é C1 (memo), que ataca a causa.
- **Não instalar coleção de skills inteira.** Leia o `SKILL.md` do que vai instalar.
- **Não mexer em `domain/quant/`** — a matemática de risco está correta e testada.
- **Não rodar o Radar sob demanda em cada request** — 120 tickers no yfinance; ele já tem cache de 12h por ticker.
