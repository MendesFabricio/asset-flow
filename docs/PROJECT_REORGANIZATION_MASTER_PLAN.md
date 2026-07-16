# PROJECT REORGANIZATION MASTER PLAN

> **Objetivo:** reestruturar `asset-flow` para crescimento de longo prazo (feature-based no frontend, backend coeso em um pacote, sem artefatos no repo), mantendo o projeto **funcionando após cada etapa**.
> Base: `PROJECT_STRUCTURE_AUDIT.md`. Nenhum arquivo foi modificado por este plano — ele é executável em passos pequenos.
> Princípio de segurança: cada etapa é isolada, commitável e validada por `tsc --noEmit` + `eslint` + `pytest` + `npm run build`.

---

## Roadmap Completo (ordem ideal)

As etapas estão ordenadas por **dependência e criticidade**. As primeiras eliminam risco de repo/bug; as do meio movem camadas com shim de compatibilidade; as finais refinam frontend e documentação.

| Fase | Etapas | Foco |
|---|---|---|
| A. Higiene do repo | 1–3 | Parar de versionar artefatos (seguro, sem quebra) |
| B. Backend coeso | 4–8 | `database/`→`server/db/`, worker, serviços |
| C. Frontend limpo | 9–13 | `app/lib/`, `app/features/`, tipos, UI |
| D. Docker & Docs | 14–16 | ignore, composes, documentação |

---

## Estrutura Final Proposta (alvo)

```
asset-flow/
├── app/
│   ├── (routes)/ dashboard/ agenda/ avancado/ perfil/ login/   # pages
│   ├── api/ auth/ sync/                                       # route handlers (proxy)
│   ├── features/
│   │   ├── assets/      components/ hooks/ tabs/(Receivables,FixedIncome,CreditCards)
│   │   ├── quant/       components/ hooks/
│   │   ├── news/        AssetNewsPanel, MorningBriefing
│   │   ├── header/      (Header/*)
│   │   └── jarvis/      JarvisChat
│   ├── components/ui/   # design system (Badge, Card, ModalShell, Skeleton unificado)
│   ├── lib/             # api.ts, format.ts, hooks (useFloatingTooltip)
│   ├── store/ modalStore.ts
│   ├── context/ PrivacyContext.tsx
│   ├── types/ index.ts
│   ├── layout.tsx, globals.css, favicon.ico
├── server/
│   ├── app.py / factory.py          # era backend.py
│   ├── worker/ __init__,scheduler,jobs,state,core
│   ├── api/ assets,auth,market,news,dividends,credit_cards,fixed_income,
│   │        alerts,alerts_price,quant_analysis,simulation,ai,calendar,
│   │        scheduler,health,dashboard,maintenance,sync_stream, refunds/
│   ├── services/ portfolio,dashboard,backup,categories,cache,facades,
│   │            integration, refunds/(debtors,loans,payments)
│   ├── domain/ quant/(analysis,correlation,exposure,helpers,monte_carlo,
│   │            optimization,projection,rebalance,risk)
│   ├── infrastructure/ market_data,ollama_service,price_cache,http_client,assets_icon
│   ├── crawlers/ b3_fnet,cvm_enet
│   ├── db/ models.py,session.py,lock.py, migrations/(alembic), alembic.ini, env.py
│   ├── schemas/ (ou schemas.py)
│   ├── utils/ (server/utils/* mantido)
│   ├── tests/
│   └── data/ (volume docker, não commitado)
├── infrastructure/ docker/(composes,Dockerfiles) scripts/(dev,prod,clean,rebuild)
├── public/            # assets estáticos
├── docs/              # READMEs, auditorias, roadmap
└── config raiz: package.json, tsconfig*, next.config.ts, eslint, postcss, middleware.ts, sentry.*, .env*, .gitignore, .dockerignore
```

---

## ETAPA 1 — .gitignore: parar de versionar artefatos [CONCLUÍDO]

- **Objetivo:** impedir commit de cache/binários gerados.
- **Arquivos envolvidos:** `.gitignore` (editar).
- **Pastas envolvidas:** raiz, `server/`, `database/`.
- **Movidos:** nenhum.
- **Renomeados:** nenhum.
- **Ação:** adicionar padrões: `__pycache__/`, `*.pyc`, `.pytest_cache/`, `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm`, `server/data/cvm_cache/`, `backups/`, `.next/`, `server/assetflow*.db`.
- **Impacto:** nenhum em runtime; repo deixa de crescer.
- **Risco:** Baixo.
- **Tempo:** 5 min.
- **Dependências:** nenhuma.
- **Verificar:** `git status` não mostra mais `__pycache__/`, `*.db`, `cvm_cache/*.zip`, `backups/*.db`. `pytest` ainda passa.

## ETAPA 2 — Remover artefatos já commitados (após Etapa 1) [CONCLUÍDO]

- **Objetivo:** limpar o histórico de working tree.
- **Arquivos envolvidos:** `server/__pycache__/`, `server/assetflow.db`, `server/assetflow_profile.db`, `database/__pycache__/`, `database/asset_flow.db`, `server/data/cvm_cache/*.zip`, `backups/*.db`, `server/.pytest_cache/`, `.pytest_cache/`.
- **Pastas envolvidas:** `server/`, `database/`, `backups/`.
- **Movidos:** nenhum (apenas `git rm --cached` + delete local; para `data/cvm_cache` e `backups`, mover p/ volume docker em Etapa 14).
- **Renomeados:** nenhum.
- **Impacto:** libera ~3.5 MB+; nada de runtime quebrado (DBs recriados por `init_db`/migrations).
- **Risco:** Baixo (garantir que bootstrap roda migrations/seed no primeiro deploy).
- **Tempo:** 10 min.
- **Dependências:** Etapa 1.
- **Verificar:** `git status` limpo; `python -c "from database.models import init_db"` ok local; app sobe.

## ETAPA 3 — Remover pastas/arquivos órfãos da raiz [CONCLUÍDO]

- **Objetivo:** eliminar placeholder e script solto.
- **Arquivos envolvidos:** `utils/README.md` (+ pasta `utils/`), `test_si.py`.
- **Pastas envolvidos:** `utils/` (raiz).
- **Movidos:** nenhum.
- **Renomeados:** nenhum.
- **Impacto:** remove ruído; `utils/` (raiz) não é importada por nada (código real está em `server/utils/` e `app/utils/`).
- **Risco:** Baixo.
- **Tempo:** 5 min.
- **Dependências:** nenhuma.
- **Verificar:** `grep -r "from utils" app/ server/` não aponta para raiz; `pytest`/`tsc` limpos.

## ETAPA 4 — Criar `server/db/` e mover `database/` [CONCLUÍDO]

- **Objetivo:** backend coeso num único pacote.
- **Arquivos envolvidos:** `database/models.py`, `database/session.py`, `database/lock.py`, `database/README.md`.
- **Pastas envolvidos:** `database/` → `server/db/`.
- **Movidos:** os 3 arquivos .py + README para `server/db/`.
- **Renomeados:** nenhum (mantém nomes internos).
- **Ação:** criar `server/db/__init__.py`; mover arquivos; adicionar **shim de compatibilidade** `database/__init__.py` que faz `from server.db.models import *` etc. OU atualizar os 81 imports `database.` → `server.db.` com script + `sed`. Recomenda-se shim primeiro para não quebrar nada, depois remover shim na Etapa 8.
- **Impacto:** estrutura coesa; imports passam a apontar para `server.db`.
- **Risco:** Médio (81 imports). Mitigado por shim + typecheck/pytest.
- **Tempo:** 20 min.
- **Dependências:** Etapa 1.
- **Verificar:** `pytest server/tests` passa; `python -c "from server.db.models import Session"`; `from database.models import Session` ainda funciona (shim).

## ETAPA 5 — Corrigir bug de import `cache_helper.py` [CONCLUÍDO]

- **Objetivo:** consertar `ModuleNotFoundError` em recálculo de background.
- **Arquivos envolvidos:** `server/services_modules/cache_helper.py:55` (e `:6`).
- **Pastas envolvidos:** `server/services_modules/`.
- **Movidos:** nenhum.
- **Renomeados:** nenhum.
- **Ação:** `from database.connection import Session` → `from database.session import Session` (ou `server.db.session` se Etapa 4 já converteu).
- **Impacto:** desbloqueia job de recálculo em background.
- **Risco:** Baixo.
- **Tempo:** 5 min.
- **Dependências:** Etapa 4 (ou independente se usar `database.`).
- **Verificar:** `python -c "from services_modules.cache_helper import *"`; rodar job de recálculo.

## ETAPA 6 — Agrupar `worker*.py` em `server/worker/` [CONCLUÍDO]

- **Objetivo:** scheduler isolado e coeso.
- **Arquivos envolvidos:** `server/worker.py`, `worker_core.py`, `worker_jobs.py`, `worker_state.py`.
- **Pastas envolvidos:** `server/` → `server/worker/`.
- **Movidos:** os 4 arquivos para `server/worker/` + `server/worker/__init__.py`.
- **Renomeados:** nenhum.
- **Ação:** atualizar imports internos (`from worker_core import` → `from server.worker.worker_core import` ou relative); `backend.py` aponta para `server.worker`.
- **Impacto:** separação clara de concerns.
- **Risco:** Médio (entrypoint do worker).
- **Tempo:** 15 min.
- **Dependências:** Etapa 4.
- **Verificar:** `pytest`; worker sobe (`python -m server.worker` ou entrypoint Docker).

## ETAPA 7 — `routes/assets_icon.py` → `server/infrastructure/` [CONCLUÍDO]

- **Objetivo:** scraping/I/O fora de `api/`.
- **Arquivos envolvidos:** `server/routes/assets_icon.py`.
- **Pastas envolvidos:** `server/routes/` → `server/infrastructure/`.
- **Movidos:** `assets_icon.py` → `server/infrastructure/assets_icon.py`.
- **Renomeados:** nenhum.
- **Ação:** atualizar registro em `backend.py` (`api.register_blueprint`); adicionar `curl-cffi`+`beautifulsoup4` ao `requirements.txt` (bug deploy).
- **Impacto:** `routes/` passa a ser só controllers; resolve import ausente.
- **Risco:** Baixo/Médio (deploy).
- **Tempo:** 10 min.
- **Dependências:** Etapa 4.
- **Verificar:** `pip install -r requirements.txt`; `import curl_cffi, bs4`; `pytest`; build Docker.

## ETAPA 8 — Remover shim `database/` e converter para `server.db.` [CONCLUÍDO]

- **Objetivo:** eliminar indireção; consolidar nomenclatura.
- **Arquivos envolvidos:** `database/__init__.py` (shim) + 81 locais de import.
- **Pastas envolvidos:** `database/` (remover por completo).
- **Movidos:** nenhum.
- **Renomeados:** imports `database.models`→`server.db.models`, `database.session`→`server.db.session`, `database.lock`→`server.db.lock`.
- **Ação:** script de replace + revisão manual; remover pasta `database/`.
- **Impacto:** fim da dupla localização.
- **RisRisco:** Médio (massa de imports).
- **Tempo:** 20 min.
- **Dependências:** Etapas 4–7.
- **Verificar:** `grep -r "from database" server/` vazio; `pytest`; `python -c "from server.db.models import init_db"`.

## ETAPA 9 — Criar `app/lib/` e mover `app/utils/*` [CONCLUÍDO]

- **Objetivo:** centralizar apiClient/formatters/hooks genéricos.
- **Arquivos envolvidos:** `app/utils/apiClient.ts`, `app/utils/index.ts`.
- **Pastas envolvidos:** `app/utils/` → `app/lib/`.
- **Movidos:** `apiClient.ts` → `app/lib/api.ts`; `index.ts` (formatMoney/getStatusBg) → `app/lib/format.ts`.
- **Renomeados:** `apiClient.ts`→`api.ts`, `index.ts`→`format.ts`.
- **Ação:** atualizar imports em `app/**` (`@/utils/apiClient`→`@/lib/api`, `@/utils`→`@/lib/format`).
- **Impacto:** nomenclatura consistente com backend; path alias `@/*` já existe.
- **Risco:** Baixo.
- **Tempo:** 15 min.
- **Dependências:** nenhuma.
- **Verificar:** `npx tsc --noEmit`; `npm run lint`; `npm run build`.

## ETAPA 10 — Criar `app/types/` centralizado

- **Objetivo:** fonte única de tipos; eliminar duplicatas em tabs.
- **Arquivos envolvidos:** `app/types.ts`, `app/components/ReceivablesTab.tsx`, `app/components/CreditCardsTab.tsx`.
- **Pastas envolvidos:** `app/` → `app/types/`.
- **Movidos:** `app/types.ts` → `app/types/index.ts`.
- **Renomeados:** nenhum (conteúdo).
- **Ação:** remover definições locais duplicadas das tabs; importar de `@/types`.
- **Impacto:** contrato frontend↔backend claro e DRY.
- **RisRisco:** Baixo.
- **Tempo:** 20 min.
- **Dependências:** Etapa 9.
- **Verificar:** `npx tsc --noEmit` sem erros.

## ETAPA 11 — Unificar UI compartilhada (`app/components/ui/`)

- **Objetivo:** um sistema de design; matar skeletons duplicados.
- **Arquivos envolvidos:** `ui/Skeleton.tsx`, `ui/Skeletons.tsx` (+`QuantSkeletons` citado), `ModalShell.tsx`.
- **Pastas envolvidos:** `app/components/ui/`.
- **Movidos:** nenhum.
- **Renomeados:** consolidar `SkeletonLoading`/`MonteCarloSkeleton`/`MetricsGridSkeleton` num único `Skeleton.tsx`; `ModalShell` vira base de todos os modais.
- **Ação:** refatorar `page.tsx`, `QuantDashboard.tsx`, `AddAssetModal`/`EditModal`/`IncomeProjectionModal`/`SmartAllocationModal`/`AssetDetailsModal` para usarem o unificado.
- **Impacto:** menos duplicação de UI; bundle menor.
- **RisRisco:** Baixo.
- **Tempo:** 30 min.
- **Dependências:** Etapa 10.
- **Verificar:** `npm run build`; QA visual de modais/skeletons.

## ETAPA 12 — Criar `app/features/` e distribuir componentes/hooks

- **Objetivo:** feature-based; splitar god components.
- **Arquivos envolvidos:** `ReceivablesTab.tsx` (~1.307), `QuantDashboard.tsx` (~1.178), `RiskMetricsPanel.tsx`, `AssetDetailsModal.tsx`, `CreditCardsTab.tsx`, `Header/*`, `JarvisChat.tsx`, `AssetNewsPanel.tsx`, `MorningBriefing.tsx`, `hooks/*`.
- **Pastas envolvidos:** `app/components/` + `app/hooks/` → `app/features/{assets,quant,news,header,jarvis}/`.
- **Movidos:** componentes/hooks para suas features; `ui/` e `ModalShell` ficam em `app/components/ui/`.
- **Renomeados:** `ReceivablesTab` splitado em `features/assets/tabs/receivables/{debtors,loans,payments,installments}.tsx` + modais; `QuantDashboard` splitado por sub-aba em `features/quant/`.
- **Ação:** mover em lotes pequenos (uma feature por vez), atualizando imports das pages (`app/page.tsx`, `app/agenda/`, `app/avancado/`).
- **Impacto:** arquivos menores, localizáveis, paralelizáveis.
- **RisRisco:** Médio (regressão visual).
- **Tempo:** 2–3 h (várias sub-etapas, uma feature por commit).
- **Dependências:** Etapas 9–11.
- **Verificar:** `npm run build`; QA manual de cada aba/modal; `npm run lint`.

## ETAPA 13 — Padronizar exports e `app/README.md`

- **Objetivo:** consistência de API de componentes.
- **Arquivos envolvidos:** `FixedIncomeTab.tsx`, `CreditCardsTab.tsx`, `ReportModal.tsx` (export default → named).
- **Pastas envolvidos:** `app/features/`.
- **Movidos:** nenhum.
- **Renomeados:** exports `default`→`named`.
- **Ação:** ajustar importadores; atualizar `app/README.md` (remove `app/config/api.ts` e `HealthIndicator.tsx` inexistentes).
- **Impacto:** importação previsível.
- **RisRisco:** Baixo.
- **Tempo:** 15 min.
- **Dependências:** Etapa 12.
- **Verificar:** `npm run lint`; `npm run build`.

## ETAPA 14 — Docker: `.dockerignore`, volumes e composes [CONCLUÍDO]

- **Objetivo:** build de frontend mais rápido; dados em volume.
- **Arquivos envolvidos:** `.dockerignore`, `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, `Dockerfile`, `server/Dockerfile`.
- **Pastas envolvidos:** raiz, `infrastructure/docker/` (nova).
- **Movidos:** composes/Dockerfiles → `infrastructure/docker/` (opcional); `.dockerignore` exclui `server/` e `database/` no contexto do frontend.
- **Renomeados:** nenhum.
- **Ação:** montar `server/data/cvm_cache` e `backups` como volumes命名ados; `.dockerignore` adiciona `server/`, `database/`, `*.db`.
- **Impacto:** imagem frontend enxuta; dados persistentes fora do repo.
- **RisRisco:** Baixo/Médio (deploy).
- **Tempo:** 20 min.
- **Dependências:** Etapas 2, 4.
- **Verificar:** `docker compose build` mais rápido; `docker compose up` sobe; dados persistem.

## ETAPA 15 — Unificar `scripts/` (.sh/.ps1) e ngrok em env

- **Objetivo:** um comportamento entre OSes; remover hardcoded.
- **Arquivos envolvidos:** `scripts/dev.sh`, `scripts/dev.ps1`, `scripts/prod.*`, `scripts/clean.*`, `scripts/rebuild.*`, `next.config.ts`, `docker-compose.dev.yml`.
- **Pastas envolvidos:** `scripts/` → `infrastructure/scripts/` (opcional).
- **Movidos:** scripts para `infrastructure/scripts/` (opcional).
- **Renomeados:** ngrok hardcoded → env var `NGROK_ENABLED`.
- **Ação:** alinhar `.ps1` e `.sh`; remover `ngrok` de 3 lugares.
- **Impacto:** menos divergência dev/prod.
- **RisRisco:** Baixo.
- **Tempo:** 15 min.
- **Dependências:** Etapa 14.
- **Verificar:** `./scripts/dev.sh` e `dev.ps1` comportam-se iguais; `docker compose up`.

## ETAPA 16 — Documentação final e `docs/`

- **Objetivo:** READMEs refletem estrutura real.
- **Arquivos envolvidos:** `README.md`, `app/README.md`, `server/README.md`, `database/README.md` (movida p/ `server/db/README.md`), `utils/README.md` (removida), `1784091184025-code-cleanup-master-plan.md`, `assetflow-roadmap.md`.
- **Pastas envolvidos:** raiz → `docs/`.
- **Movidos:** auditorias/roadmap → `docs/`.
- **Renomeados:** `database/README.md`→`server/db/README.md`.
- **Ação:** reescrever READMEs para a estrutura final; remover refs a `app/config/api.ts`, `HealthIndicator.tsx`, `utils/` (raiz).
- **Impacto:** onboarding correto.
- **RisRisco:** Baixo.
- **Tempo:** 30 min.
- **Dependências:** todas anteriores.
- **Verificar:** links internos dos READMEs resolvem; `npm run build` + `pytest` ainda verdes.

---

## Ordem Ideal das Mudanças (sequência executável)

```
1 → 2 → 3          (higiene: sem risco de runtime)
       4 → 5 → 6 → 7 → 8   (backend coeso; shim protege 4→8)
                   9 → 10 → 11 → 12 → 13   (frontend feature-based)
                               14 → 15 → 16   (docker + docs)
```

Regra: **nunca mover >1 camada por commit**. Cada etapa termina com `pytest` + `tsc` + `build` verdes antes de seguir.

---

## Ganhos Esperados

| Dimensão | Ganho |
|---|---|
| Tamanho do repo (git) | **−3.5 MB+** (remove `*.zip` cache, 15 DBs de backup, `__pycache__`, `.pytest_cache`) |
| Tempo de build do frontend | menor (`.dockerignore` exclui backend) |
| Carga cognitiva | alta redução (feature-based + camadas claras) |
| Bugs de concorrência | menor (`Session()` só em `services/` após refatoro de camada) |
| Escalabilidade 10x | viável: `app/features/X/` autocontido; `server/` coeso |
| Onboarding | novo dev acha código por feature/camada, não por tamanho de arquivo |

## Estimativa de Redução da Complexidade

- **Estrutural:** elimina 2 localizações de DB (`database/` + `server/db/`), 1 pasta placeholder (`utils/` raiz), shim transitório.
- **Arquivos:** ~120 imports atualizados, mas **0 LOC de lógica alterada** nas etapas de movimentação.
- **God components:** `ReceivablesTab` (1.307) e `QuantDashboard` (1.178) reduzidos a módulos de 100–300 LOC cada (split em Etapa 12).
- **Duplicação:** fábrica HTTP, 6 blocos de índice, skeletons, tipos e cálculo de portfólio unificados (complementa o clean-code plan anterior).
- **Esforço total:** ~1–1.5 dia (1 dev) se executado em passos; risco baixo porque cada etapa é validada e commitável.

## Notas de Execução

- **Shim de compatibilidade** (Etapa 4→8) garante que o projeto funciona mesmo antes de todos os 81 imports mudarem — remova o shim só na Etapa 8.
- **Bug críticos** do plano de clean-code anterior (`assets.py:145` validação invertida, `requirements.txt` incompleto) devem ser corrigidos junto das Etapas 5 e 7.
- **Não executar** remoção de rotas órfãs / `Snapshot` sem confirmação de ops (já sinalizado no plano anterior).
- **Scripts de verificação por etapa:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, `pytest server/tests`.

**Nenhum arquivo foi modificado. Este é um plano de reorganização apenas.**
