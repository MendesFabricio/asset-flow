# Task: Bugs, performance, layout e diferenciais do AssetFlow

**Status:** Phase 2 (Planning) → Phase 3 (Implementation, fase por fase)
**Assigned Agents:** `@orchestrator` → `@debugger`, `@frontend-specialist`, `@backend-specialist`, `@performance-optimizer`, `@security-auditor`, `@test-engineer`
**Skills Active:** `@[clean-code]`, `@[systematic-debugging]`, `@[nextjs-react-expert]`, `@[frontend-design]`, `@[python-patterns]`, `@[tdd-workflow]`
**Substitui:** `port-securo-financas.md` (em espera, não executar)

> Todos os achados abaixo foram **verificados por leitura de código**, com `arquivo:linha`.
> Não invente achados novos para "aumentar o PR". Se um item não reproduz, reporte e pule.

---

## 0. Contexto

O AssetFlow está funcional e rodando (`assetflow.localhost`, containers dev no ar). O objetivo
aqui **não** é portar features de outro projeto — é consertar o que está quebrado, tirar
travas de performance e adicionar 2 recursos.

O que já está bem e **não deve ser mexido**:

- `next/dynamic` com skeletons em `DashboardTabContent.tsx` — correto, não trocar.
- `optimizePackageImports` e `output: "standalone"` em `next.config.ts` — corretos.
- `apiCall` em `app/lib/api.ts` — o `requestCache` é dedupe de request em voo (deleta no
  `finally`), **não** é cache de dados. Não é bug. Não mexer.
- `server/domain/quant/` (1.527 linhas) — matemática correta e sem acoplamento. Não refatorar.
- Arquivos grandes (`ReceivablesTab` 65 KB, `QuantDashboard` 62 KB) **já são `dynamic`**, então
  não pesam no bundle inicial. Problema de manutenção, não de performance. **Fora do escopo.**

---

## 1. Fase 0 — Commitar (BLOQUEANTE)

Hoje: **30 arquivos modificados e 4 untracked**, incluindo `middleware.ts`, `docker-compose.gateway.yml`
e `app/lib/session.ts` (novos, não versionados). Agente trabalhando em cima disso perde o diff.

```bash
git status
git add -A && git commit -m "chore: checkpoint antes das melhorias"
git switch -c feat/melhorias-bugs-perf-layout
```

Sem esse commit, `git diff` vira lixo e nenhuma fase é revisável. **Não pule.**

---

## 2. Achados verificados — Bugs

### B1. SSE de progresso quebrado fora do host Docker ⚠️ alto

`app/features/assets/hooks/useAssetData.ts:65-66`

```ts
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5328';
eventSource = new EventSource(`${backendUrl}/api/sync/stream`);
```

Problemas empilhados:
- `NEXT_PUBLIC_BACKEND_URL` **não existe em nenhum `.env`** (o `.env` define `NEXT_PUBLIC_API_URL`).
- `docker-compose.prod.yml:135` define `NEXT_PUBLIC_BACKEND_URL=` (vazio) — e `'' || 'http://localhost:5328'`
  resolve para **localhost**.
- Resultado: as barras de progresso de sync CVM/Yahoo funcionam só quando você acessa do próprio
  host. No celular, em outro PC, ou em produção → `EventSource` morto, sem erro visível.

**Correção:** existe um route handler que já faz o proxy: `app/api/sync/stream/route.ts`.
Use caminho relativo e apague a variável.

```ts
eventSource = new EventSource('/api/sync/stream');
```

E em `app/api/sync/stream/route.ts:5`, trocar o hardcode `'http://backend:5328/...'` por
`process.env.BACKEND_URL` (já definida em `.env` e nos composes) com fallback `http://backend:5328`.

### B2. Link de Markdown aceita `href` arbitrário ⚠️ médio (segurança)

`app/components/ui/Markdown.tsx:60-70` — `href={match[2]}` sem validação. O conteúdo vem do
Gemini, que por sua vez lê notícias de RSS externo (`feedparser`). Um `javascript:` ou `data:`
no texto gerado vira link clicável.

**Correção:** descartar o link (renderizar só o texto) quando `!/^https?:\/\//i.test(href)`.
~3 linhas. Teste pequeno.

### B3. App privado indexável ⚠️ médio (privacidade)

`app/layout.tsx:15-18` — `robots: { index: true, follow: true }` num app de finanças pessoais,
com `openGraph.url` público (`assetflowpro.duckdns.org`).

**Correção:** `index: false, follow: false`. Remover `openGraph.url` ou apontar para o host local.

### B4. `except:` nus engolem tudo ⚠️ baixo

`server/utils/dedup.py:59`, `server/utils/dedup.py:74`, `server/utils/fii_processor.py:110`,
`server/utils/pdf_generator.py:16`.

Bare `except` captura `KeyboardInterrupt` e `SystemExit`, e mascara erro de dados em pipeline
de importação. **Correção:** `except Exception as e:` + `logging.warning` com contexto. Não
mudar o fluxo de fallback.

### B5. Sem `error.tsx` / `not-found.tsx` ⚠️ baixo

Nenhum arquivo especial do App Router existe em `app/`. Erro de rota sem `ErrorBoundary` cai
na tela padrão do Next; 404 é a página crua.

**Correção:** `app/error.tsx` (client, com `reset`) e `app/not-found.tsx`, reusando `Card` e
`ToastContext` do projeto. Sem dependência nova.

### B6. Ruído de console ⚠️ baixo

19 ocorrências de `console.log|error|warn` em `app/`. **Correção:** manter os `console.error`
de falha real (Sentry já captura), remover `console.log` de debug. Não criar wrapper de logger.

### B7. README desatualizado ⚠️ baixo

`README.md:25` cita o componente `HealthIndicator.tsx` — **o arquivo não existe mais**.
`README.md:23,28,29` têm links para `c:/Users/Fabricio/asset-flow/...`, mas o projeto vive em
`C:\Users\Fabricio\Projetos\asset-flow`.

### B8. As credenciais da IA nunca chegam ao container ⚠️ alto — o Jarvis está morto em Docker

Nenhum dos dois composes injeta `GEMINI_API_KEY`:

- `docker-compose.dev.yml` só referencia `${SECRET_KEY}` (interpolado do `.env`, esse funciona).
- `docker-compose.gateway.yml` só passa `SECRET_KEY`, `SENTRY_DSN`, `ENVIRONMENT`, `FLASK_DEBUG`,
  `LOCKS_DIR`, `ALLOWED_ORIGINS`, `BACKEND_URL`, `NEXT_PUBLIC_API_URL`.

O `.env` tem as variáveis, mas o Compose só as usa para **interpolar** `${...}` — não as coloca
no container. Como `server/infrastructure/gemini_service.py:23-30` faz
`raise ValueError("GEMINI_API_KEY não configurada...")` fora de teste, toda rota de IA
(Jarvis, análise de sentimento, morning brief) responde 500 no app containerizado.

**Correção:** `env_file: - .env` (com `required: false`) nos serviços `backend` e `worker` dos
**dois** composes, e a variável `GEMINI_API_KEY` explícita no gateway. Documentar no `.env.example`.
`SENTRY_DSN: ""` no gateway desliga o Sentry de propósito no local — deixar como está.

**Aceite:** com um `GEMINI_API_KEY` válido no `.env`, `docker compose exec backend env | grep GEMINI`
mostra a variável e o Jarvis responde. Sem chave, a rota devolve erro claro em vez de 500 genérico.

---

## 3. Achados verificados — Performance

### P1. O que roda no dia a dia é o build de DEV ⚠️ alto — maior ganho da lista

`_gateway\config\homepage\services.yaml` aponta o card para `assetflow_frontend_dev`.
`docker-compose.dev.yml:14` roda `flask --app backend run --debug`; o frontend roda `next dev`
com `WATCHPACK_POLLING=true` e `watchOptions.poll: 1000`.

Isso custa: bundle sem minificação, React em modo dev, Flask reloader, polling de disco a 1 Hz.
Nenhuma micro-otimização compete com isso.

**Boa notícia:** o compose de produção já existe — `docker-compose.gateway.yml` (112 linhas,
Gunicorn + Next standalone, labels do Traefik, `container_name: assetflow_frontend`). Ele só
**não está sendo usado**, e não está commitado (untracked).

**Correção (barata):**
1. `docker compose -f docker-compose.gateway.yml up -d --build`
2. Trocar no card do Homepage: `container: assetflow_frontend_dev` → `assetflow_frontend`
3. Somar `env_file` (ver B8) e `SECRET_KEY` real nesse compose antes de subir.
4. Manter o dev compose para desenvolver — os dois convivem em projetos separados.

**Aceite:** `http://assetflow.localhost` servindo build de produção, healthcheck verde,
`docker compose -f docker-compose.gateway.yml config` sem erro, e o card do Homepage sem erro
de container.

> ⚠️ Ao subir o prod, o volume `sqlite_data` é **outro** que o do dev (`assetflow_*_dev` usa
> bind/volume distinto). Confira antes: os dados de dev não migram sozinhos. Fazer backup do
> `.db` e copiar para o volume novo é passo obrigatório, não opcional.

### P2. A página inteira espera a requisição de histórico ⚠️ alto

`useAssetData.ts:142` — `loading: loadingDashboard || loadingHistory`.

`/api/history` só é usado na aba "Evolução", mas bloqueia o render inicial da aba "Resumo".
A tela de skeleton espera **duas** requisições para mostrar a primeira.

**Correção:** `loading: loadingDashboard`. A aba Evolução já recebe `history` vazio e o
`HistoryChart` já tem skeleton próprio (`HistoryChartSkeleton`). Mudança de 1 linha.

### P3. `history` revalida a cada foco de janela ⚠️ médio

`useAssetData.ts:40` — `useSWR<HistoryDataPoint[]>('/api/history', fetcher)` sem opções, então
`revalidateOnFocus` fica `true` (o `/api/index` ao lado já desliga). Volta a cada troca de aba
do navegador → requisição pesada de histórico sem motivo.

**Correção:** `{ revalidateOnFocus: false }`, igual ao vizinho.

### P4. `|| []` recria array a cada render ⚠️ médio

`app/page.tsx:127, 159, 169, 178, 203` — `data?.ativos || []`, `data?.categorias || []`,
`data?.alertas || []` criam referência nova a cada render. Isso derruba o `memo` de
`AssetsTable`, `Header` e `NavigationTabs`.

**Correção:** `const ativos = data?.ativos ?? EMPTY_ARRAY;` com `const EMPTY_ARRAY: Asset[] = []`
no módulo. 3 constantes, zero abstração.

---

## 4. Achados verificados — Layout / UX

### L1. Aba não vive na URL ⚠️ alto (é o que mais incomoda no uso)

`useDashboardState.ts:11` — `useState('Resumo')`. Consequências reais:
- F5 (reload) volta para o Resumo.
- Botão "voltar" não navega entre abas.
- Não dá para favoritar "Cartões".
- Ir em `/tax` ou `/agenda` e voltar perde a aba.

**Correção sem dependência nova** (o jeito óbvio, `useSearchParams`, exige `Suspense` e quebra
o build em `output: standalone` — não use):

```ts
// ler no mount, sem useSearchParams
useEffect(() => {
  const t = new URLSearchParams(window.location.search).get('tab');
  if (t) setTab(t);
}, []);

// escrever sem re-render do router
const selectTab = useCallback((t: string) => {
  setTab(t);
  window.history.replaceState(null, '', `?tab=${encodeURIComponent(t)}`);
}, []);
```

Trocar `onSelect={setTab}` por `onSelect={selectTab}` em `page.tsx:147`.

### L2. Sem `viewport` / `themeColor` ⚠️ médio (mobile)

`app/layout.tsx` exporta `metadata` mas não `viewport`. Efeito: sem cor de barra no mobile,
sem `maximumScale`, e o app não tem `apple-touch-icon` nem `manifest` (usar na tela inicial
do celular fica feio).

**Correção:** `export const viewport: Viewport` com `themeColor` que acompanha o tema, e
`app/icon.svg` + `app/apple-icon.png` a partir do favicon existente.

### L3. `body` hardcoda cor escura ⚠️ médio

`app/layout.tsx:66` — `bg-[#0b0f19] text-slate-200` no `<body>`. No tema claro isso só não
quebra porque existe o override `.light-theme .bg-\[\#0b0f19\]` em `globals.css:132`.

**Correção:** `bg-surface text-text-primary` (os tokens já existem em `@theme inline`,
`globals.css:32-52`). Uma linha. O override correspondente pode ficar.

### L4. Pilha de overrides do tema claro ⚠️ dívida, NÃO refatorar agora

`globals.css:113-320` tem ~200 linhas de `.light-theme .bg-slate-900 { ... !important }`. É
bruto, mas **funciona** e reescrever arrisca quebrar o que hoje está certo.

**Decisão:** não refatorar. Em vez disso, uma regra no `AGENTS.md` do projeto: *componente novo
usa token (`bg-surface-card`, `text-text-muted`), nunca `slate-*` cru*. Dívida contida, sem
risco de regressão visual.

### L5. Detalhes de UI ⚠️ baixo

- `page.tsx:197` — `AssetFlow v1.0` hardcoded; ler de `package.json`.
- `page.tsx:43` — id `'Financeiro'` com label `'Reembolsos'` (confuso ao ler o código/URL).
  Ao mexer em L1, alinhar id e label.
- `page.tsx:112` — `onOpenCorporateAction={() => {}}` no branch de loading (morto).
- 43 ocorrências de `key={index}` — baixo risco, só corrigir onde a lista é filtrável.

---

## 5. Funcionalidades que nenhum dos dois projetos tem

Verificado: o Securo **não tem** Sharpe, VaR, CVaR, drawdown, Monte Carlo, nem IRPF.
As três ideias abaixo são diferenciais reais e usam **dados que o AssetFlow já tem**.

### F1. "De onde veio meu rendimento" — atribuição de performance ⭐ melhor custo/benefício

`MonthlyPortfolioSnapshot` (`server/db/models/portfolio.py:155-177`) já guarda por mês:
`total_invested_cost`, `total_market_value`, `realized_pnl`, `unrealized_pnl`.

A atribuição é **aritmética sobre colunas existentes** — nenhum dado novo:

```
crescimento = valor_final - valor_inicial
aportes     = custo_final - custo_inicial        (+ vendas)
mercado     = crescimento - aportes - dividendos
dividendos  = SUM(dividends.total_value) no mês
```

Entrega: endpoint `GET /api/performance/attribution?from&to` e um gráfico de barras empilhadas
na aba "Evolução" abaixo do `MonthlyPnLChart`, respondendo "este mês subi R$ 8.400: R$ 5.000 de
aporte, R$ 2.900 de mercado, R$ 500 de dividendo".

**Aceite:** soma das três parcelas = variação do patrimônio no período, com teste que prova
o fechamento da conta.

### F2. Retorno real: XIRR + comparação com benchmark

Hoje só existe `lucroTotal` (P&L simples), que ignora **quando** o dinheiro entrou. Um aporte
grande no mês passado infla o lucro e esconde a performance.

- **XIRR** (TIR com datas irregulares): resolve por Newton-Raphson/Bisseção em numpy. Datas e
  valores já estão em `AssetTransaction`.
- **Benchmark**: comparar com CDI e IBOV usando os mesmos fluxos. CDI vem do BCB
  (`api.bcb.gov.br/dados/serie/bcdata.sgs.12`) — sem chave, `requests` já instalado.

Entrega: `GET /api/performance/returns` → `{ xirr, twr, benchmarks: { cdi, ibov } }`, exibido
como 3 KPI cards no topo da aba "Evolução", com o texto "você: 14,2% a.a. · CDI: 11,8% · IBOV: 9,3%".

**Aceite:** XIRR de um fluxo conhecido bate com o gabarito (teste com `[-1000 @ 2024-01-01,
+500 @ 2024-07-01, +600 @ 2025-01-01]`); se o BCB cair, o card mostra "CDI indisponível" em vez
de quebrar.

**Ponytail:** se `scipy` não estiver instalado (não está), **não instale**. Bissecção com numpy
resolve em 15 linhas e converge para esse caso.

### F3. Simulador de venda com custo fiscal

"Se eu vender 100 PETR4 hoje, quanto sai de DARF e como fica a carteira?"

Junta o que já existe separado: `server/domain/tax/tax_engine.py` (isenção de R$ 20 mil em
ações, day trade, prejuízo acumulado, FII sem isenção) + `server/domain/quant/rebalance.py`
(simulação de pesos) + `server/routes/simulation.py` (rota existente).

Entrega: `POST /api/simulation/sell` → `{ darf_estimado, isencao_aplicavel, novos_pesos,
impacto_na_carteira }`. UI: modal a partir da aba "Análise Quant".

**Aceite:** venda de R$ 15 mil em ações swing → isento, DARF 0; venda de R$ 25 mil → DARF sobre
o excedente, respeitando prejuízo acumulado do `TaxProfile`.

> **Risco:** é o item mais delicado da lista (dinheiro + imposto). Se o Argon não tiver certeza
> da regra, ele **pergunta** em vez de inventar. Regra errada aqui custa dinheiro real.

---

## 6. Ordem de execução

```
F0  commit                      bloqueante, 5 min
F1  bugs (B1-B8)                alto valor, baixo risco      → 1 PR
F2  performance (P1-P4)         P1 é o maior ganho           → 1 PR
F3  layout (L1-L3, L5)          L1 é o que mais incomoda     → 1 PR
F4  atribuição + XIRR           diferencial                  → 1 PR
F5  simulador fiscal            diferencial, mais arriscado  → 1 PR
```

Cada fase: um PR, verificação própria. Não abrir a seguinte com a anterior vermelha.
**F1 antes de tudo**: são correções pequenas e o resto do plano depende de o app estar confiável.

---

## 7. Definition of Done (por fase)

- [ ] `cd server && python -m pytest` verde (sem regressão nos existentes).
- [ ] `npm test` verde.
- [ ] `npm run lint` sem erro novo.
- [ ] `npx tsc --noEmit` limpo.
- [ ] `npm run build` completa (pega erro de Suspense/prerender).
- [ ] `docker compose -f docker-compose.gateway.yml config` sem erro (fases P1).
- [ ] Nenhuma dependência nova. Se precisar, justificar em 1 linha.
- [ ] Nenhuma query sem `g.user_id`; soft delete preservado; `Numeric(18,4)` para dinheiro.
- [ ] README atualizado quando o comportamento muda.

---

## 8. Prompt para o Argon (copiar e colar)

> Troque só a fase na primeira linha. Ordem: F0 → F1 → F2 → F3 → F4 → F5.

```
Leia `.agents/tasks/auditoria-melhorias-assetflow.md` e execute a Fase 0 e depois APENAS a Fase 1 (correção de bugs B1 a B8).

Contexto obrigatório:
- Projeto: C:\Users\Fabricio\Projetos\asset-flow (Flask 3 + SQLite/WAL + SQLAlchemy 2 + Alembic + Next 16/React 19).
- Os achados do arquivo foram verificados por leitura de código e têm `arquivo:linha`. Comece por eles.
- Se um achado não reproduzir, reporte com evidência e pule. NÃO invente achado novo para encher o PR.

Fase 0 (bloqueante, faça primeiro):
- Rode `git status`. Hoje há 30 arquivos modificados e 4 untracked, incluindo middleware.ts, app/lib/session.ts e docker-compose.gateway.yml.
- Commite tudo como checkpoint e crie a branch `feat/melhorias-bugs-perf-layout`.
- Sem esse commit, pare e avise.

Restrições:
- Não trocar stack. Não adicionar dependência. Não refatorar o que está listado como "não mexer" na seção 0 do arquivo.
- Não mexer em `app/lib/api.ts` (o requestCache é dedupe em voo, está correto).
- Não reescrever a pilha de overrides do tema claro em globals.css.
- Reaproveitar `Card`, `Badge`, `ConfirmDialog`, `ToastContext`, `ModalShell` antes de criar componente.
- Não quebrar rota, campo ou resposta existente.

Detalhes que costumam escapar:
- B1: trocar o EventSource para caminho relativo `/api/sync/stream` e usar `process.env.BACKEND_URL` no route handler. NÃO usar `useSearchParams` em lugar nenhum desta fase.
- B2: validar esquema do href (`^https?://`), renderizando texto puro quando não casar. Deixar teste.
- B4: trocar bare `except:` por `except Exception as e:` + log com contexto, sem mudar o fluxo.
- B8: adicionar `env_file: - .env` (com `required: false`) em `backend` e `worker` dos DOIS composes
  (dev e gateway). Não colocar `GEMINI_API_KEY` hardcoded em compose.

Critérios de aceite:
- B1: com o app aberto em `http://assetflow.localhost`, as barras de progresso de sync funcionam; simular acesso de outro host não deixa o EventSource apontando para localhost.
- B2: teste prova que `[x](javascript:alert(1))` vira texto, não link.
- B3: `robots` com index/follow false.
- B5: `app/error.tsx` e `app/not-found.tsx` existem e renderizam com o visual do projeto.
- B6: nenhum `console.log` de debug restante em `app/`.
- B7: README sem referência a HealthIndicator e com caminhos corretos (Projetos, não a raiz C:).
- B8: `docker compose -f docker-compose.dev.yml config` e `-f docker-compose.gateway.yml config`
  mostram o `env_file`; `docker compose -f docker-compose.dev.yml exec backend env` contém
  `GEMINI_API_KEY`.
- `pytest` verde, `npm test` verde, `npm run lint` sem erro novo, `npx tsc --noEmit` limpo, `npm run build` completa.

Ao final, entregue: arquivos alterados, saída de pytest/npm test/tsc/build, e o que ficou de fora com o risco.
```

---

## 9. O que NÃO fazer

- Não reescrever o tema claro (L4). Funciona; refatorar é risco sem entrega.
- Não dividir `ReceivablesTab` nem `QuantDashboard`. São `dynamic`; não pesam no bundle.
- Não trocar `next/dynamic` por import estático em nome de simplicidade.
- Não instalar `scipy`, `date-fns`, `cmdk`, `axios` ou `@tanstack/react-query` (esta última usar
  `swr` que já está lá). XIRR sai com numpy; data sai com `Intl` nativo.
- Não criar camada de service/abstração nova no backend. Seguir `routes/` + `services_modules/`.
- Não mexer em `server/domain/quant/` — matemática correta.
- Não "consertar" o `requestCache` de `api.ts`. Não é bug.
- Não portar nada do Securo. Ver `port-securo-financas.md`, em espera.

---

## 10. Adendo Validado (Auditoria Complementar + Escopo Expandido)

### Correções técnicas aos achados originais
- **B6:** 0 `console.log` em `app/`; tratar `catch` silenciosos com feedback real (`toast.error` / estado de erro em `app/perfil/page.tsx` e `MonthlyPnLChart.tsx`).
- **B7:** Atualizar `README.md` também removendo referências falsas a Ollama `llama3.2:3b` (porta 11434) para Google Gemini (`gemini-2.5-flash`) e `database/models.py` → `server/db/models/`.
- **B8 & NB1 (Jarvis Function Calling):** Além de injetar `env_file` (`.env`, `required: false`), corrigir 3 bugs fatais em `server/routes/ai.py`:
  1. Importar `_fetch_price_history_fn` (`from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn`).
  2. Substituir `asset.position` por seleção filtrada em `asset.positions` (`p.user_id == g.user_id`).
  3. Passar `tools=tools` em `types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, tools=tools)` na 1ª chamada `generate_content`.
- **P1 & NB5:** Manter `cookie secure` dinâmico (`COOKIE_SECURE === 'true' || x-forwarded-proto === 'https'`) em `login`/`logout` para funcionar em HTTP na LAN (`assetflow.localhost` / `assetflow.192.168.3.11.nip.io`) e corrigir rewrite em `next.config.ts` (`auth/login|auth/logout|auth/register`) para não bloquear `/api/auth/profile`.
- **F1:** Fechamento contábil exato sobre `MonthlyPortfolioSnapshot`: `aportes_liquidos = (custo_final - custo_inicial) - realized_pnl`, `variacao_mercado = (unrealized_final - unrealized_inicial) + realized_pnl`, `crescimento_custodia == aportes_liquidos + variacao_mercado`, somando `dividendos` como retorno em caixa.
- **F3:** Regra fiscal brasileira real: quando soma das vendas de ações no mês (já realizadas + simulada) supera R$ 20.000, o IR de 15% incide sobre todo o lucro líquido do mês (após abater prejuízo acumulado), não apenas sobre o excedente.

### Novos bugs e ganhos de performance validados (`NB2–NB8`, `P5–P6`)
- **NB2 (`server/services_modules/backup.py`):** `take_daily_snapshot()` lê chaves corretas de `get_dashboard_data()` (`resumo['Total']`, `resumo['TotalInvestido']`, `grafico`).
- **NB3 & P6 (`server/domain/tax/tax_engine.py`):** Eliminar N+1 queries em `_detect_day_trades` (1 query única no intervalo) e tornar `calculate_monthly_darf` idempotente em requisições `GET` (não mutar/commitar `TaxProfile` a cada leitura).
- **NB4 (`server/services_modules/dashboard_metrics.py`):** Ler `rsi_14` de `pos.asset.market_data[0]` em vez do atributo inexistente `technical_data`.
- **NB6 (`app/features/header/components/Header/Notifications.tsx`):** Suportar payload paginado `{ items: [...] }` de `/api/alerts`.
- **NB7 (`server/domain/portfolio/monthly_snapshot.py`):** Corrigir dupla subtração de `previous_realized` na variação mensal.
- **NB8:** Aplicar `usePrivacy()` em `MonthlyPnLChart.tsx` e filtrar `user_id == g.user_id` em `server/routes/dividends.py` e `server/routes/calendar.py`.
- **P5 (`QuantDashboard` / `useQuantData`):** Reaproveitar `ativos` do dashboard em vez de refetch duplicado de `/api/assets`.

### Novas funcionalidades adicionais (`F4–F7`)
- **F4:** Plano de Aporte em lotes inteiros (`Math.floor`) somando dividendos do mês + estimativa de aumento de renda passiva mensal.
- **F5:** Tax-Loss Harvesting + Termômetro de isenção R$ 20k integrado ao Simulador de Venda.
- **F6:** Escudo contra Inflação (série Nominal vs Real deflacionada pelo IPCA BCB SGS 433 com cache).
- **F7:** Stress Test Macroeconômico client-side na aba Quant.
