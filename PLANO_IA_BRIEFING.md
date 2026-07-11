# Plano Estratégico de Otimização — IA de Análise Financeira (Morning Brief)

**Data:** 2026-07-11  
**Objetivo:** Corrigir falhas de lógica, coerência e precisão técnica em resumos de mercado gerados por IA.  
**Modelo atual:** Llama 3.2 3B via Ollama (`server/infrastructure/ollama_service.py`)  
**Endpoint:** `server/routes/simulation.py` (`morning_brief()` + `_run_morning_brief_bg`)

---

## Diagnóstico do Problema

### Exemplo de briefing problemático
> "Hoje é uma manhã de grande instabilidade. A alta taxa Selic de 14,15% é especialmente impactante para posições de crédito e FIIs. As três maiores posições da carteira - CAIXINHA TURBO, VWRA11 e ITUB3 - apresentam diferentes níveis de risco. CAIXINHA TURBO, uma posição de reserva com alta meta, é particularmente suscetível a mudanças no mercado. A situação com VWRA11 é mais complicada, dado seu peso e meta elevados, que podem dificultar a liquidez em caso de movimentos significativos no mercado internacional. ITUB3, por outro lado, oferece um lucro razoável, mas aumenta o risco se houver uma retração do valor do ativo."

### Falhas identificadas
1. **Generalizações vazias:** "alta taxa Selic é especialmente impactante" — sem quantificação, sem explicação do mecanismo.
2. **Análise desconexa:** menciona "posições de crédito e FIIs" mas não explica por que, nem distingue duration, spread ou vacância.
3. **Conclusões sem sentido:** "aumenta o risco se houver uma retração do valor do ativo" — tautologia.
4. **Ausência de dados concretos:** não cita preços, pesos exatos, P/L, VaR, Beta, notícias recentes.
5. **Estrutura rasa:** 1 parágrafo corrido, sem seções, sem priorização, sem ações sugeridas.
6. **Dados disponíveis não usados:** risk metrics, news/sentiment, fundamentals, CVM data existem mas não entram no prompt.

---

## 1. Refinamento de Engenharia de Prompt

### 1.1 Estrutura do prompt ideal

```markdown
[PERSONA]
Você é um economista-chefe sênior especializado em gestão de portfólio de varejo.
Seu briefing será lido por investidores pessoa física com perfil moderado-agressivo.

[CONTEXTO ESTRUTURADO]
Data: {date}
Cenário macro:
- Selic: {selic}%
- USD/BRL: {usd}
- IPCA 12m: {ipca_12m}%
- VIX: {vix}

Carteira:
| Ativo | Categoria | Peso % | Meta % | P/L % | Preço | Value | Beta | VaR 95% |
|-------|-----------|--------|--------|-------|-------|-------|------|---------|
| ...   | ...       | ...    | ...    | ...   | ...   | ...   | ...  | ...     |

Notícias recentes (últimas 24h):
{news_items}

Sentimento por ativo (últimos 7d):
{sentiment_summary}

[TAREFA]
Elabore um briefing matinal em 3 seções, máximo 150 palavras:

1. **Cenário** (1-2 frases): Como a Selic e o dólar afetam a carteira HOJE.
2. **Riscos & Oportunidades** (bullet points): Para cada posição top-3, cite:
   - 1 dado quantitativo (ex: "VWRA11 representa 18% da carteira, acima da meta de 12%")
   - 1 evento recente relevante (ex: "Fed sinaliza pausa nos cortes")
   - 1 ação sugerida (ex: "Avaliar redução parcial para 15%")
3. **Ação Recomendada** (1 frase): Qual ajuste de alocação traria mais risco/retorno hoje.

[REGRAS ESTRITAS]
- NÃO generalize: cite números concretos da carteira.
- NÃO use tautologias ("aumenta o risco se o preço cair").
- NÃO mencione ativos fora da carteira.
- Responda em JSON: {"brief_text": "...", "rationale": "...", "action": "..."}
```

### 1.2 Melhorias específicas
| Problema atual | Solução no prompt |
|----------------|-------------------|
| Generalizações vazias | Incluir dados quantitativos concretos (peso, VaR, Beta) no prompt |
| Análise desconexa | Forçar estrutura de 3 seções com regras explícitas |
| Tautologias | Regra: "NÃO use tautologias" + exemplos negativos no prompt |
| Ausência de notícias | Incluir `news_items` e `sentiment_summary` no contexto |
| 1 parágrafo corrido | Substituir por seções estruturadas (Cenário, Riscos, Ação) |

---

## 2. Melhoria na Capacidade de Resumo

### 2.1 Técnicas aplicáveis

| Técnica | Implementação | Benefício |
|---------|--------------|-----------|
| **Summarization with constraints** | Especificar `max_palavras=150` e `seções=3` no prompt | Garante concisão |
| **Extractive + Abstractive hybrid** | Primeiro extrair 3-5 bullets quantitativos (peso, P/L, VaR), depois pedir síntese | Mantém precisão factual |
| **Template-driven output** | Usar template fixo: Cenário → Riscos → Ação | Elimina variação de estrutura |
| **Quantitative anchoring** | Cada afirmação deve citar pelo menos 1 número da carteira | Evita generalizações |
| **Priority ranking** | Ordenar posições por contribution to risk (não apenas por valor) | Foca no que importa |

### 2.2 Ajuste no código
- **`server/routes/simulation.py`**: melhorar `_build_morning_brief_prompt()` para incluir:
  - Tabela completa de posições com risk metrics
  - News items do dia (de `server/routes/news.py`)
  - Sentimento por ativo (de `ollama_service.py`)
  - Estrutura de seções no prompt

---

## 3. Correção de Fluxo de Raciocínio (Chain of Thought)

### 3.1 Problema atual
O LLM recebe dados brutos mas não tem estrutura para raciocinar passo-a-passo. O resultado é conclusões desconexas.

### 3.2 Solução: CoT explícito no prompt

```markdown
[CHAIN-OF-THOUGHT OBRIGATÓRIO]
Antes de escrever o briefing, raciocine internamente (NÃO mostre ao usuário):

Passo 1: Como a Selic atual impacta cada categoria da carteira?
- Renda Fixa: duration, spread
- FIIs: vacância, cap rate, custo de oportunidade vs. NTN
- Ações: custo de carry, valuation comprimido

Passo 2: Qual posição concentra mais risco?
- Calcule contribution to risk = peso × volatilidade × beta
- Ordene por risco, não por valor

Passo 3: O que justifica uma mudança de posição?
- Compare meta atual vs. peso real
- Identifique outliers (>20% acima da meta ou <50% abaixo)

Passo 4: Ação recomendada
- Sugira 1 ajuste com argumento quantitativo (ex: "Reduzir X% para alinhar com meta Y%")
```

### 3.3 Implementação
- Adicionar bloco `[CHAIN-OF-THOUGHT OBRIGATÓRIO]` no prompt
- Manter `rationale` no output para debug, mas não exibir ao usuário final
- Usar `format: json` com schema fixo para garantir parseabilidade

---

## 4. Padronização de Tom e Estilo

### 4.1 Diretrizes de tom

| Aspecto | Atual | Alvo |
|---------|-------|------|
| **Precisão** | Generalizações ("impactante para FIIs") | Números concretos ("FIIs com vacancy alta podem sofrer -3% a -5% se Selic subir 50bps") |
| **Concisão** | 1 parágrafo longo | 3 seções, máx. 150 palavras |
| **Ação** | Nenhuma | Sempre 1 ação recomendada por briefing |
| **Evidência** | Nenhuma | Cada afirmação cita 1 dado (peso, P/L, notícia) |
| **Tom** | Neutro/descritivo | Executivo: direto, sem jargões desnecessários, focado em decisão |

### 4.2 Template de saída ideal

```json
{
  "brief_text": "**Cenário:** Selic em 14,15% pressiona duration de FIIs e custo de carry de ações. Dólar em R$ 5,80 beneficia exportadores.\n\n**Riscos & Oportunidades:**\n- VWRA11: peso 18% vs meta 12%, Beta 1.2 → risco de concentração. Considerar reduzir para 15%.\n- ITUB3: P/L 8x, dividend yield 6% → defensivo em cenário de juros altos.\n- CAIXINHA TURBO: CDI+, alinhado à meta.\n\n**Ação:** Rebalancear VWRA11 para 15% e realocar para renda fixa.",
  "rationale": "Raciocínio interno...",
  "action": "Rebalancear VWRA11 para 15%",
  "risk_metrics": {
    "portfolio_beta": 0.95,
    "var_95": "-2.3%",
    "concentration_risk": "Alto (VWRA11 >15% da carteira)"
  }
}
```

---

## 5. Integração com Notícias em Tempo Real

### 5.1 Estado atual
- `server/routes/news.py` já busca Google News RSS e gera `daily_sector_summary`
- `ollama_service.py` já faz per-asset sentiment analysis
- **Nenhum desses dados entra no Morning Brief**

### 5.2 Arquitetura proposta

```
Morning Brief Pipeline:
1. Macro: Selic, USD, IPCA, VIX (já existe)
2. Portfolio: top-N positions + risk metrics (parcialmente existe)
3. News: últimos 3-5 títulos relevantes por posição (NOVO)
4. Sentiment: score por ativo (NOVO)
5. Fundamentals: P/L, P/VP, DY por posição (NOVO)
6. Prompt assembly: combina 1-5 em prompt estruturado
7. LLM call: gera briefing com CoT + template fixo
8. Cache: SystemCache com TTL 12h (já existe)
```

### 5.3 Implementação
- **`server/routes/simulation.py`**: adicionar seção de notícias no prompt
- **`server/routes/news.py`**: expor endpoint `/api/news/daily-summary` (já existe `get_daily_sector_summary`)
- **`ollama_service.py`**: adicionar método `get_portfolio_sentiment(positions)` que agrega sentiment por ativo
- **`database/models.py`**: adicionar tabela `NewsItem` para cache de notícias (opcional)

---

## 6. Plano de Implementação

### Sprint 1 — Prompt Engineering (1-2 dias)
1. Refatorar `_build_morning_brief_prompt()` em `simulation.py`
2. Adicionar CoT obrigatório no prompt
3. Incluir risk metrics (VaR, Beta, contribution to risk) no contexto
4. Mudar output para JSON estruturado com seções

### Sprint 2 — Enriquecimento de Dados (2-3 dias)
1. Integrar `get_daily_sector_summary()` no briefing
2. Adicionar per-asset sentiment (`ollama_service.py`)
3. Incluir fundamentals (P/L, P/VP) por posição
4. Expandir de top-3 para top-5 ou 100% da carteira (configurável)

### Sprint 3 — Validação & Testes (1-2 dias)
1. Criar fixture de avaliação: 5 cenários de mercado diferentes
2. Comparar briefings antes/depois com métricas:
   - Comprimento médio
   - Número de afirmações quantitativas
   - Presença de tautologias
   - Estrutura correta (3 seções)
3. A/B test: prompt antigo vs. novo

### Sprint 4 — Deploy & Monitoramento (1 dia)
1. Atualizar worker para usar novo prompt
2. Adicionar métricas de qualidade (log de `rationale` para auditoria)
3. Monitorar taxa de parse errors do JSON

---

## 7. Métricas de Sucesso

| Métrica | Atual | Alvo |
|---------|-------|------|
| % de briefings com estrutura correta (3 seções) | ~0% | 100% |
| Número médio de afirmações quantitativas por briefing | ~1 | ≥3 |
| Presença de tautologias | ~30% | <5% |
| Cobertura de posições | top-3 (33%) | top-5 ou 100% |
| Tempo de geração | ~5-10s | <10s |
| Taxa de parse errors | ~5-10% | <1% |

---

## 8. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Llama 3.2 3B não consegue seguir prompt complexo | Usar few-shot examples no prompt + fallback para modelo maior (7B) se disponível |
| Aumento de tokens causa timeout | Manter `timeout=300` + streaming + cache agressivo |
| JSON parse errors | Validar schema antes de cachear; fallback para texto puro |
| Notícias ruins geram viés | Filtrar por relevância (apenas ativos da carteira) + limite de 3 notícias por ativo |

---

## 9. Exemplo de Prompt Final Esperado

```markdown
[PERSONA]
Você é um economista-chefe sênior especializado em gestão de portfólio...

[CONTEXTO]
Data: 11/07/2026
Selic: 14,15% | USD: R$ 5,80 | IPCA 12m: 4,2% | VIX: 18,5

Carteira (top-5 por contribution to risk):
1. VWRA11 (Internacional ETF) — Peso: 18%, Meta: 12%, P/L: +5,2%, Beta: 1,15, VaR 95%: -3,1%
2. ITUB3 (Ação Brasil) — Peso: 12%, Meta: 10%, P/L: +8,5%, Beta: 1,05, VaR 95%: -2,4%
3. CAIXINHA TURBO (Renda Fixa) — Peso: 15%, Meta: 15%, P/L: +1,2%, Beta: 0,10, VaR 95%: -0,3%
4. PETR4 (Ação Brasil) — Peso: 10%, Meta: 8%, P/L: +12,3%, Beta: 1,35, VaR 95%: -3,8%
5. WEGE3 (Ação Brasil) — Peso: 8%, Meta: 10%, P/L: -2,1%, Beta: 0,85, VaR 95%: -1,9%

Notícias recentes:
- "Fed mantém juros estáticos em 5,25%" (Bloomberg, 11/07)
- "Petrobras anuncia corte de preços de gasolina" (Valor, 10/07)
- "Vale reduz produção de minério de ferro" (Reuters, 10/07)

Sentimento (últimos 7d):
- VWRA11: neutro (0.1)
- ITUB3: positivo (0.4)
- PETR4: negativo (-0.3)
- WEGE3: neutro (0.0)

[TAREFA]
Briefing matinal em 3 seções, máx. 150 palavras.

[CHAIN-OF-THOUGHT]
Passo 1: Impacto da Selic...
Passo 2: Contribution to risk...
Passo 3: Outliers...
Passo 4: Ação...

[REGRAS]
...
```
