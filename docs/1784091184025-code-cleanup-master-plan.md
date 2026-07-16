# CODE CLEANUP MASTER PLAN — AssetFlow

> **Auditoria de Clean Code (somente leitura). Nenhum arquivo foi modificado.**
> Data: 2026-07-15 · Escopo: projeto completo (`app/`, `server/`, `database/`, `utils/`, `scripts/`, `public/`, config raiz, Docker).
> Metodologia: cada claim de "código morto"/"duplicado" foi verificado por busca de referências (grep/imports/rotas/testes) antes de ser listado. Itens de **Baixa/Média** confiança exigem verificação extra antes de remover (evitar falso positivo).

---

## Resumo Executivo

| Métrica | Valor |
|---|---|
| **Nível geral de qualidade** | Médio — código funcional, porém com código morto, lógica duplicada, 2 bugs de produção e arquivos "God" muito grandes. |
| **Nota (0–10)** | **6.5 / 10** |
| **Tamanho atual** | ~25.742 LOC (13.069 TS/TSX + 12.673 PY) + ~20 arquivos estáticos |
| **Estimativa de redução do projeto** | **10–15%** (LOC) com remoção de mortos + consolidação de duplicações |
| **Estimativa de redução de linhas** | **~2.500–3.800 LOC** (maior parte via deduplicação de blocos grandes + remoção de mortos) |
| **Ganho de performance** | **Médio** — correção de memoização (`page.tsx`/`useAssetData`/`usePortfolioHandlers`) elimina re-render em cascata do `Header`; remoção de `print()`/`logging.debug()` e seed cache obsoleto; splits reduzem custo de parse/bundle. |
| **Redução de complexidade** | **Alta** — split de `ReceivablesTab.tsx` (1.343), `QuantDashboard.tsx` (1.179), `refunds.py` (774), `dashboard.py` (523), `PortfolioService` (God class). |

### 🔴 Bugs críticos (fora do "clean code" puro, mas bloqueiam produção)
1. **`server/routes/assets.py:145-151`** — validação invertida: Yahoo `valid:False` → endpoint responde `valid:True` ("Será cadastrado como Manual"). Tickers inválidos aceitos como manuais.
2. **`server/services_modules/cache_helper.py:55`** — `from database.connection import Session`; módulo real é `database/session.py`. `ModuleNotFoundError` no recálculo em background.
3. **`server/requirements.txt`** — `assets_icon.py` (registrado em `backend.py`) importa `curl_cffi` e `bs4`, **ausentes** → `ImportError` em deploy limpo.
4. **`server/requirements.txt`** — `reportlab==5.0.0` é pin suspeito (linha estável 3.x/4.x); verificar existência no PyPI antes de travar build.

---

## Audit Trail — Falsos Positivos Evitados (re-verificado nesta iteração)

| Claim inicial | Verificação | Decisão |
|---|---|---|
| 6 interfaces de item em `types.ts` (`KellyItem`, etc.) são mortas | Cada uma tem 2 hits em `app/`: definição + uso interno como `items: KellyItem[]` na interface pai (ex.: `KellyData`). Zero import em `.tsx`. | **NÃO são mortas** — obrigatórias para as interfaces pai. Removidas da lista de mortas; manter só nota de drift de tipo. |
| 7 rotas de backend "nunca consumidas" | Grep em `server/` + `app/`: `/api/simulation/exposure` e `/api/news/daily-summary` **têm cobertura de teste** (`tests/test_routes.py:42,50`). As outras 5 não têm referência (frontend/teste/interna). | Manter as 2 testadas. As 5 restantes = candidatas (Média confiança). |
| `SnapshotItem` morto | `models.py:200` tem `relationship("SnapshotItem", ...)` a partir da classe pai `Snapshot`. | Remoção exige remover `Snapshot` + `SnapshotItem` + migration. Média confiança. |
| `_do_daily_snapshot` duplicado | `worker.py:106` e `worker.py:113` (corpo idêntico); `take_daily_snapshot` é real e usado (`backup.py`, `dashboard.py`, `assets.py`). | Confirmado: linha 106 é a morta (sombreada por 113). |

---

## 1. Arquivos mortos

| Caminho | Motivo | Confiança | Impacto | Dependências |
|---|---|---|---|---|
| `server/domain/quant_engine.py` | Fantasma (8 linhas, só docstring). Zero imports. | Alta | Zero | Nenhuma |
| `test_si.py` (raiz) | Script órfão (raspa logos statusinvest); não referenciado; importa `curl_cffi`/`bs4` fora do venv. | Alta | Zero | Nenhuma |
| `utils/` (só README.md) | Placeholder sem código. | Alta | Zero | Nenhuma |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | SVGs de template, nunca referenciados. | Alta | Zero | Nenhuma |
| `app/config/api.ts` (+ dir) | Único `api.ts` (`API_BASE_URL=''`), **sem `page.tsx`** → não é rota. Usado por `JarvisChat.tsx:7` e `apiClient.ts:2`. | Alta (arquivo vivo, dir mal-nomeado) | Baixo (renomear p/ `app/lib/`) | `JarvisChat.tsx`, `apiClient.ts` |
| `database/models.py` → `SnapshotItem` (+ pai `Snapshot`) | Sem query em app; só relação interna + migration. | Média | Baixo (envolve migration) | `alembic/versions/09c37de86bab_*`; classe pai `Snapshot` |
| `app/components/Skeletons.tsx` → `TableSkeleton`, `CorrelationSkeleton` | Exportados, zero import (só definição). | Alta | Baixo | Nenhuma |

### Rotas de backend sem referência (candidatas — Média confiança; podem ser chamadas por ops/cron externo)
`/api/dividends/forecast` (`routes/simulation.py:171`), `/api/correlation` (`routes/assets.py:209`, **supersedido** por `/api/simulation/correlation`), `/api/cleanup_trash` (`routes/maintenance.py:30`), `/api/maintenance/backup` (`routes/maintenance.py:53`).
> **Manter** (têm teste): `/api/simulation/exposure`, `/api/news/daily-summary` (`tests/test_routes.py:42,50`).

---

## 2. Código morto (funções/classes/métodos)

| Item | Local | Confiança | Verificação |
|---|---|---|---|
| `_do_daily_snapshot()` (1ª def) | `server/worker.py:106-108` | Alta | Definida 2x (também `113-115`); 106 sombreada/inatingível. |
| `CardExpenseCreate` | `server/schemas.py:22-26` | Alta | Importado `credit_cards.py:7`, nunca instanciado. |
| `ProfileUpdateSchema` | `server/schemas.py:32-34` | Alta | Importado `auth.py:8`; `auth.py` usa `get_json()` cru. |
| `PasswordChangeSchema` | `server/schemas.py:35-37` | Alta | Idem. |
| `get_secure_session()` local | `server/routes/market.py:56-77` | Alta | Duplica `utils/http_client.py:21`. |
| `TimeoutHTTPAdapter` local | `server/routes/market.py:69-77` | Alta | Duplica `utils/http_client.py:12`. |
| `get_secure_session()` local | `server/routes/calendar.py:22-43` | Alta | Duplica `utils/http_client.py:21`. |
| `SnapshotItem` (com pai `Snapshot`) | `database/models.py:200-212` | Média | Relação interna + migration; sem uso externo. |
| `logging.debug()` (5x) | `dashboard.py:61,202`, `backup.py:56`, `alerts.py:84`, `ollama_service.py:104` | Alta | Silenciados por `basicConfig(level=INFO)` → logs mortos. |
| `print()` (20x) | `tests/test_quant_advanced.py`, `tests/test_ai_automation.py` | Alta | Só em testes; ruído. |
| Comentários obsoletos | `backend.py:27`, `backend.py:377-378` | Alta | Descrevem código já removido. |

---

## 3. Código duplicado

| Duplicação | Arquivos | Consolidação |
|---|---|---|
| Fábrica HTTP (`get_secure_session`+`TimeoutHTTPAdapter`) | `utils/http_client.py:21`, `routes/market.py:56-77`, `routes/calendar.py:22-43` | Usar canonical nos 2 routes. |
| 6 blocos de update de índice (IBOV/IFIX/NASDAQ/S&P/DÓLAR/BTC) | `routes/market.py:85-258` (~95% iguais) | Loop parametrizado `(ticker, cache_key)`. |
| Lógica de cache repetida | `services_modules/facades.py:22-45, 47-70` | Helper `with_optional_session(fn)`. |
| Cálculo de portfólio (valuation/weights/PL) | `services_modules/backup.py:25-81` vs `dashboard.py:161-433` | `take_daily_snapshot` reusa `DashboardService`. |
| Contexto morning-brief | `routes/simulation.py:28-98` vs `dashboard.py:179-304` | Reusar `get_dashboard_data`. |
| Máquina de estado de pagamento | `routes/refunds.py` `process_single_payment:344-445`, `pay_global_debtor:674-774`, `pay_batch:472-495` | Extrair `apply_payment_to_installments()`. |
| Scaffold de modal | `AddAssetModal`, `EditModal`, `IncomeProjectionModal`, `SmartAllocationModal`, `AssetDetailsModal` | `ModalShell` compartilhado. |
| Skeletons | `Skeletons.tsx`, `SkeletonLoading.tsx`, `ui/QuantSkeletons.tsx` | 1 arquivo + primitivo base. |
| Tooltip/Portal | `AssetTooltip.tsx`, `CategorySummary.tsx` (2 tooltips) | Hook `useFloatingTooltip`. |
| Tipos duplicados | `types.ts:DashboardData/InstallmentItem` vs locais `ReceivablesTab.tsx:59,31`, `CreditCardsTab.tsx:38,20` | Tipos centrais em `types.ts`. |
| ngrok hardcoded | `docker-compose.dev.yml:98`, `next.config.ts:29`, `scripts/dev.ps1:3` | 1 env var. |

---

## 4. Dependências

| Dependência | Ação | Confiança |
|---|---|---|
| `curl-cffi` | **ADICIONAR** `requirements.txt` | Alta (import top-level `assets_icon.py`) |
| `beautifulsoup4` (`bs4`) | **ADICIONAR** `requirements.txt` | Alta |
| `pytz` (linha 20, dup) | **REMOVER** linha duplicada | Alta (já em `pytz==2026.2`) |
| `reportlab==5.0.0` | **VERIFICAR PIN** (ajustar p/ 3.x/4.x) | Alta |
| `sentry-sdk[flask]` (linha 18) | **LIMPAR** whitespace | Alta |
| npm (10 deps) | **NENHUMA removível** | Alta |
| pip (demais) | **NENHUMA removível** | Alta |

**Nenhuma dependência npm/pip está realmente "não usada".**

---

## 5. Complexidade (hotspots)

| Arquivo | LOC | Problema |
|---|---|---|
| `app/components/ReceivablesTab.tsx` | 1.343 | 1 componente, 20+ `useState`, 5 modals. |
| `app/components/QuantDashboard.tsx` | 1.179 | 4 sub-abas + simuladores + relatórios. |
| `server/routes/refunds.py` | 774 | 11 endpoints — viola SRP. |
| `server/services_modules/dashboard.py` | 523 | Engine + métricas + alertas + assembly. |
| `server/routes/quant_analysis.py` | 476 | 8 endpoints + `calculate_local_fear_greed` (83). |
| `server/infrastructure/market_data.py` | 424 | `update_fundamentals` (160), `sync_reports_with_fnet` (138). |
| `server/worker.py` | 387 | Scheduler + wrappers + state machine. |
| `server/backend.py` | 383 | Factory + blueprints + worker + recovery. |
| `server/routes/simulation.py` | 368 | Morning brief + 5 simulações. |
| `server/routes/market.py` | 291 | 6 blocos duplicados. |
| `server/routes/assets.py` | 289 | 6 endpoints + threading. |
| `server/services.py` → `PortfolioService` | 127 (classe) | God class: 6 mixins, 100+ métodos. |
| `app/components/RiskMetricsPanel.tsx` | 553 | Fetch + tabs + cards + charts. |
| `app/components/AssetDetailsModal.tsx` | 520 | TradingView + alerts + AI + RI parser. |
| `app/components/CreditCardsTab.tsx` | 506 | Cards + expenses + invoices + dashboard. |

**Funções grandes (>50):** `dashboard.get_dashboard_data` (~275), `routes/market.update_market_cache` (~182), `infrastructure.market_data.update_fundamentals` (~160), `dashboard._apply_strategy` (~95), `refunds.process_single_payment` (~101), `refunds.pay_global_debtor` (~100), `refunds.get_dashboard_data` (~108), `QuantDashboard.renderScatterChart` (useMemo, 73).

---

## 6. React / Next.js

- **Deps instáveis** (`app/page.tsx:88,115,121`): `notify` recriado por render → 2 `useEffect` disparam tota render. → `useCallback`.
- **Cascata de re-render** (`useAssetData.ts:137-144`, `usePortfolioHandlers.ts:80-89`): `mutateSync`/`mutateFundamentals`/objeto handler recriados por render; `Header` é `React.memo` mas recebe callbacks instáveis → memo ineficaz. → `useCallback`/`useMemo`.
- **Props drilling** (`page.tsx:276-292`): `Header` recebe 14 props; `ToolsMenu` repetido em 3 breakpoints.
- **Estado redundante** (`useAssetData.ts:63-64`): `mutateDashboardRef` atualizado toda render, sem benefício.
- **useMemo ausente** (`page.tsx:96-113`): `portfolioTabs`/`analyticsTabs` recriados com JSX inline.
- **useEffect polling** (`AssetNewsPanel.tsx:66-87`): `news.length` nas deps reinicia intervalo.
- **Exports inconsistentes**: `FixedIncomeTab.tsx:31`, `CreditCardsTab.tsx:51`, `ReportModal.tsx:51/364` usam `export default`.
- **`app/utils.ts` vs `app/utils/`**: `formatMoney`/`getStatusBg` num arquivo, `apiClient.ts` noutro. Consolidar.

---

## 7. Backend

- Validação invertida `routes/assets.py:145-151` (bug).
- Import quebrado `cache_helper.py:55` `database.connection` (bug).
- `traceback.print_exc()` `backend.py:158` em handler global → loga stderr, contorna logging.
- Schemas Pydantic não usados (§2).
- `/api/correlation` duplica `/api/simulation/correlation`.
- `dashboard.get_dashboard_data` (~275 linhas, single request) — candidato a paginação/cache.
- Seed cache hardcoded `routes/market.py:14-19` (flash de dado obsoleto no cold start).
- `SECRET_KEY` fallback `backend.py:79-83` (`token_hex` se env faltar) → sessões invalidam a cada restart.

---

## 8. Docker / Estrutura

- **`.dockerignore`** não exclui `server/` nem `database/`; `Dockerfile` faz `COPY . .` → backend + SQLite no contexto do frontend. Adicionar.
- **Dev frontend** `docker-compose.dev.yml:73` roda `npm install` todo start (conflita com volume `node_modules`).
- **Env duplicado** dev/prod (OLLAMA_*, SECRET_KEY, SENTRY_DSN, ENVIRONMENT) → YAML anchors.
- **`scripts/dev.ps1` vs `dev.sh`** divergem (`.ps1` sobe ngrok). Padronizar.
- **`__init__.py` ausente** em `server/crawlers/` e `server/utils/`.
- **`database/__pycache__/`** (3 ABIs) e `database/asset_flow.db` commitados — hook `forbid-python-cache` só escaneia staged; adicionar ao `.gitignore`.
- **`favicon.ico`** declarado em `layout.tsx:13` mas inexistente → 404.

---

## Refatorações Priorizadas

### ALTA (bugs / quebra deploy)
1. Corrigir validação invertida — `routes/assets.py:145-151`. *Risco: Baixo · Benefício: Alto.*
2. Fixar import `database.connection`→`database.session` — `cache_helper.py:55`. *Baixo · Alto.*
3. Adicionar `curl-cffi`+`beautifulsoup4`; limpar `pytz` dup, `reportlab` pin, whitespace — `requirements.txt`. *Baixo · Alto.*
4. Remover código morto trivial — `quant_engine.py`, `_do_daily_snapshot` duplicado, 3 schemas, `TableSkeleton`/`CorrelationSkeleton`, `utils/`, SVGs `public/`. *Baixo · Médio.*
5. Remover `traceback.print_exc()` — `backend.py:158` (usar `current_app.logger.exception`). *Baixo · Médio.*

### MÉDIA (deduplicação / complexidade)
6. Consolidar fábrica HTTP — `market.py`/`calendar.py` usam `utils/http_client.py`. *Baixo · Médio.*
7. Parametrizar 6 blocos de índice — `routes/market.py:85-258`. *Médio · Médio (~-140 LOC).*
8. Split `ReceivablesTab.tsx` (1.343) em `debtors`/`loans`/`payments`/`installments`+modals. *Médio · Alto.*
9. Split `QuantDashboard.tsx` (1.179) por sub-aba. *Médio · Alto.*
10. Split `refunds.py` (774) em `debtors`/`loans`/`payments`. *Médio · Alto.*
11. Extrair máquina de pagamento — `refunds.py` 3 funções → `apply_payment_to_installments`. *Médio · Médio.*
12. Memoização `page.tsx`/`useAssetData`/`usePortfolioHandlers` — corta cascata de re-render do `Header`. *Médio · Alto.*
13. Consolidar cálculo de portfólio — `backup.take_daily_snapshot` reusa `DashboardService`. *Médio · Médio.*

### BAIXA (polish / estrutura)
14. Skeletons/Modal/Tooltip compartilhados. *Baixo · Médio.*
15. Tipos duplicados → centralizar `types.ts`; validar contrato backend↔frontend. *Baixo · Médio.*
16. `app/config/`→`app/lib/`, `app/utils.ts`→`app/utils/`. *Baixo · Baixo.*
17. Docker/.dockerignore/env — excluir `server/`/`database/`, anchors, `dev.sh`/`.ps1`. *Baixo · Baixo.*
18. `.gitignore` p/ cache/db commitado; limpar. *Baixo · Baixo.*
19. Remover `print()` de testes + `logging.debug()` mortos. *Baixo · Baixo.*
20. Padronizar exports (named) + `__init__.py` em `crawlers/`/`utils/`. *Baixo · Baixo.*

---

## Plano de Execução Ordenado

Cada tarefa é isolada. **Validação** = comando/check pós-mudança. **Falha** = sinal de rollback. **Rollout** = como entregar.

| # | Tarefa | Arquivos | Validação | Falha / Risco | Rollout |
|---|---|---|---|---|---|
| 1 | Corrigir validação invertida de ticker | `routes/assets.py` | Teste manual: ticker inválido → `valid:False`. | Baixo | Patch direto; sem migration. |
| 2 | Fixar import `database.connection`→`database.session` | `cache_helper.py` | `python -c "from services_modules.cache_helper import *"`; rodar job de recálculo. | Baixo | Patch direto. |
| 3 | Adicionar `curl-cffi`+`beautifulsoup4`; limpar `pytz` dup, `reportlab` pin, whitespace | `requirements.txt` | `pip install -r requirements.txt` limpo; `python -c "import curl_cffi, bs4"`; `pytest` backend. | Baixo | Rebuild imagem. |
| 4 | Remover `traceback.print_exc()` | `backend.py` | `pytest`; checar log de erro via `current_app.logger`. | Baixo | Patch direto. |
| 5 | Remover mortos triviais | `quant_engine.py`, `worker.py:106`, `schemas.py`, `Skeletons.tsx`, `utils/`, `public/*.svg` | `eslint`; `pytest`; build frontend. | Baixo | Patch direto. |
| 6 | Consolidar fábrica HTTP | `market.py`, `calendar.py`, `http_client.py` | `pytest` rotas de mercado/calendário. | Baixo | Patch direto. |
| 7 | Parametrizar 6 blocos de índice | `routes/market.py` | `pytest` de update de índices; valores iguais pré/pós. | Médio | Feature em branch; comparar cache. |
| 8 | `useCallback`/`useMemo` (memoização) | `page.tsx`, `useAssetData.ts`, `usePortfolioHandlers.ts` | Sem regressão visual; `Header` não re-renderiza em todo state change (React DevTools). | Médio | Branch; testar fluxo de refresh/sync. |
| 9 | `useMemo` em `portfolioTabs`/`analyticsTabs` | `page.tsx` | Igual #8. | Baixo | Com #8. |
| 10 | Corrigir `useEffect` polling (`news.length`) | `AssetNewsPanel.tsx` | Polling estável; sem reset a cada update. | Baixo | Patch direto. |
| 11 | Extrair máquina de pagamento | `routes/refunds.py` | `pytest` de fluxos PARCIAL/ANTECIPADO/EXCESSO/LIQUIDADO. | Médio | Branch; suíte de pagamentos. |
| 12 | Split `ReceivablesTab.tsx` | `ReceivablesTab.tsx` + novos | `npm run build`; teste manual de todas as abas/modais. | Médio | Branch; QA manual. |
| 13 | Split `QuantDashboard.tsx` | `QuantDashboard.tsx` + novos | `npm run build`; teste das 4 sub-abas. | Médio | Branch; QA manual. |
| 14 | Split `refunds.py` | `refunds.py` + módulos | `pytest` de todas as rotas de refunds. | Médio | Branch; suíte refunds. |
| 15 | `take_daily_snapshot` reusa `DashboardService` | `backup.py`, `dashboard.py` | `pytest` de snapshot + dashboard; valores iguais. | Médio | Branch; comparar saída. |
| 16 | Consolidar cache em `facades.py` | `facades.py` | `pytest` de correlação/risk metrics; cache hit consistente. | Baixo | Patch direto. |
| 17 | `MorningBrief` reusa `get_dashboard_data` | `simulation.py`, `dashboard.py` | `pytest` de morning brief; valores iguais. | Médio | Branch; comparar. |
| 18 | UI compartilhada (ModalShell/Tooltip/Skeletons) | `app/components/*` | `npm run build`; teste visual de modais/tooltips/skeletons. | Baixo | Branch; QA visual. |
| 19 | Centralizar tipos duplicados | `types.ts`, `ReceivablesTab.tsx`, `CreditCardsTab.tsx` | `tsc` (typecheck) sem erros. | Baixo | Branch; typecheck. |
| 20 | Renomear `app/config/`→`app/lib/`, `utils.ts`→`utils/` | `config/api.ts`, `utils.ts`, `JarvisChat.tsx`, `apiClient.ts` | `npm run build`. | Baixo | Branch; atualizar imports. |
| 21 | `.dockerignore` exclui `server/`/`database/`; anchors; `dev.sh`/`.ps1` | `.dockerignore`, `docker-compose.*.yml`, `scripts/` | Build frontend mais rápido; `docker compose build`. | Baixo | Rebuild imagens. |
| 22 | `.gitignore` p/ cache/db; limpar commitados | `.gitignore`, `database/` | `git status` limpo de `__pycache__`/`asset_flow.db`. | Baixo | Commit do .gitignore + rm cache. |
| 23 | Remover `print()` testes + `logging.debug()` mortos | `tests/*`, `dashboard.py`, `backup.py`, `alerts.py`, `ollama_service.py` | `pytest`; `grep -r "print(" tests/` vazio. | Baixo | Patch direto. |
| 24 | Padronizar exports (named) + `__init__.py` | `FixedIncomeTab`, `CreditCardsTab`, `ReportModal`, `server/crawlers/`, `server/utils/` | `eslint`; `pytest` (imports do package). | Baixo | Patch direto. |
| 25 | Avaliar remoção de rotas órfãs (Média confiança) | `simulation.py`, `assets.py`, `maintenance.py` | Confirmar com ops se há chamada externa/cron **antes** de remover. | Médio | Só após confirmação. |
| 26 | Avaliar `SnapshotItem`+`Snapshot` + migration (Média) | `models.py`, `alembic/versions/09c37de86bab_*` | Confirmar se snapshot é usado; criar migration de drop se aprovado. | Médio | Só após confirmação + migration. |

---

## Validação Global / Failure Modes / Rollout

**Comandos de validação (não mutantes):**
- Frontend: `npm run lint` e `npx tsc --noEmit` (typecheck) — devem passar após qualquer edição de `app/`.
- Backend: `pytest server/tests` (suíte existente, inclui `test_routes.py`) — deve passar após qualquer edição de `server/`.
- Build: `npm run build` (Next) e `docker compose build` (após mudanças de deps/Docker).

**Failure modes:**
- Remoção de mortos mal-verificada quebra import → pego por `lint`/`tsc`/`pytest` (Tarefas 5, 19, 24).
- Split de componente grande introduz regressão visual → validar com QA manual + `npm run build` (Tarefas 12, 13).
- Deduplicação de pagamento/cache altera valores → comparar saída pré/pós via `pytest` (Tarefas 11, 15, 16, 17).
- Mudança de deps quebra deploy → `pip install -r requirements.txt` limpo + `pytest` (Tarefa 3).

**Rollout / Migração:**
- Tarefas 1–7, 10, 16, 23, 24: patches diretos de baixo risco (sem migration).
- Tarefas 8, 9, 12, 13, 14, 18, 19, 20, 21: em branch, validar com build + QA antes de merge.
- Tarefas 15, 17: em branch, comparar saída de dados.
- Tarefas 25, 26: **não executar sem confirmação explícita do usuário** (rotas podem ser chamadas por ops/cron externo; `Snapshot` pode ter uso não mapeado).
- Nenhuma migration de DB necessária exceto Tarefa 26 (se aprovada).

**Nenhum arquivo foi modificado. Este é um plano de auditoria apenas.**
