# Validação de indicadores e uso de IA — AssetFlow

**Data:** 18/11/2026 · **Escopo:** indicadores fundamentalistas (ação + FII), checklist de saúde, e todos os usos de IA
**Método:** leitura de código com `arquivo:linha` + verificação manual das afirmações de maior impacto
**Status:** P0 (`A1`, `A2`, `I1`), P1 (`I3`, `I4`, `I5`, `I2`, `A3`, `A6`), P2 (`I6`, `A5`, `A7`), `I10` e `§3` (Número Mágico) **implementados**; itens `I7`, `I8`, `I9`, `I11`, `A4`, `A8-A12` seguem como melhorias futuras de menor risco.

---

## 0. Veredicto

**As fórmulas estão certas. O problema é de onde vem o número, e o que o app faz com ele.**

Bazin, Graham, Gordon e a estrutura do DCF estão implementados corretamente — não há erro aritmético
nas fórmulas clássicas. O que compromete a leitura de saúde é outra coisa: um mesmo indicador tendo
duas fontes diferentes, amortização de FII contada como rendimento, um score de qualidade que premia
dado escasso, e thresholds únicos aplicados a setores que não se comparam.

**Na IA, o contrato técnico está bem feito** (JSON validado, whitelist, fallback, cache) — e é o
sentimento que sustenta tudo isso. O problema é que ele **escala dinheiro real** e é não-determinístico.

---

## 1. Tabela de veredicto por indicador

| Indicador | Fórmula | Fonte | Veredicto |
|---|---|---|---|
| **Bazin** | `div / (dy/100)` — correto | 5 anos no Radar · 12m na carteira | ⚠️ **Duas réguas** |
| **Graham** | `√(22,5 × LPA × VPA)` — correto (1974) | Yahoo TTM; CVM só como fallback | ⚠️ Fonte secundária |
| **Gordon** | `D1/(k−g)`, k=12%, g=5% | Yahoo | ❌ **Aplicado a FII sem guard** |
| **DCF** | 5 anos + Gordon terminal, guards ok | Yahoo; `LPA×0,7` se faltar | ✅ Correto (`dcf_is_estimate` avisa) |
| **P/L** | `preco/LPA`, 0–15 pass | Yahoo `trailingPE` | ✅ Correto |
| **P/VP** | `preco/VPA`, 0,75–1,02 (FII) | Yahoo `bookValue`; FNet para FII | ✅ Corrigido (USD e FNet) |
| **ROE** | `≥15% pass` | Yahoo, **sem normalizar escala** | ⚠️ Pode vir 100× |
| **Margem Líquida** | `≥10% pass` | idem | ⚠️ idem + threshold setorial |
| **Dívida Líq/EBITDA** | `≤2,5x pass` | Yahoo | ⚠️ Inaplicável a banco |
| **DY** | 12m / preço | Yahoo `dividends` | ❌ **FII: inclui amortização** |
| **Fórmula Mágica** | `1/EV/EBITDA` + ROA | Yahoo | ⚠️ Desvia de Greenblatt |
| **Número Mágico** | `12/dy` | calculado | ✅ Correto (ver §3) |

---

## 2. Achados de indicadores — por impacto na decisão

### I1. DY de FII inclui amortização, e amortização não é rendimento ⚠️ ERRADO

`screener_service.py:111,127` soma `yf_ticker_obj.dividends` sem separar tipo. O Yahoo registra
amortização de FII na mesma série.

O próprio projeto sabe que não é rendimento: `portfolio.py:621-626` trata `AMORTIZATION` como evento
que **reduz o preço médio**, e `annual_irpf.py:20` a mapeia como redutora de custo. O screener ignora
essa classificação.

**Efeito em cascata:** DY inflado → critério "DY ≥ 8,5%" passa indevidamente → **teto de Bazin sobe**
(`div/8%`) → o FII parece mais barato do que é. Quem compra pelo yield está comprando de volta parte
do próprio capital.

**Correção:** usar a tabela `Dividend` local (que tem `type`) em vez da série crua do Yahoo; enquanto
isso, rotular na tela como "provento total (inclui amortização)".

### I2. O mesmo ativo tem dois tetos de Bazin diferentes ⚠️ ENGANOSO

| Caminho | Base | Linha |
|---|---|---|
| Radar / screener | média de **5 anos** | `screener_service.py:131` |
| Carteira / dashboard | últimos **12 meses** | `dashboard_metrics.py:36` |

O mesmo papel pode aparecer **abaixo do teto no Radar e acima na carteira**, no mesmo dia, pelo mesmo
método. E o guard de `:129` só protege o caso extremo (`div_12m == 0` → `None`): se o dividendo caiu
de R$ 2,00 para R$ 0,50, o teto segue calculado sobre ~R$ 1,50.

**Correção:** uma fonte só (12m), e devolver `bazin_base: "12m" | "5y"` no payload para a tela não mentir.

### I3. `quality_score`: acertar 1 de 6 critérios vale 80/100 ⚠️ ENGANOSO — aritmética verificada

`calculator.py:239-247`:

```python
points_map = {"pass": 100.0, "warn": 55.0, "fail": 0.0}
raw_score = sum(points_map[i["status"]] for i in known) / len(known)   # média SÓ dos conhecidos
missing_penalty = (len(items) - len(known)) * 4.0
score = round(raw_score - missing_penalty)
```

Uma ação com **1 critério conhecido e "pass"**, 5 ausentes: `100 − (5 × 4) = **80**`.
E `dashboard_metrics.py:185-187` dá **+10 de bônus** quando `q_score >= 75`.

**Dado escasso vira vantagem de +10 num score cujo corte de compra é 55.** Isso reabre parcialmente
o A3 que foi corrigido — a correção pegou o caso "zero conhecidos", não o caso "um conhecido".

**Correção:** exigir mínimo de critérios avaliados (4 de 6) para emitir `quality_score`; abaixo disso
devolver `None`, que já tem tratamento de ausência.

### I4. A média dilui reprovação: empresa com dívida 5x recebe "Alta Qualidade" ⚠️ ENGANOSO

Com 6 critérios, 5 pass + 1 fail = `(500 + 0)/6 = 83` → `>= 75` → **+10 "Alta Qualidade Fundamentalista"**.

Caso concreto: P/L 8 (pass), ROE 18% (pass), margem 12% (pass), DY 7% (pass), desconto +15% (pass),
**Dívida Líq/EBITDA 5,0x (fail)** → score 83 → bônus de qualidade.

**A média esconde o único critério que sinaliza risco de solvência.** Um checklist de saúde deveria
ter *gate* nos críticos (dívida, ROE), não média simples.

### I5. Gordon é aplicado a FII com `g = 5%` ⚠️ ERRADO

`screener_service.py:243-246`:

```python
graham_price = calculate_graham_price(lpa, vpa) if inferred_type == "Ação" else None   # guard
gordon_price = calculate_gordon_price(div_ps, required_return_pct=12.0, growth_pct=5.0)  # SEM guard
dcf_price    = calculate_dcf_price(fcf_per_share) if inferred_type == "Ação" else None  # guard
```

Gordon é o único sem guard. Com `k=12%`, `g=5%` → preço = **15 × dividendo**. Um FII com yield de 10%
"vale" ~50% acima do mercado. FII não cresce dividendo: o rendimento é aluguel, no máximo reajustado
pela inflação.

**Correção:** `None` para FII/ETF. Se quiser modelo para FII, use `D/k` (perpetuidade, `g=0`).

### I6. ROE e margem sem normalização de escala ⚠️ ENGANOSO (intermitente)

`screener_service.py:195-196` multiplica por 100 sempre. O DY, duas linhas acima, **tem** a proteção
(`dy_norm = raw*100 if raw < 0.6 else raw`). Se o Yahoo devolver `returnOnEquity = 15.0` (já em %),
o resultado é **1.500%** — e o checklist dá `pass` automático em ROE e margem.

`_safe_float` só barra `> 1e15`. **Correção:** mesma normalização do DY (`abs(val) > 1.5` → já está em %).

### I7. O checklist de FII não olha vacância nem segmento — e os dados já existem ⚠️ ENGANOSO

`calculator.py:139-177` — apenas **4 critérios**: P/VP, DY 12m, margem vs teto, alavancagem.

Falta o que mais importa em FII: **vacância física e financeira, segmento (tijolo/papel/FoF),
prazo dos contratos (WAULT), concentração de inquilinos**. E o app já extrai dois deles:

- `pdf_extractor.py:68-69` → `vacancia_fisica_pct`, `vacancia_financeira_pct`
- `fii_processor.py:103-112` → `segmento`, `gestao`

**Agravante estrutural:** 3 dos 4 critérios são de **preço** (P/VP, DY, margem de teto) e se movem
juntos. Um FII que cai 20% melhora três critérios de uma vez e "fica saudável" sem nada mudar no imóvel.

### I8. Fórmula Mágica desvia de Greenblatt em três pontos ⚠️ CORRETO COM RESSALVA

`calculator.py:256-263`:
- `ey = 1/EV/EBITDA`, mas Greenblatt usa **EBIT/EV**. EBITDA = EBIT + depreciação, então o inverso
  **superestima** o earnings yield, e o viés é sistemático: capital-intensivo sobe no ranking.
- `roic` é, na prática, `returnOnAssets` (`screener_service.py:213`) — o label diz ROIC. É um proxy
  desalavancado (melhor que ROE), mas não é ROIC.
- **Bancos não são excluídos.** Greenblatt exclui financeiras e utilities. Hoje o banco cai no
  fallback `1/PL` e perde 4 pontos por `debt_to_ebitda` ser inaplicável — punido por uma métrica que
  não existe no setor dele.

### I9. CVM só entra como fallback, nunca como preferência ⚠️ CORRETO COM RESSALVA

`screener_service.py:226-231` só usa `ov["lpa"]`/`ov["vpa"]` quando o Yahoo **não tem** o dado.
Quando o CVM é mais recente que o Yahoo, o dado oficial perde. O projeto já fez a inversão para
VPA de FII (commit `6fa84a8`); falta para ação.

Defasagem típica: LPA TTM 1–4 meses; VPA do último balanço ~1 trimestre.

### I10. Parser de VPA quebra com separador de milhar e falha em silêncio 🟡

`screener_service.py:317-324`: `.replace(",", ".")` transforma `"R$ 1.234,56"` em `"1.234.56"` →
`ValueError` → **engolido**. Funciona hoje porque o único produtor usa ponto decimal
(`market_data.py:466`). Se outro relatório emitir milhar, o VPA oficial desaparece sem log.

### I11. Bazin de FII a 8% é o piso agressivo da faixa 🟡 CORRETO COM RESSALVA

`screener_service.py:243` e `dashboard_metrics.py:37` usam **8%** para FII (faixa usual de mercado:
8–10%). O mesmo FII com R$ 1,00/cota tem teto de R$ 12,50 a 8% e R$ 10,00 a 10% — **25% de diferença**
na régua que decide compra. O `watchlist` já tem `desired_bazin_dy` configurável; o Radar não usa.

---

## 3. Correção ao relatório de indicadores: o "Número Mágico" está CERTO

A auditoria automática apontou `magic_number = 12/dy` como erro de 12× (150 em vez de 13 cotas,
`dashboard_metrics.py:34`). **Verifiquei e ela errou a interpretação.**

O "Número Mágico" é um conceito da comunidade de FII no Brasil: **quantas cotas você precisa para o
rendimento *mensal* pagar uma cota nova**. Como o rendimento mensal por cota é `preço × dy / 12`,
o número é `preço / (preço × dy / 12) = 12 / dy`. Para DY de 8%: **150 cotas**. Está correto.

Isso é confirmado pelo próprio tooltip, `AssetIndicatorsCell.tsx:40-43`:
> "Número Mágico atingido! O rendimento **mensal** já paga uma nova cota do fundo."

O problema real é outro, e menor:

1. **O tooltip do estado não atingido é ambíguo** — diz "para o rendimento pagar uma nova cota",
   sem "mensal" (`:43`). Num indicador que vale 150 vs 13, a ambiguidade importa.
2. **O conceito é aplicado a ações**, que pagam provento trimestral/anual, não mensal. Para ação,
   "12/dy" não tem significado.

**Correção:** rotular explicitamente "Número Mágico (renda mensal)" e aplicar só a FII, ou usar
`1/dy` para ação com rótulo de renda anual.

---

## 4. Onde a IA é usada — mapa verificado

| # | Uso | Onde | Saída | Fallback | Cache | Afeta dinheiro |
|---|---|---|---|---|---|---|
| 1 | Sentimento de notícias | `gemini_service.py:164-291` | JSON | Gemini → Ollama | 20 h/ativo | **SIM, em dois pontos** |
| 2 | Jarvis chat | `ai.py:398-590` | texto stream | sim | histórico SQLite | indireto |
| 3 | `explain-score` | `ai.py:625-671` | texto | frase determinística | **não** | não |
| 4 | Morning brief | `simulation.py:228-275` | JSON | sim | `SystemCache` | não |
| 5 | Resumo setorial | `news.py:145-200` | bullets | sim | 12 h | não |
| 6 | Extração de KPI de PDF | `pdf_extractor.py:90-111` | JSON | **falha alto** | não | indireto (FII) |

**Premissas que a auditoria derrubou:** `ocr_import.py` não usa IA (é OCR convencional);
`routes/dashboard.py` não usa LLM; `/api/jarvis` não existe — o chat é `/api/ai/chat`.

---

## 5. Achados de IA — por risco

### A1. O sentimento da IA escala **alocação em reais** 🔴 PERIGOSO — verificado

`domain/quant/rebalance.py:117-119,137-138`:

```python
sentiment_tilt = -0.15 if ai_sent == "Negativo" else (0.10 if ai_sent == "Positivo" else 0.0)
final_score = max(0.0, a["gap_score"] * (1.0 - penalty) * (1.0 + sentiment_tilt))
...
prop = s["score"] / score_total
val_sug = monthly_contribution * prop
```

Dois ativos com o **mesmo** `gap_score`: o que recebe "Positivo" ganha 10% mais do aporte; "Negativo"
perde 15%. Com `temperature` 0.2–0.25 e sem seed, **a divisão do aporte mensal muda entre execuções
sem nenhum dado de mercado mudar**. É transparente na UI (`:141-144` mostra "-15% peso"), mas não é
estável nem documentado como sensível.

### A2. Não-determinismo atravessa o corte do sinal de compra 🔴 PERIGOSO

`dashboard_metrics.py:195-203` — `+8` para positivo, `-15` para negativo. Os cortes ficam em
**55 / 60 / 75** (`:230-238`).

**8 pontos é exatamente o tamanho do bônus:** um "Neutro" que virasse "Positivo" leva um ativo de
47 (MANTER) para 55 (**APORTAR**). Na direção oposta são 23 pontos.

### A3. Falha de parse vira "Neutro" com status "success" 🟠 FRÁGIL

`gemini_service.py:255-263` — no `except`, `summary = response_text` (texto cru, possivelmente enorme)
e `sentiment = "Neutro"`, e **`ai_status = "success"`**. Três situações ficam indistinguíveis:
análise realmente neutra, JSON malformado, e ausência de notícias. O `success` faz o cache de 1 dia
(`news.py:90-96`) e o rebalanceamento (`rebalance.py:58`) tratarem como válido.

### A4. Trocar de provedor troca a decisão 🟠 FRÁGIL

Gemini `temperature=0.2` (`gemini_service.py:38`) vs Ollama `temperature=0.25`, `qwen2.5:3b`
(`local_ai.py:11,122`). O `provider` é retornado em `:56/:67` mas **descartado** no caminho do
sentimento (só vai para log, `:266`). Quando o Gemini falha, o sentimento — e o sinal — pode mudar.

### A5. Dois consumidores comparam sentimento com *case* exato 🟠 FRÁGIL

`rebalance.py:118,141,143` e `SmartAllocationModal.tsx:319-321` usam `== "Negativo"` / `=== 'Positivo'`.
O score normaliza (`.strip().lower()`, `dashboard_metrics.py:195`), mas estes não. Hoje funciona porque
uma única linha (`gemini_service.py:252`) força `.title()`. Qualquer novo escritor do campo quebra em
silêncio, sem erro e sem log.

### A6. O prompt de sentimento é o único sem cláusula anti-invenção 🟠 FRÁGIL

| Prompt | Cláusula |
|---|---|
| `jarvis_system_v1.txt:12` | "NUNCA invente preços, dividendos, notícias ou tickers" |
| `explain_score_v1.txt:11` | "sem inventar números que não estejam acima" |
| `daily_sector_summary_v1.txt:9` | "Não invente fatos ou cotações fora das manchetes" |
| `morning_brief_v1.txt:16` | "sem inventar fatos fora do contexto" |
| **`sentiment_analysis_v1.txt`** | **nenhuma** |

E é justamente o que recebe números fundamentalistas e cujo resultado entra em dinheiro.

### A7. Manchetes externas entram no prompt sem delimitação 🟠 FRÁGIL

`sentiment_analysis_v1.txt:9-10` e `daily_sector_summary_v1.txt:3-4` injetam títulos do **Google News
RSS** crus, sem marcador (`<news>…</news>`) nem escape. Um título com instruções fica no mesmo nível
do texto de sistema.

**Atenuante:** nesse caminho o modelo não tem tools e não escreve no banco — as tools do Jarvis são
read-only, e o resultado delas é sanitizado (`ai.py:558-561`).
**Agravante:** a injeção indireta chega a **dinheiro** pela porta do sentimento (A1/A2).

### A8. `@with_safe_commit` num endpoint de streaming 🟡

`ai.py:399` — o decorator reexecuta o handler inteiro em `OperationalError` (até 5×): o histórico do
usuário é inserido de novo e o modelo é chamado de novo.

### A9. Histórico do Gemini sem teto 🟡

`ai.py:421-422,526` — carrega a sessão inteira e itera sem limite. O caminho Ollama corta em 4
mensagens e 400 caracteres (`:478-482`). O contexto cresce linearmente com a conversa.

### A10. `explain-score` sem cache 🟡

`ai.py:625-671` — cada abertura do painel gera 1 chamada ao modelo.

### A11. Job de sentimento é cross-user 🟡

`worker_jobs.py:86-99` — sem filtro de usuário, e `if asset.id in seen_assets: continue` faz o prompt
usar a posição de **um** usuário para todos. Irrelevante com usuário único; errado no dia que houver dois.

### A12. Regra de timeout aponta para rota morta 🟢

`app/lib/api.ts:17` dá 60 s para `/api/jarvis`, que não existe. O chat real usa `fetch` cru com
`AbortController` de 180 s (`JarvisChat.tsx:113-117`), igual ao timeout do servidor (`local_ai.py:66`) —
cliente e servidor expiram juntos, sem margem, e a resposta não é persistida.

---

## 6. O que está certo e não deve ser mexido

**Indicadores**
- Bazin: `div / (dy/100)` com `_to_pos_float` barrando divisor ≤ 0 (`calculator.py:31-40`).
- Graham: fórmula correta e LPA/VPA negativos barrados antes do `sqrt` (`:48-52`).
- DCF: 5 anos + Gordon no terminal, guards `g >= k` e `gt >= w` ativos (`:67-68,90-91`).
- `dcf_is_estimate` marcado e visível na UI.
- MIL convertido corretamente (`cvm_processor.py:115-118`, com teste).
- P/VP com fator de moeda (`dashboard_metrics.py:47`).
- `_NON_FII_11` cobre ETFs e units.
- Número Mágico: `12/dy` está correto para FII (ver §3).

**IA**
- Sentimento: `json_mode`, `temperature` baixa, `.title()` + whitelist + fallback "Neutro"
  (`gemini_service.py:252-258`) — o contrato técnico é sólido.
- Jarvis: tools read-only, allowlist de dispatch, resultado sanitizado com aviso explícito
  (`ai.py:548-561`).
- `explain-score`: fallback determinístico quando a IA falha (`ai.py:659-663`).
- Morning brief: enums fechados no prompt + `_sanitize_risk_metrics` + cache + erro honesto.
- PDF KPI: instrução "preencha null, NUNCA invente 0.0" + **falha alto** (`pdf_extractor.py:92,104-107`).
- TTLs: sentimento 20 h, setorial 12 h, cooldowns por estado em `news.py:66-96`.

---

## 7. Prioridades

| P | Item | Por quê |
|---|---|---|
| **P0** | A1 tilt de alocação em R$ por IA | move dinheiro real, não-determinístico |
| **P0** | A2 ±8 no score cruza o corte de 55 | muda o sinal de compra sem mudar dado |
| **P0** | I1 amortização como rendimento em FII | infla DY, teto e sinal de barato |
| **P1** | I3 + I4 `quality_score` (mínimo de critérios + gate nos críticos) | premia dado escasso e esconde dívida |
| **P1** | I5 Gordon em FII/ETF | preço justo ~50% acima do mercado |
| **P1** | I2 uma régua de Bazin só | mesmo ativo, dois veredictos |
| **P1** | A3 status "success" em falha de parse | cache e rebalance usam dado inválido |
| **P1** | A6 cláusula anti-invenção no sentimento | único prompt sem ela, e é o que move dinheiro |
| **P2** | I6 normalização de ROE/margem | 1500% intermitente |
| **P2** | I7 vacância e segmento no checklist de FII | os dados já existem |
| **P2** | A4/A5/A7 robustez (provider, case, delimitar notícia) | fragilidade estrutural |
| **P3** | I8/I9/I10/I11, A8-A12 | qualidade, não correção de decisão |

---

## 8. Prompt para o Argon (copiar e colar)

```
Leia `.agents/tasks/validacao-indicadores-e-ia.md` e execute APENAS o bloco P0 (A1, A2, I1).

Contexto:
- Projeto: C:\Users\Fabricio\Projetos\asset-flow (Flask + SQLite + SQLAlchemy 2 + Next 16/React 19).
- 136 testes backend passando, 56 frontend. Branch `feature/valuation-radar-suite`.
- Esta fase mexe em RECOMENDAÇÃO E ALOCAÇÃO DE DINHEIRO. Se não tiver certeza, PARE e pergunte.

Os três defeitos, verificados por leitura de código:

A1 — `domain/quant/rebalance.py:117-119,137-138`: o sentimento da IA multiplica o score de alocação
por 1,10 (Positivo) ou 0,85 (Negativo), e esse score vira a proporção do aporte em reais
(`val_sug = monthly_contribution * prop`). Com temperatura 0.2-0.25 e sem seed, a divisão do aporte
muda entre execuções sem nenhum dado de mercado mudar.
→ Correção: não deixar a IA decidir peso de alocação. Opções, em ordem de preferência:
  (a) remover o tilt do cálculo e manter o sentimento apenas como rótulo informativo na UI;
  (b) limitar o tilt a ±5% E exigir que ele seja estável: só aplicar se o sentimento for o mesmo
      em 2 execuções consecutivas (histerese). Escolha (a) se não houver motivo claro para (b).

A2 — `services_modules/dashboard_metrics.py:195-203`: sentimento soma +8/-15 no score, e os cortes
de compra são 55/60/75 (`:230-238`). 8 pontos é exatamente o tamanho do bônus de sentimento: um
"Neutro" que virasse "Positivo" leva um ativo de 47 (MANTER) para 55 (APORTAR).
→ Correção: reduzir o peso do sentimento no score (sugestão: +4/-6) OU exigir confiança mínima.
  Não invente um campo de confiança novo sem adicionar ao schema do prompt e à validação.

I1 — `infrastructure/screener_service.py:111,127`: `div_12m = float(divs[...].sum())` soma a série
inteira do Yahoo, que inclui amortização de FII. O projeto já sabe que amortização não é rendimento:
`routes/portfolio.py:621-626` a trata como redutor de preço médio e `domain/tax/annual_irpf.py:20`
como redutora de custo.
→ Correção: usar a tabela `Dividend` local (tem coluna `type`) para montar o DY de 12m quando existir
  dado local; se não existir, manter o Yahoo mas expor `dy_includes_amortization: true` no payload e
  rotular na tela.

Restrições:
- Não mudar os thresholds de P/L, ROE, margem, dívida nem os pesos do checklist nesta fase.
- Não mexer em `domain/quant/risk.py` nem no motor de Bazin/Graham/Gordon.
- `Numeric(18,4)` e `Decimal` para dinheiro.

Critérios de aceite (teste que FALHA antes da correção):
- A mesma carteira, rodada duas vezes com sentimentos "Positivo" e "Neutro", produz o MESMO
  `suggested_value` por ativo (se escolher a opção (a)).
- Um ativo com score 47 e sentimento "Positivo" NÃO passa a APORTAR.
- DY de um FII que só teve amortização no período não é contado como rendimento.
- `pytest` 136+ verde, `npm test` 56+ verde, `tsc --noEmit` limpo.

Ao final: arquivos alterados, saída dos testes, e uma tabela de antes/depois da alocação de um aporte
de R$ 1.000 com os sentimentos mudando.
```

---

## 9. O que não fazer

- **Não "consertar" o Número Mágico para `1/dy`.** O `12/dy` está correto para FII (renda mensal).
  O problema é o rótulo ambíguo e o uso em ação.
- **Não recalibrar thresholds por setor** agora. É tentador e é uma mudança grande; o gate nos
  critérios críticos (I4) resolve o pior caso com muito menos risco.
- **Não adicionar um segundo modelo de IA** para "validar" o primeiro. Dobra o custo e o
  não-determinismo sem resolver A1/A2.
- **Não remover os fallbacks de IA.** Eles não são o problema — o problema é o que o resultado faz.
- **Não tocar em `domain/quant/`** fora do `rebalance.py` do A1.
- **Não migrar o DY de FII para a tabela local sem checar cobertura**: se a tabela `Dividend` só tem
  o que o usuário importou, o DY ficaria vazio para ativos que ele não acompanha. O fallback com
  rótulo é obrigatório.
