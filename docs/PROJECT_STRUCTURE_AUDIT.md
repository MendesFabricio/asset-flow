# 🏗️ PROJECT STRUCTURE AUDIT — AssetFlow Pro

> **Auditoria de arquitetura (somente leitura). Nenhum arquivo foi modificado.**
> Data: 2026-07-16 · Escopo: projeto completo (`app/`, `server/`, `database/`, `utils/`, `scripts/`, `public/`, `backups/`, config raiz, Docker).
> Metodologia: listagem de árvore, contagem de LOC por arquivo, leitura de responsabilidades, verificação de imports/referências e cross-check com o `graphify-out/` (951 nós, 84 comunidades).

---

## 1. Nota Geral da Arquitetura

**6.0 / 10**

A separação em três camadas containerizadas (Next.js / Flask / Worker) e a organização coerente do backend Python (`domain/`, `infrastructure/`, `routes/`, `services_modules/`, `crawlers/`, `alembic/`) são pontos fortes reais. Porém há:

- Mistura de responsabilidades no backend (rotas abrem `Session()` diretamente — 68 ocorrências — em vez de passar pelos services).
- "God components" no frontend (`ReceivablesTab.tsx` ~1.307 linhas, `QuantDashboard.tsx` ~1.178).
- Camada `utils/` (raiz) vazia / placeholder e `database/` deslocada da raiz do backend.
- Convenções e documentação defasadas (READMEs citam `app/config/api.ts` e `HealthIndicator.tsx` que **não existem** mais).
- Artefatos commitados que não deveriam (`__pycache__/`, `*.db`, `data/cvm_cache/*.zip` gigantes, `backups/*.db` diários).
- Duplicação de tipos/UI no frontend e de fábrica HTTP no backend.

---

## 2. Principais Problemas

### Frontend (`app/`)
| Problema | Evidência | Prioridade |
|---|---|---|
| God components (UI + lógica + fetch + modais) | `components/ReceivablesTab.tsx` ~1.307, `components/QuantDashboard.tsx` ~1.178, `RiskMetricsPanel.tsx` ~553, `AssetDetailsModal.tsx` ~512, `CreditCardsTab.tsx` ~488 | **Alta** |
| Tipos duplicados (locais vs `types.ts`) | `ReceivablesTab.tsx`, `CreditCardsTab.tsx` redefinem tipos já em `types.ts` | Média |
| UI compartilhada duplicada | `Skeletons.tsx` (`SkeletonLoading`, `MonteCarloSkeleton`, `MetricsGridSkeleton`) + `ui/QuantSkeletons.tsx` (citado) + `ui/Skeleton.tsx` | Média |
| Scaffold de modal repetido | `AddAssetModal`, `EditModal`, `IncomeProjectionModal`, `SmartAllocationModal`, `AssetDetailsModal` | Baixa |
| Exports inconsistentes | `export default` misturado com named em `page.tsx`, `layout.tsx`, `perfil`, `login`, `avancado`, `agenda` (pages OK) + `FixedIncomeTab`, `CreditCardsTab`, `ReportModal` | Baixa |
| `apiCall` vive em `utils/apiClient.ts`, helpers em `utils/index.ts` — OK, mas `utils.ts` citado no plano não existe | `app/utils/` só tem 2 arquivos | Baixa |
| Cascata de re-render / memoização ausente | `page.tsx`, `useAssetData.ts`, `usePortfolioHandlers.ts` (já mapeado no plano) | Média |

### Backend (`server/`)
| Problema | Evidência | Prioridade |
|---|---|---|
| Rotas misturam controller + data-access (abrem `Session()` direto) | 68 ocorrências em `routes/**` (auth, assets, market, dividends, credit_cards, refunds/*, ai, quant_analysis, etc.) — devia passar por `services_modules/` | **Alta** |
| God modules | `routes/refunds.py` (antes único, agora splitado parcialmente em `refunds/`), `services_modules/dashboard.py` ~226, `routes/quant_analysis.py` ~476, `infrastructure/market_data.py` ~424 | **Alta** |
| Fábrica HTTP duplicada | `utils/http_client.py` vs cópias locais em `routes/market.py` e `routes/calendar.py` | Média |
| 6 blocos de update de índice ~95% idênticos | `routes/market.py:85-258` | Média |
| Import quebrado | `cache_helper.py:55` `from database.connection import Session` (real é `database/session.py`) → `ModuleNotFoundError` | **Alta (bug)** |
| Validação invertida de ticker | `routes/assets.py:145-151` (Yahoo `valid:False` → responde `valid:True`) | **Alta (bug)** |
| `requirements.txt` incompleto | `assets_icon.py` importa `curl_cffi`/`bs4` ausentes; `reportlab==5.0.0` pin suspeito | **Alta (bug deploy)** |
| `database.connection` vs `database/session` | naming inconsistency entre camadas | Baixa |
| `worker.py` (374) faz scheduler + wrappers + state machine | mistura de concerns | Média |

### Camadas / Raiz
| Problema | Evidência | Prioridade |
|---|---|---|
| `database/` na raiz, separada do `server/` que a consome | `server/` importa `database.models`/`database.session`; `database/` fora da árvore do backend | **Alta** |
| `utils/` (raiz) vazia — só README | placeholder; código real está em `server/utils/` e `app/utils/` | Média |
| Artefatos commitados | `server/__pycache__/`, `server/assetflow.db`, `server/assetflow_profile.db`, `server/data/cvm_cache/*.zip` (~800KB cada), `backups/*.db` (15 arquivos diários), `database/__pycache__/`, `database/asset_flow.db` (0b) | **Alta** |
| `.dockerignore` não exclui `server/`/`database/` no build do frontend | `Dockerfile` faz `COPY . .` | Média |
| Documentação defasada | `app/README.md` cita `app/config/api.ts` e `HealthIndicator.tsx` (ausentes); `utils/README.md` descreve pacote vazio | Média |

### Docker / Infra
| Problema | Evidência | Prioridade |
|---|---|---|
| Dev frontend roda `npm install` todo start conflitando com volume `node_modules` | `docker-compose.dev.yml:73` | Média |
| Env duplicado dev/prod (OLLAMA_*, SECRET_KEY, SENTRY_DSN) | `docker-compose.dev.yml` / `.prod.yml` | Baixa |
| `scripts/dev.ps1` sobe ngrok; `dev.sh` não — divergência | `scripts/` | Baixa |
| ngrok hardcoded em 3 lugares | `docker-compose.dev.yml`, `next.config.ts`, `scripts/dev.ps1` | Baixa |

---

## 3. Estrutura Atual

```
asset-flow/
├── app/                      # Next.js 16 / React 19 (frontend)
│   ├── agenda/ page.tsx
│   ├── api/ auth/{login,logout,register}, sync/stream   # Route Handlers (proxy p/ backend)
│   ├── avancado/ page.tsx
│   ├── components/           # 40 arquivos .tsx (mistura UI grande + ui/ + Header/)
│   │   ├── ui/ (Badge, Card, Markdown, PrivateValue, Skeleton, Skeletons)
│   │   ├── Header/ (Header, Logo, MarketStatus, MarketTicker, NewAssetButton,
│   │   │          Notifications, PortfolioSummary, SystemStatus, ToolsMenu, UserMenu, index)
│   │   └── ~28 componentes de domínio (god components inclusos)
│   ├── context/ PrivacyContext.tsx
│   ├── hooks/ useAssetData, useFloatingTooltip, usePortfolioHandlers, usePortfolioMetrics
│   ├── login/ page.tsx
│   ├── perfil/ page.tsx
│   ├── store/ modalStore.ts (zustand)
│   ├── types.ts
│   ├── utils/ apiClient.ts, index.ts (formatMoney, getStatusBg)
│   ├── globals.css, layout.tsx, favicon.ico, README.md
├── server/                   # Flask / Gunicorn (backend)
│   ├── backend.py            # factory + blueprints + worker bootstrap + recovery
│   ├── worker.py / worker_core.py / worker_jobs.py / worker_state.py
│   ├── schemas.py            # Pydantic (vários não usados)
│   ├── services.py           # PortfolioService (god class)
│   ├── routes/               # ~28 blueprints (abrem Session direto)
│   │   ├── refunds/ (config, dashboard, debtors, loans, payments, utils)
│   │   └── assets_icon.py   # importa curl_cffi/bs4 (ausentes)
│   ├── services_modules/     # backup, cache_helper(*bug*), categories, dashboard,
│   │   │                     # dashboard_alerts, dashboard_metrics, facades, integration, portfolio
│   ├── domain/ quant_engine.py (fantasma) + quant/ (analysis, correlation, exposure,
│   │   │                     # helpers, monte_carlo, optimization, projection, rebalance, risk)
│   ├── infrastructure/ market_data, ollama_service, price_cache
│   ├── crawlers/ b3_fnet, cvm_enet
│   ├── utils/ cnpj_finder, cvm_finder, cvm_processor, date_helper, db_utils,
│   │   │      fii_processor, formatters, http_client, pdf_extractor, pdf_generator, ticker_helper
│   ├── alembic/ + versions/  # migrations (algumas duplicadas/invertidas)
│   ├── data/ cvm_cache/*.zip, reports/
│   ├── tests/ 10 arquivos de teste
│   ├── Dockerfile, requirements.txt, alembic.ini, README.md
│   └── assetflow.db, assetflow_profile.db  (commitados!)
├── database/                 # models.py (33KB!), session.py, lock.py, README.md
│   └── __pycache__/, asset_flow.db (commitados!)
├── utils/                    # RAIZ — só README.md (placeholder vazio)
├── scripts/                  # clean/dev/prod/rebuild (.sh + .ps1)
├── public/                   # VAZIO
├── backups/                  # 15x assetflow_backup_*.db (commitados!)
├── .agents/ .kilo/ .github/ graphify-out/   # meta/config
├── Dockerfile, docker-compose.{yml,dev.yml,prod.yml}
├── middleware.ts, next.config.ts, eslint.config.mjs, postcss.config.mjs
├── sentry.client/server.config.ts, next-env.d.ts, tsconfig*.json
├── .env* , .gitignore, .dockerignore, .pre-commit-config.yaml, .geminiignore
├── test_si.py                # script órfão (raspa statusinvest, fora do venv)
├── 1784091184025-code-cleanup-master-plan.md   # plano limpo anterior
└── README.md, AGENTS.md, assetflow-roadmap.md
```

**Contagem aproximada:** ~13k LOC TS/TSX + ~12.7k LOC PY + ~20 arquivos estáticos + artefatos de dados enormes (`data/cvm_cache/*.zip` ~800KB cada, `backups/` 15 DBs).

---

## 4. Estrutura Recomendada

### Princípio: colapsar `database/` dentro de `server/`, eliminar `utils/` (raiz) vazia, e aplicar **Feature-Based** no frontend + **Layered** no backend.

```
asset-flow/
├── app/                                  # Next.js
│   ├── (routes)/                         # pages por feature
│   │   ├── dashboard/ page.tsx           # era app/page.tsx
│   │   ├── agenda/ page.tsx
│   │   ├── avancado/ page.tsx
│   │   ├── perfil/ page.tsx
│   │   ├── login/ page.tsx
│   │   └── api/ ...                      # route handlers (proxy)
│   ├── features/                         # feature-based, cada uma com seus próprios
│   │   ├── assets/                      #   components/ hooks/ (ReceivablesTab splitado aqui)
│   │   │   ├── components/ AssetsTable, AssetRow, AddAssetModal, EditModal, AssetDetailsModal...
│   │   │   ├── hooks/ useAssetData, usePortfolioHandlers, usePortfolioMetrics
│   │   │   └── tabs/ Receivables(debtors/loans/payments/installments), FixedIncome, CreditCards
│   │   ├── quant/                       # QuantDashboard splitado em sub-abas
│   │   │   ├── components/ RiskMetricsPanel, MonteCarloChart, CorrelationHeatmap, RiskRadar...
│   │   │   └── hooks/
│   │   ├── news/ AssetNewsPanel, MorningBriefing
│   │   ├── header/ (components/Header/*)
│   │   └── jarvis/ JarvisChat
│   ├── components/ui/                    # design system (Badge, Card, ModalShell, Skeleton unificado)
│   ├── lib/                             # apiClient, formatters, constants, hooks genéricos
│   │   ├── api.ts                       # era utils/apiClient.ts
│   │   ├── format.ts                    # era utils/index.ts (formatMoney, getStatusBg)
│   │   └── hooks/ useFloatingTooltip
│   ├── store/ modalStore.ts
│   ├── context/ PrivacyContext.tsx
│   ├── types/ index.ts                  # tipos centrais (sem duplicação por feature)
│   ├── styles/ globals.css
│   └── layout.tsx, favicon.ico
│
├── server/                              # Flask — tudo de backend num só pacote
│   ├── app.py / factory.py              # era backend.py (só factory + register)
│   ├── worker/                          # era worker*.py (scheduler isolado)
│   │   ├── __init__.py, scheduler.py, jobs.py, state.py, core.py
│   ├── api/                             # rotas = controllers magros (NÃO abrem Session)
│   │   ├── assets.py, auth.py, market.py, news.py, dividends.py,
│   │   ├── credit_cards.py, fixed_income.py, alerts.py, alerts_price.py,
│   │   ├── quant_analysis.py, simulation.py, ai.py, calendar.py,
│   │   ├── scheduler.py, health.py, dashboard.py, maintenance.py, sync_stream.py
│   │   └── refunds/ (config, dashboard, debtors, loans, payments, utils)
│   ├── services/                        # camada de serviço (business logic + data access)
│   │   ├── portfolio.py, dashboard.py, backup.py, categories.py,
│   │   ├── cache.py (era cache_helper), integration.py, facades.py
│   │   └── refunds/ (debtors, loans, payments)  # extrai apply_payment_to_installments
│   ├── domain/                          # regras puras, sem I/O
│   │   ├── quant/ (analysis, correlation, exposure, helpers, monte_carlo,
│   │   │         optimization, projection, rebalance, risk)
│   │   └── (remover quant_engine.py fantasma)
│   ├── infrastructure/                   # I/O: market_data, ollama_service, price_cache, http_client
│   ├── crawlers/ b3_fnet, cvm_enet
│   ├── db/                              # era database/ (MOVER PARA DENTRO DO SERVER)
│   │   ├── models.py, session.py, lock.py, migrations/ (era alembic/versions)
│   │   └── alembic.ini / env.py
│   ├── schemas/ (ou manter schemas.py)  # Pydantic usados (remover mortos)
│   ├── utils/                           # server/utils/* já existe — manter
│   ├── tests/  (mover para server/tests ou tests/ na raiz)
│   └── data/ (NÃO commitar cvm_cache/reports — mover p/ volume docker)
│
├── infrastructure/                      # Docker/composes/scripts (separar de código)
│   ├── docker/ Dockerfile.frontend, Dockerfile.backend, docker-compose.{yml,dev,prod}
│   └── scripts/ dev/prod/clean/rebuild (.sh + .ps1 unificados)
├── public/                              # assets estáticos (hoje vazio)
├── docs/                                # READMEs internos + auditorias (mover 1784...md, roadmap)
├── .github/ .agents/ .kilo/ graphify-out/
├── .env* .gitignore .dockerignore .pre-commit-config.yaml
└── package.json, tsconfig*.json, next.config.ts, eslint.config.mjs, postcss.config.mjs, middleware.ts, sentry.*.config.ts
```

> Nota: `utils/` (raiz) **some** — seu conteúdo é apenas README; o código utilitário já vive em `server/utils/` e `app/lib/`.

---

## 5. Arquivos Fora do Lugar

| Arquivo | Onde está | Onde deveria | Prioridade |
|---|---|---|---|
| `database/` (inteira) | raiz | `server/db/` | **Alta** |
| `database/asset_flow.db` (0b) e `database/__pycache__/` | commitados | `.gitignore` + remover | **Alta** |
| `server/assetflow.db`, `server/assetflow_profile.db` | commitados no backend | volume docker / `.gitignore` | **Alta** |
| `server/data/cvm_cache/*.zip` (~800KB c/u) | no repo | volume docker (não commitar) | **Alta** |
| `backups/*.db` (15) | raiz commitado | volume docker / `.gitignore` | **Alta** |
| `utils/README.md` | raiz (pasta vazia) | remover pasta | Média |
| `test_si.py` | raiz | remover (órfão) ou `server/scripts/` | Média |
| `1784091184025-code-cleanup-master-plan.md` | raiz | `docs/` | Baixa |
| `assetflow-roadmap.md` | raiz | `docs/` | Baixa |
| `routes/assets_icon.py` | em `routes/` | `infrastructure/` ou `crawlers/` (é scraping/I/O) | Baixa |
| `app/utils/apiClient.ts` + `app/utils/index.ts` | `app/utils/` | `app/lib/` (padronizar com backend) | Baixa |

---

## 6. Pastas Desnecessárias

| Pasta | Motivo | Prioridade |
|---|---|---|
| `utils/` (raiz) | só README; código real está em `server/utils/` e `app/lib/` | **Alta** |
| `public/` | vazio (sem assets referenciados) | Baixa |
| `server/domain/quant_engine.py` | arquivo fantasma (8 linhas, só docstring, zero imports) | Média |
| `.pytest_cache/` (raiz) e `server/.pytest_cache/` | cache de teste commitado | **Alta** |
| `__pycache__/` espalhados (`server/`, `database/`) | bytecode commitado | **Alta** |
| `.next/` | build output (já deve estar ignorado; confirmar) | Baixa |

---

## 7. Pastas Faltando

| Pasta | Por quê | Prioridade |
|---|---|---|
| `app/features/` (ou `app/domains/`) | agrupar componentes/hooks por feature (Receivables, Quant, News, Header, Jarvis) | **Alta** |
| `app/lib/` | centralizar apiClient, formatters, constants, hooks genéricos | **Alta** |
| `app/types/` (ou `app/types.ts` expandido) | tipos centrais sem duplicação | Média |
| `server/db/` (mover `database/`) | backend coeso num pacote | **Alta** |
| `server/services/refunds/` | extrair máquina de pagamento de `refunds.py` | Média |
| `server/worker/` (agrupar `worker*.py`) | scheduler isolado e coeso | Média |
| `infrastructure/` (docker/scripts) | separar deploy de código-fonte | Baixa |
| `docs/` | auditorias e roadmap fora da raiz | Baixa |

---

## 8. Sugestão de Reorganização Completa

1. **Backend coeso:** mover `database/` → `server/db/`; renomear `cache_helper.py` → `cache.py` e corrigir import; transformar `worker*.py` em pacote `server/worker/`; mover `routes/assets_icon.py` para `infrastructure/`.
2. **Camada de serviço estrita:** rotas deixam de abrir `Session()`; exigir chamada a `services/`. Extrair `apply_payment_to_installments` de `refunds`.
3. **Frontend feature-based:** criar `app/features/{assets,quant,news,header,jarvis}/` movendo componentes/hooks; `app/components/ui/` vira design system; `app/lib/` recebe apiClient/formatters/hooks genéricos.
4. **Tipos centralizados:** `app/types.ts` única fonte; remover duplicatas em `ReceivablesTab`/`CreditCardsTab`.
5. **UI compartilhada:** unificar skeletons (`ui/Skeleton.tsx` + `ui/Skeletons.tsx` + `QuantSkeletons`) e usar `ModalShell` em todos os modais.
6. **Limpeza de repo:** `.gitignore` para `__pycache__/`, `*.db`, `data/cvm_cache/`, `backups/`, `.pytest_cache/`, `.next/`; remover `utils/` (raiz) e `test_si.py`.
7. **Docker:** `.dockerignore` exclui `server/`/`database/` no build do frontend; `infrastructure/docker/` concentra composes; `infrastructure/scripts/` unifica `.sh`/`.ps1`.
8. **Docs:** mover auditoria/roadmap para `docs/`; atualizar READMEs para refletir estrutura real (`app/config/api.ts` e `HealthIndicator.tsx` não existem).

---

## 9. Ordem Recomendada para Mover os Arquivos

> Tudo **sem alterar comportamento** — apenas realocação + atualização de imports.

| # | Ação | Arquivos | Prioridade | Risco |
|---|---|---|---|---|
| 1 | Adicionar ao `.gitignore` e remover do repo: `__pycache__/`, `*.db`, `data/cvm_cache/`, `backups/*.db`, `.pytest_cache/`, `utils/`(raiz) | repo-wide | **Alta** | Baixo |
| 2 | Mover `database/` → `server/db/` e atualizar imports (`database.models`→`server.db.models`, `database.session`→`server.db.session`) | `server/**` | **Alta** | Médio |
| 3 | Corrigir bug `cache_helper.py:55` (`database.connection`→`database.session`) | `cache_helper.py` | **Alta** | Baixo |
| 4 | Agrupar `worker*.py` → `server/worker/` | `worker.py,worker_core.py,worker_jobs.py,worker_state.py` | Média | Médio |
| 5 | Criar `app/lib/` e mover `app/utils/*` para lá; atualizar imports | `apiClient.ts`, `index.ts` | **Alta** | Baixo |
| 6 | Criar `app/features/` e distribuir componentes/hooks por feature | `app/components/*`, `app/hooks/*` | **Alta** | Médio |
| 7 | Unificar `app/components/ui/` (Skeleton/Skeletons/QuantSkeletons) | `ui/*` | Baixa | Baixo |
| 8 | Centralizar tipos em `app/types.ts`; remover duplicatas | `types.ts`, tabs | Média | Baixo |
| 9 | Mover `routes/assets_icon.py` → `server/infrastructure/` | `assets_icon.py` | Baixa | Baixo |
| 10 | Mover composes/scripts → `infrastructure/` | `docker-compose*`, `Dockerfile`, `scripts/*` | Baixa | Baixo |
| 11 | Mover auditoria/roadmap → `docs/` | `1784...md`, `assetflow-roadmap.md` | Baixa | Baixo |
| 12 | Atualizar READMEs (`app/README.md`, `server/README.md`, `utils/README.md`) | READMEs | Média | Baixo |

---

## 10. Estimativa de Impacto

| Dimensão | Impacto |
|---|---|
| LOC de mudança estrutural | ~0 LOC de lógica; só movimentação + ~150-300 linhas de ajuste de import |
| Arquivos afetados | ~120 (todos os imports que referenciam `database.*`, `utils/*`, `components/*`) |
| Tamanho do repo (git) | **Redução enorme**: remove ~3.5 MB de `*.zip`, ~15 DBs de backup, `__pycache__`, `.pytest_cache` |
| Build do frontend | mais rápido (`.dockerignore` corrigido exclui backend) |
| Manutenção | alta redução de carga cognitiva (feature-based + camadas claras) |
| Tempo estimado | 2-4 dias (1 dev) se feito com scripts de `sed`/`find` + typecheck/lint a cada passo |
| Rollback | trivial se cada passo for commitado isoladamente |

---

## 11. Riscos

- **Quebra de imports em massa** (mover `database/`/`utils/`/`components/`): mitigado com typecheck (`tsc --noEmit`) e `pytest` a cada passo.
- **Regressão visual** ao splitar god components (`ReceivablesTab`, `QuantDashboard`): exige QA manual + `npm run build`.
- **Volumes Docker**: ao deixar de commitar DBs/cache, o primeiro deploy limpo precisa de seed/migration — garantir que `alembic` roda no bootstrap.
- **Conflito de branch**: reorganização ampla gera muitos conflitos se houver trabalho paralelo — recomenda-se branch dedicada e freeze de features.
- **Documentação defasada** induz erro: atualizar READMEs antes de outros devs lerem a estrutura.

---

## 12. Benefícios

- **Separation of Concerns** real: rotas magras, serviços com regra, domínio puro, infra de I/O.
- **Escalabilidade 10x**: feature-based permite adicionar módulos sem tocar em arquivos gigantes; `app/features/X/` é autocontido.
- **Onboarding**: novos devs localizam código por feature/camada, não por tamanho de arquivo.
- **Menos bugs de concorrência**: `Session()` só em `services/` reduz vazamento de conexão e locks.
- **Repo enxuto**: elimina gigabytes de artefatos e pastas placeholder.
- **Clean Architecture aderente**: `domain` (sem I/O) ↔ `services` ↔ `infrastructure` ↔ `api`, com frontend espelhando em `features`/`lib`/`ui`.

---

## Classificação Consolidada das Sugestões

### 🔴 Alta Prioridade
1. Mover `database/` → `server/db/` e corrigir todos os imports `database.*`.
2. Corrigir bug `cache_helper.py` (`database.connection`→`database.session`).
3. Remover do repo e adicionar ao `.gitignore`: `__pycache__/`, `*.db`, `data/cvm_cache/`, `backups/*.db`, `.pytest_cache/`.
4. Criar `app/lib/` (apiClient/formatters/hooks) e mover `app/utils/*`.
5. Criar `app/features/` e distribuir componentes/hooks por feature (splitar god components).
6. Impor camada de serviço: rotas param de abrir `Session()` direto.

### 🟡 Média Prioridade
7. Agrupar `worker*.py` → `server/worker/`.
8. Centralizar tipos em `app/types.ts`; remover duplicatas.
9. Consolidar fábrica HTTP (`utils/http_client` vs `market.py`/`calendar.py`).
10. Parametrizar 6 blocos de índice em `routes/market.py`.
11. Extrair `apply_payment_to_installments` de `refunds`.
12. Atualizar READMEs defasados (`app/config/api.ts`, `HealthIndicator.tsx`).
13. `.dockerignore` excluir `server/`/`database/` no build do frontend.

### 🟢 Baixa Prioridade
14. Unificar skeletons/Modal/Tooltip compartilhados.
15. Padronizar exports (`named` vs `default`).
16. Mover `routes/assets_icon.py` → `infrastructure/`.
17. Unificar `scripts/*.sh`/`.ps1` e ngrok hardcoded em env var.
18. Mover auditoria/roadmap → `docs/`.
19. Remover `utils/` (raiz) e `test_si.py` órfão.

---

## Aderência a Clean Architecture (avaliada)

| Princípio | Estado | Observação |
|---|---|---|
| **SOLID** | ⚠️ Parcial | `PortfolioService` (god class), `refunds.py` violam SRP; rotas violam responsabilidade única (controller+DAO) |
| **Separation of Concerns** | ⚠️ Parcial | Backend mistura camadas; frontend mistura UI+lógica em god components |
| **DRY** | ⚠️ Parcial | Fábrica HTTP, blocos de índice, skeletons, tipos e cálculo de portfólio duplicados |
| **KISS** | ✅ Razoável | Estrutura geral simples e legível |
| **YAGNI** | ⚠️ Alguns excessos | `SnapshotItem`/`Snapshot` provavelmente mortos; schemas Pydantic não usados |
| **Feature-Based** | ❌ Não adotado | Frontend é flat em `components/`; backend já tem alguma divisão por domínio |
| **Layered** | ✅ Backend | `domain`/`infrastructure`/`routes`/`services_modules` coerentes — modelo a seguir no frontend |

---

## Nota sobre o Plano Anterior
Já existe `1784091184025-code-cleanup-master-plan.md` (auditoria de *clean code* de 2026-07-15) focada em **código morto, duplicação e bugs**. Este `PROJECT_STRUCTURE_AUDIT.md` é complementar: foca na **arquitetura de diretórios/camadas e escalabilidade**. Recomenda-se executar ambos em conjunto — primeiro os bugs Alta (plano anterior #1-5), depois a realocação estrutural deste documento (#1-6).

**Nenhum arquivo foi modificado. Este é um relatório de auditoria apenas.**
