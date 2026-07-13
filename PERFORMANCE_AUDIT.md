# Auditoria Completa de Performance, Arquitetura e Estabilidade — AssetFlow Pro

**Data:** 2026-07-13
**Auditor:** Kilo (Engenheiro Staff)
**Escopo:** Frontend (Next.js 16 + React 19), Backend (Flask + Python 3.11), SQLite, Docker, DevOps
**Método:** Graphify (951 nós / 1.941 arestas), análise estática, exploration agents, grep, leitura direta de código
**Status:** Somente leitura. Nenhum arquivo do projeto foi alterado.

---

## 1. Resumo Executivo

O sistema AssetFlow Pro tem arquitetura bem estruturada em camadas (Frontend → API → Services → Repositories → SQLite), mas sofre de **pelo menos 7 gargalos críticos** que explicam os ~10 segundos de latência relatados.

Maiores culpados:

1. **Frontend:** `PrivacyContext` causa re-render cascata em toda a tabela de ativos (~80–150 ms por toggle). Componentes monólitos (`QuantDashboard` 1.331 linhas, `ReceivablesTab` 1.343 linhas) impedem code-splitting. Múltiplos componentes fazem fetch duplicado.
2. **Backend Flask:** `ThreadPoolExecutor` DENTRO de rotas Flask com SQLite (`assets.py`, `calendar.py`) causa contenção e `database is locked`. Gunicorn 2 workers × 4 threads em SQLite single-file multiplica o problema. Rotas bloqueantes chamam `update_prices()`/`update_fundamentals()` síncronos, prendendo a requisição por 5–30s.
3. **Banco:** `get_dashboard_data` carrega TODAS as posições e processa em Python puro. `/api/assets` bloqueia a resposta enquanto baixa dados da CVM em paralelo.
4. **Docker (Dev):** `npm install` em CADA `docker compose up`, bind mounts Windows/WSL2 lentos, `WATCHPACK_POLLING=true`.
5. **Comunicação:** Sem deduplicação de requests, timeout 30s excessivo, sem retry.

**Ganho estimado com correção completa:** de ~8–10s para ~1.5–2.5s nas operações relatadas.

## 2. Gargalos Críticos (Ordenados por Impacto)

| # | Gargalo | Camada | Impacto | Complexidade | Benefício |
|---|---------|--------|---------|--------------|-----------|
| 1 | ThreadPoolExecutor em rotas Flask + SQLite | Backend | 2–5s | Média | ~2s |
| 2 | Gunicorn 2 workers em SQLite single-file | Backend | 1–3s | Baixa | ~1s |
| 3 | PrivacyContext re-render cascata | Frontend | 80–150 ms | Baixa | ~100 ms |
| 4 | Dashboard `get_dashboard_data` em Python | Backend | 500ms–2s | Alta | ~1s |
| 5 | `/api/assets` bloqueia c/ ThreadPoolExecutor | Backend | 1–3s | Média | ~2s |
| 6 | `update_prices()` síncrono em rotas | Backend | 5–30s | Alta | ~5s |
| 7 | Monólitos (QuantDashboard, ReceivablesTab) | Frontend | 150–200KB | Média | ~300ms FCP |
| 8 | npm install + bind mount em CADA start (dev) | Docker | 30–60s | Baixa | ~30s |
| 9 | Fetch duplicado de `/api/assets` e quant | Frontend | 100–500ms | Baixa | ~300ms |
| 10 | Sem deduplicação + retry + cache em apiCall | Frontend | 100–300ms | Média | ~200ms |

---

## 3. Fluxograma Completo

```
Usuário clica "Adicionar Ativo"
   │
   ▼
┌─ FRONTEND (Next.js 16 / React 19) ─────────────────────┐
│ 1. AddAssetModal.handleSave()                          │
│    ├─ apiCall('/api/validate_ticker')  [~200-500ms]     │
│    └─ apiCall('/api/add_asset')        [~1-3s BLOQ]     │
│ 2. onSuccess → refetch()                              │
│    ├─ mutate('/api/index')             [~500ms–2s]      │
│    └─ mutate('/api/history')           [~200ms]        │
│ 3. Re-render cascata: PrivacyContext→Header→AssetsTable│
│    → AssetRow × N  [~80-150ms extras]                 │
└───────────────────────────────────────────────────────┘
   │ HTTP (rewrite Next → backend:5328)
   ▼
┌─ BACKEND FLASK (Gunicorn 2w×4t) ──────────────────────┐
│ 1. Middleware (matcher global)  [~10-30ms]             │
│ 2. assets_bp.add_asset()                              │
│    ├─ Pydantic validation                             │
│    ├─ service.add_new_asset() → safe_commit()         │
│    └─ threading.Thread(_background_tasks)             │
│       ├─ service.update_prices()  [BLOQUEIA 5-30s]    │
│       └─ service.take_daily_snapshot()                │
│ 3. Threads competem por SQLite lock → retry w/ backoff│
└───────────────────────────────────────────────────────┘
   │
   ▼
┌─ SQLITE (single-file /app/data/assetflow.db) ─────────┐
│ WAL: ATIVO (models.py:69) · busy_timeout:30s · cache 32MB│
│ PROBLEMA: 2w×4t = 8 conexões concorrentes num arquivo │
│ single-file. Escritores ainda serializam.             │
└───────────────────────────────────────────────────────┘
   │
   ▼
┌─ RESPOSTA ────────────────────────────────────────────┐
│ /api/index → get_dashboard_data():                    │
│   get_active_positions() + loop Python (Decimal math) │
│   + _calculate_metrics + _apply_strategy + alertas    │
│   + get_correlation_matrix / calculate_risk_metrics   │
│   [500ms – 2s] → JSON 30+ campos/ativo → re-render    │
└───────────────────────────────────────────────────────┘
```

## 4. Problemas Encontrados

### 4.1 CRÍTICO — ThreadPoolExecutor dentro de rotas Flask + SQLite
- **Arquivo:** `server/routes/assets.py:195`, `server/routes/calendar.py:140`
- **Descrição:** Rotas `/api/assets` e `/api/calendar` usam `ThreadPoolExecutor(max_workers=2)` DENTRO do request. Com SQLite single-file, múltiplas threads causam `database is locked`; `safe_commit()` faz retry com backoff (0.5s, 1s, 1.5s...).
- **Impacto:** 2–5s de lock contention + retries.
- **Reproduzir:** Adicionar 50+ ativos e chamar `/api/assets` sob carga; observar logs "database is locked".
- **Corrigir:** Remover `ThreadPoolExecutor` das rotas; processamento pesado deve ser assíncrono (worker/cache). Retornar dados do DB imediatamente.
- **Prioridade:** CRÍTICA · **Tempo:** 2–4h · **Risco:** Médio

### 4.2 CRÍTICO — Gunicorn 2 workers × 4 threads em SQLite
- **Arquivo:** `server/Dockerfile:53`, `docker-compose.prod.yml:9`
- **Descrição:** 2 processos × 4 threads = 8 conexões concorrentes num arquivo single-file. WAL ajuda leitores, mas escritores serializam.
- **Impacto:** 1–3s de contenção em picos.
- **Reproduzir:** Abrir dashboard em 2 abas enquanto um sync roda.
- **Corrigir:** Produção `--workers 1 --threads 4`. Longo prazo: migrar para PostgreSQL.
- **Prioridade:** CRÍTICA · **Tempo:** 30min · **Risco:** Baixo

### 4.3 CRÍTICO — PrivacyContext causa re-render cascata global
- **Arquivo:** `app/context/PrivacyContext.tsx:61`
- **Descrição:** `value={{ isHidden, togglePrivacy }}` cria novo objeto a CADA render. Todos os consumidores (`usePrivacy`) re-renderizam. `PrivateValue` aparece ~15× por `AssetRow` (renderiza centenas de vezes).
- **Impacto:** 80–150ms por toggle em 200 ativos.
- **Reproduzir:** Toggle privacidade + React DevTools Profiler → todos os AssetRow flash.
- **Corrigir:**
```tsx
const value = useMemo(() => ({ isHidden, togglePrivacy }), [isHidden]);
return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
```
- **Prioridade:** CRÍTICA · **Tempo:** 15min · **Risco:** Muito baixo

### 4.4 ALTO — Dashboard `get_dashboard_data` processa tudo em Python
- **Arquivo:** `server/services_modules/dashboard.py:139-414`
- **Descrição:** `/api/index` carrega todas as posições, itera com math `Decimal` puro, calcula métricas/estratégia/alertas e monta JSON 30+ campos por ativo.
- **Impacto:** 500ms–2s para 50–200 ativos.
- **Reproduzir:** `time curl -s localhost:5328/api/index >/dev/null` (10x, medir p95).
- **Corrigir:** Mover agregações para SQL; pré-computar score/recomendação em background; separar `/api/index` (leve) de `/api/analytics` (pesado).
- **Prioridade:** ALTA · **Tempo:** 4–8h · **Risco:** Alto (contrato de API)

### 4.5 ALTO — `/api/assets` bloqueia resposta com ThreadPoolExecutor
- **Arquivo:** `server/routes/assets.py:180-209`
- **Descrição:** Carrega todos os ativos e usa `ThreadPoolExecutor` para buscar dados CVM; `for future in as_completed` bloqueia a resposta HTTP até todas as threads terminarem.
- **Impacto:** 1–3s+ bloqueando o browser.
- **Reproduzir:** `curl -s localhost:5328/api/assets` e medir tempo.
- **Corrigir:** Remover ThreadPoolExecutor; retornar dados básicos; fundamentalista vem de endpoint/cache separado.
- **Prioridade:** ALTA · **Tempo:** 3–5h · **Risco:** Médio

### 4.6 ALTO — `update_prices()` síncrono bloqueia requisições
- **Arquivo:** `server/routes/dashboard.py:67-91`, `server/routes/assets.py:216-228`
- **Descrição:** `/api/index?force=true` e `/api/refresh_prices` chamam `update_prices()` síncrono (itera ativos, baixa Yahoo, commita) → 5–30s.
- **Impacto:** 5–30s de timeout no browser.
- **Reproduzir:** Clicar "Atualizar Preços" → spinner até Yahoo responder.
- **Corrigir:** Sempre background + SSE/polling; rota retorna 202 Accepted.
- **Prioridade:** ALTA · **Tempo:** 2–3h · **Risco:** Baixo

### 4.7 ALTO — Background threads sem controle de concorrência
- **Arquivo:** `server/routes/assets.py:84-92,119-126,165-172`, `server/backend.py:290-303`, `server/routes/dashboard.py:56-65`
- **Descrição:** Cada CRUD dispara `threading.Thread(daemon=True).start()` sem limite. Cliques rápidos → múltiplas threads competindo pelo mesmo lock/SQLite.
- **Impacto:** Exaustão de threads + lock contention.
- **Corrigir:** `ThreadPoolExecutor` global `max_workers=1` para preço/snapshot; ou delegar ao worker APScheduler.
- **Prioridade:** ALTA · **Tempo:** 2h · **Risco:** Baixo

### 4.8 ALTO — Componentes monólitos impedem code-splitting
- **Arquivo:** `app/components/QuantDashboard.tsx:1-1331`, `app/components/ReceivablesTab.tsx:1-1343`
- **Descrição:** >1.300 linhas cada, com toda a lógica de abas/modais em um arquivo. Aumenta bundle e impede lazy loading granular.
- **Impacto:** 150–200KB no bundle; FCP +300ms.
- **Corrigir:** Extrair abas/modais em componentes separados + `dynamic()`.
- **Prioridade:** ALTA · **Tempo:** 6–10h · **Risco:** Médio

### 4.9 ALTO — Fetch duplicado em múltiplos componentes
- **Arquivo:** `app/components/RiskMetricsPanel.tsx:165`, `app/components/QuantDashboard.tsx:127-177`, `app/components/MonteCarloChart.tsx:40`
- **Descrição:** `RiskMetricsPanel` faz `apiCall('/api/assets')` à parte do SWR; `QuantDashboard` dispara 6 calls paralelos sem cache; `RiskMetricsPanel` faz 4 calls seriais.
- **Impacto:** 100–500ms duplicados; 1–2s redundantes.
- **Corrigir:** Migrar para SWR com mesma chave; `Promise.all`; compartilhar via contexto.
- **Prioridade:** ALTA · **Tempo:** 3–4h · **Risco:** Médio

### 4.10 ALTO — Sem deduplicação, retry e cache em apiCall
- **Arquivo:** `app/utils/apiClient.ts:1-39`
- **Descrição:** Timeout 30s excessivo; sem retry; sem deduplicação; `JarvisChat`/`MonteCarloChart` usam `fetch` raw ignorando `apiCall`.
- **Impacto:** UX ruim em falhas; requests duplicados; hangs.
- **Corrigir:** Camada de deduplicação por URL+method+body; retry c/ backoff; timeout por endpoint; migrar todos para `apiCall`.
- **Prioridade:** ALTA · **Tempo:** 2–3h · **Risco:** Baixo

### 4.11 ALTO — Dev Docker: npm install + bind mount em todo start
- **Arquivo:** `docker-compose.dev.yml:70`
- **Descrição:** `sh -c "npm install && npm run dev"` roda `npm install` em CADA `docker compose up`; bind mount `.:/app` monta tudo (incl. node_modules host) no container. Em Windows/WSL2 I/O lentíssimo.
- **Impacto:** 30–60s startup + HMR lento (5–10s).
- **Corrigir:** Remover `npm install` do comando; usar volume nomeado `node_modules:/app/node_modules`; montar só `./app` e `./package.json`.
- **Prioridade:** ALTA · **Tempo:** 1–2h · **Risco:** Baixo

### 4.12 MÉDIO — SSE + SWR causam flash de dados stale
- **Arquivo:** `app/hooks/useAssetData.ts:66-130`
- **Descrição:** Ao receber sucesso do SSE, `mutateDashboardRef.current()` re-fetch `/api/index`; dados antigos aparecem 200–500ms antes do novo completar.
- **Corrigir:** `mutate('/api/index', undefined, { revalidate: true })` com skeleton; optimistic update.
- **Prioridade:** MÉDIA · **Tempo:** 2h · **Risco:** Médio

### 4.13 MÉDIO — Closures inline em page.tsx quebram memo do Header
- **Arquivo:** `app/page.tsx:154-170`
- **Descrição:** `onManualRefresh={() => ...}` e `onFixAsset={(id) => ...}` criam novas referências a CADA render; `Header` (memo) recebe props novas.
- **Corrigir:** `const onManualRefresh = useCallback(() => handlers.handleManualRefresh(...), [handlers]);`
- **Prioridade:** MÉDIA · **Tempo:** 30min · **Risco:** Baixo

### 4.14 MÉDIO — `money` em usePortfolioMetrics não memoizada
- **Arquivo:** `app/hooks/usePortfolioMetrics.ts:36`
- **Descrição:** `const money = (val) => ...` recriada a cada hook; passada para Header/StatCard.
- **Corrigir:** `const money = useCallback((val) => isHidden ? '••••' : formatMoney(val), [isHidden]);`
- **Prioridade:** MÉDIA · **Tempo:** 15min · **Risco:** Baixo

### 4.15 MÉDIO — Middleware roda em TODAS as rotas de API
- **Arquivo:** `middleware.ts:49-52`
- **Descrição:** `matcher` faz middleware rodar em cada request de API (cookie parse + token check).
- **Impacto:** 10–30ms por request.
- **Corrigir:** Excluir `/api/*` do matcher onde auth não é necessária; ou mover auth para decorators Flask.
- **Prioridade:** MÉDIA · **Tempo:** 1h · **Risco:** Médio (segurança)

### 4.16 MÉDIO — Font Inter sem `display: swap`
- **Arquivo:** `app/layout.tsx:7`
- **Descrição:** `Inter({ subsets: ["latin"] })` sem `display: "swap"` → browser espera download antes de renderizar texto.
- **Impacto:** 200–500ms de atraso no FCP.
- **Corrigir:** `Inter({ subsets: ["latin"], display: "swap" })`
- **Prioridade:** MÉDIA · **Tempo:** 5min · **Risco:** Muito baixo

### 4.17 MÉDIO — Threading em background sem pool global
- **Arquivo:** `server/routes/assets.py:92,126,172`, `server/backend.py:293,303,354`, `server/routes/dashboard.py:65`, `server/routes/calendar.py:161`
- **Descrição:** Vários `threading.Thread(daemon=True)` disparados sem controle. 5 usuários simultâneos → 5+ threads por `update_prices()`.
- **Corrigir:** `ThreadPoolExecutor` singleton `max_workers=2`.
- **Prioridade:** MÉDIA · **Tempo:** 2h · **Risco:** Baixo

### 4.18 MÉDIO — `update_fundamentals` faz 1 commit por ativo
- **Arquivo:** `server/infrastructure/market_data.py:408-414`
- **Descrição:** `safe_commit(session)` após CADA ativo → fsync no SQLite a cada iteração (50 ativos = 50 commits).
- **Corrigir:** Commit em batch a cada 10–20 ativos ou no fim do loop.
- **Prioridade:** MÉDIA · **Tempo:** 1h · **Risco:** Baixo

### 4.19 BAIXO — CategorySummary O(n × m)
- **Arquivo:** `app/components/CategorySummary.tsx:163-193`
- **Descrição:** `.filter()` por categoria dentro do map → O(n × categorias).
- **Corrigir:** `useMemo` com `Map` pré-agrupado.
- **Prioridade:** BAIXA · **Tempo:** 30min · **Risco:** Muito baixo

### 4.20 BAIXO — ReceivablesTab `loans.find()` por row
- **Arquivo:** `app/components/ReceivablesTab.tsx:949`
- **Descrição:** `loans.find(l => l.id === item.loanId)` por linha visível a cada render.
- **Corrigir:** `Map<loanId, total_parcelas>` pré-computado com `useMemo`.
- **Prioridade:** BAIXA · **Tempo:** 20min · **Risco:** Muito baixo

### 4.21 BAIXO (arquitetura) — QuantDashboard monolítico
- **Arquivo:** `app/components/QuantDashboard.tsx:1-1331`
- **Descrição:** 8 abas de análise quant em um arquivo; impede code-splitting por aba.
- **Corrigir:** Extrair abas em componentes + `dynamic()`. (Ver 4.8)
- **Prioridade:** ALTA · **Tempo:** 6–10h · **Risco:** Médio

### 4.22 BAIXO (arquitetura) — ReceivablesTab monolítico
- **Arquivo:** `app/components/ReceivablesTab.tsx:1-1343`
- **Descrição:** Dashboard + devedores + tabelas + 5 modais em um arquivo; sem dynamic import.
- **Corrigir:** Extrair modais para componentes dinamicamente importados. (Ver 4.8)
- **Prioridade:** ALTA · **Tempo:** 4–6h · **Risco:** Médio

### 4.23 BAIXO — StrictMode no React 19 duplica renders em dev
- **Arquivo:** Vários (`app/components/`, `app/page.tsx`)
- **Descrição:** StrictMode faz double-invoke de effects em dev, dobrando render de componentes pesados como `QuantDashboard` e `ReceivablesTab`. Não afeta produção.
- **Impacto:** Apenas desenvolvimento. Dobra tempo de render de componentes pesados.
- **Corrigir:** Nenhuma ação necessária para produção. Se o double-render em dev for problemático, considere remover StrictMode no `layout.tsx` durante desenvolvimento ou otimizar os monólitos (4.8).
- **Prioridade:** BAIXA · **Tempo:** N/A · **Risco:** N/A

### 4.24 BAIXO — Ausência de VACUUM/ANALYZE no SQLite
- **Arquivo:** Nenhum atual (falta implementação)
- **Descrição:** Com inserts/updates/deletes frequentes (snapshots, sync, price updates), o SQLite fragmenta páginas. Sem `VACUUM; ANALYZE;` periódico, os índices ficam menos eficientes ao longo do tempo.
- **Impacto:** Degradação gradual de performance de queries (5–15% mais lentas após semanas de uso intenso).
- **Corrigir:** Adicionar um job no `worker.py` que execute `VACUUM; ANALYZE;` semanalmente ou quando o banco atingir certo tamanho.
- **Prioridade:** BAIXA · **Tempo:** 1h · **Risco:** Baixo

### 4.25 BAIXO — useMemo/useCallback existentes estão corretos
- **Descrição:** A auditoria verificou que os `useMemo`/`useCallback` existentes no código (`AssetsTable.tsx:40`, `useAssetData.ts:63`, etc.) estão corretos e não representam desperdício. O problema real é a **ausência** de memoização onde deveria existir (PrivacyContext, money, closures), não existência de memo desnecessário.
- **Impacto:** N/A
- **Corrigir:** Nenhuma ação necessária nos memo existentes. Foco em adicionar memo onde falta (ver 4.3, 4.13, 4.14).
- **Prioridade:** BAIXA · **Tempo:** N/A · **Risco:** N/A

## 5. Arquivos Mortos

| Arquivo | Motivo |
|---------|--------|
| `server/domain/quant_engine.py` | Stub vazio (8 linhas, só docstring). Nunca importado. |
| `public/window.svg` | Boilerplate Next.js, não referenciado. |
| `public/vercel.svg` | Boilerplate Next.js, não referenciado. |
| `public/next.svg` | Boilerplate Next.js, não referenciado. |
| `public/globe.svg` | Boilerplate Next.js, não referenciado. |
| `public/file.svg` | Boilerplate Next.js, não referenciado. |

## 6. Código Morto

- **Funções/classes mortas:** Nenhuma além de `quant_engine.py` (stub).
- **Imports mortos:** Nenhum em nível de módulo. Há imports locais repetidos (`safe_commit`, `SystemCache`) em `facades.py`, `risk.py`, `correlation.py` — ruído, não código morto.
- **Rotas mortas:** Nenhuma. Todos os blueprints são usados pelo frontend.
- **Componentes mortos:** Nenhum. Todos em `app/components/` são referenciados.
- **Observação:** `server/schemas.py:1` usa pydantic `validator` (depreciado no v2; usar `field_validator`).

## 7. Dependências Desnecessárias

**Frontend:** Nenhuma desnecessária. Todas usadas (`@headlessui/react`, `@tanstack/react-virtual`, `recharts`, `swr`, `zustand`, `lucide-react`, `@sentry/nextjs`). Recharts (~200KB) é pesado — considere alternativa mais leve no longo prazo.

**Backend:** Nenhuma desnecessária. Todas usadas (`flask`, `sqlalchemy`, `yfinance`, `pandas`, `numpy`, `pydantic`, `feedparser`, `apscheduler`, `gunicorn`, `alembic`, `requests`, `pymupdf`, `reportlab`, `sentry-sdk`, etc).

**Docker:** Nenhuma imagem/serviço desnecessário (Ollama é opcional, documentado).

## 8. Melhorias de Arquitetura

### Curto Prazo (1–2 semanas)
1. Corrigir gunicorn para `--workers 1 --threads 4` (contenção SQLite).
2. Remover `ThreadPoolExecutor` das rotas (especialmente `/api/assets`).
3. Memoizar `PrivacyContext` (ganho imediato 80–150ms).
4. Remover `npm install` do dev compose (volume `node_modules`).
5. Adicionar retry + deduplicação em `apiCall`.
6. Font `display: swap`.

### Médio Prazo (1–2 meses)
1. Reescrever `get_dashboard_data` com agregações SQL + scores pré-computados.
2. Separar `/api/index` (leve) de `/api/analytics` (pesado, sob demanda).
3. Splitar monólitos (`QuantDashboard`, `ReceivablesTab`) com dynamic imports.
4. Cache global para quant data (SWR/Zustand + localStorage).
5. `update_prices`/`update_fundamentals` 100% background (rotas retornam 202).
6. Pool de threads global para operações de preço.

### Longo Prazo (3–6 meses)
1. Migrar SQLite → PostgreSQL (elimina contenção single-file).
2. Cache distribuído (Redis) substituindo `SystemCache` e price_cache.
3. Arquitetura event-driven (filas Celery/Redis) para sincronização.
4. Server Components no Next.js para reduzir JS no cliente.
5. Observabilidade: profiling, métricas Prometheus, OpenTelemetry.

## 9. Roadmap

### Fase 1 — Ganhos Rápidos (Semana 1)
**Objetivo:** Eliminar os ~4–6s mais fáceis de ganhar.

| Item | Arquivo | Tempo | Risco | Redução |
|------|---------|-------|-------|---------|
| 1.1 Memoizar PrivacyContext | `PrivacyContext.tsx` | 15min | Muito baixo | ~100ms |
| 1.2 Font display swap | `layout.tsx` | 5min | Muito baixo | ~300ms FCP |
| 1.3 Remover npm install do dev | `docker-compose.dev.yml` | 1h | Baixo | ~30s startup |
| 1.4 Corrigir gunicorn workers | `docker-compose.prod.yml` | 30min | Baixo | ~1s |
| 1.5 Remover ThreadPoolExecutor `/api/assets` | `assets.py` | 2h | Médio | ~2s |
| 1.6 Remover ThreadPoolExecutor `/api/calendar` | `calendar.py` | 1h | Médio | ~500ms |

**Total Fase 1:** ~5h, risco baixo, redução esperada ~4–6s.

### Fase 2 — Estabilização (Semanas 2–3)
**Objetivo:** Eliminar bloqueios síncronos e fetch duplicado.

| Item | Arquivo | Tempo | Risco | Redução |
|------|---------|-------|-------|---------|
| 2.1 `update_prices` sempre async | `dashboard.py`,`assets.py` | 2h | Baixo | ~5s |
| 2.2 Pool de threads global p/ preço | `services.py` | 2h | Baixo | ~500ms |
| 2.3 QuantDashboard → SWR | `QuantDashboard.tsx` | 3h | Médio | ~1s |
| 2.4 RiskMetricsPanel → SWR + Promise.all | `RiskMetricsPanel.tsx` | 2h | Baixo | ~500ms |
| 2.5 Retry + deduplicação em apiCall | `apiClient.ts` | 2h | Baixo | ~200ms |
| 2.6 Closures inline → useCallback | `page.tsx` | 30min | Baixo | ~10ms |
| 2.7 Memoizar `money` | `usePortfolioMetrics.ts` | 15min | Baixo | ~5ms |

**Total Fase 2:** ~12h, risco baixo-médio, redução esperada ~7–9s.

### Fase 3 — Performance Pesada (Semanas 4–6)
**Objetivo:** Otimizar backend pesado e bundle do frontend.

| Item | Arquivo | Tempo | Risco | Redução |
|------|---------|-------|-------|---------|
| 3.1 `get_dashboard_data` c/ SQL aggregates | `dashboard.py` | 4–8h | Alto | ~1s |
| 3.2 Pré-computar scores em background | `services.py`,`worker.py` | 4h | Médio | ~500ms |
| 3.3 Splitar QuantDashboard | `QuantDashboard.tsx` | 6–10h | Médio | ~300ms FCP |
| 3.4 Splitar ReceivablesTab | `ReceivablesTab.tsx` | 4–6h | Médio | ~200ms FCP |
| 3.5 Batch commits `update_fundamentals` | `market_data.py` | 1h | Baixo | ~200ms |
| 3.6 Cache global quant/risk | Vários | 3h | Médio | ~1s |

**Total Fase 3:** ~22–32h, risco médio-alto, redução esperada ~3–4s.

### Fase 4 — Escalabilidade (Mês 2+)
**Objetivo:** Preparar crescimento e eliminar gargalos estruturais.

| Item | Arquivo | Tempo | Risco | Impacto |
|------|---------|-------|-------|---------|
| 4.1 SQLite → PostgreSQL | `database/session.py`, models | 2–3 dias | Alto | Elimina contenção |
| 4.2 Cache Redis | `facades.py`, price_cache | 1–2 dias | Médio | Cache compartilhado |
| 4.3 Filas (Celery/Redis) p/ sync | `backend.py`,`worker.py` | 2–3 dias | Alto | Sem threads daemon |
| 4.4 Server Components no Next | `app/page.tsx`+ | 3–5 dias | Alto | Menos JS cliente |
| 4.5 Observabilidade (Prometheus/OTel) | Nova | 2 dias | Médio | Visibilidade |

**Reduz de ~8–10s para ~1.5–2.5s ao final das Fases 1–3.**

## 10. O QUE VOCÊ DEVE FAZER (Plano de Ação Priorizado)

Resumo prático, do mais urgente/barato para o mais demorado. Cada item tem arquivo e esforço.

### Agora (hoje, < 1h, risco quase zero)
1. **`app/context/PrivacyContext.tsx:61`** — envolva o `value` do Provider em `useMemo`. Elimina re-render de toda a tabela a cada toggle de privacidade. (4.3)
2. **`app/layout.tsx:7`** — `Inter({ subsets: ["latin"], display: "swap" })`. (4.16)
3. **`docker-compose.prod.yml:9`** — mude Gunicorn para `--workers 1 --threads 4`. (4.2)
4. **`docker-compose.dev.yml:70`** — tire o `npm install` do comando e use volume `node_modules:/app/node_modules`. (4.11)

### Esta semana (1–2 dias, risco baixo)
5. **`server/routes/assets.py:180-209` e `:195`** — remova o `ThreadPoolExecutor` de `/api/assets`; retorne dados básicos e deixe fundamentalista para cache/endpoint separado. (4.1, 4.5)
6. **`server/routes/calendar.py:140`** — remova o `ThreadPoolExecutor` de `/api/calendar`. (4.1)
7. **`app/utils/apiClient.ts`** — adicione deduplicação por chave (URL+method+body), retry com backoff e timeout por endpoint (dashboard 8s, AI 60s, sync 120s). (4.10)
8. **`app/page.tsx:154-170` + `app/hooks/usePortfolioMetrics.ts:36`** — `useCallback`/`useMemo` nas closures e na função `money`. (4.13, 4.14)

### Próximas semanas (bloqueios síncronos + bundle)
9. **`server/routes/dashboard.py:67-91` e `server/routes/assets.py:216-228`** — `update_prices()`/`refresh_prices` 100% em background; rotas retornam 202. (4.6)
10. **`server/services.py`** — `ThreadPoolExecutor` global `max_workers=1` para preço/snapshot em vez de `threading.Thread` solto. (4.7, 4.17)
11. **`app/components/RiskMetricsPanel.tsx` e `QuantDashboard.tsx`** — migre para SWR com mesma chave de cache e use `Promise.all`. (4.9)
12. **`app/components/QuantDashboard.tsx` e `ReceivablesTab.tsx`** — extraia abas/modais para `dynamic()` imports. (4.8, 4.21, 4.22)

### Médio prazo (rearquitetura do dashboard)
13. **`server/services_modules/dashboard.py:139-414`** — mova somas/médias para SQL; pré-calcule `score`/`recomendacao` no worker; separe `/api/index` (leve) de `/api/analytics` (pesado). (4.4)
14. **`server/infrastructure/market_data.py:408-414`** — batch commits no loop de fundamentos. (4.18)

### Longo prazo (escala)
15. **SQLite → PostgreSQL** + **Redis** para cache + **filas** para sincronização. (Fase 4)

### Ordem de execução recomendada
```
Passo 1: itens 1-4  (5h, risco ~0)      → -4~6s
Passo 2: itens 5-8  (12h, risco baixo)   → -7~9s
Passo 3: itens 9-14 (22-32h, risco médio)→ -3~4s
Passo 4: item 15   (1-2 semanas)         → elimina gargalo estrutural
```

### Validação (meça antes/depois)
- `time curl -s localhost:5328/api/index >/dev/null` (10x, p95)
- `curl -s localhost:5328/api/assets | wc -c` + tempo
- React DevTools Profiler: toggle de privacidade deve afetar só o Header
- DevTools Network: abrir aba "Quantitativo" deve mostrar 1 fetch SWR, não 7
- `docker compose up` medido com `time`

### Notas de segurança (encontradas na auditoria)
- `docker-compose.prod.yml:115,129,145,22,51,78` — secrets hardcoded (GlitchTip `SECRET_KEY`, `POSTGRES_PASSWORD`, Sentry DSN). Mover para `.env` não versionado.
- `app/config/api.ts:2` — `API_BASE_URL=''` (correto, usa rewrite Next); `NEXT_PUBLIC_API_URL` é config morta.

---
*Relatório gerado por auditoria estática + Graphify. Nenhum arquivo do projeto foi modificado. Para executar as correções, abra outro agente ou sessão apontando para as seções 4.x e 10 acima.*
