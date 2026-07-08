# PLANO DE OTIMIZAÇÃO — AssetFlow Pro

Guia de implementação completo e detalhado gerado a partir da auditoria de todo o repositório.
**Nenhum arquivo foi alterado pela auditoria.** Este documento permite que qualquer desenvolvedor execute todas as melhorias sem refazer a análise.

## Como usar este plano

1. As tarefas estão divididas por prioridade: **P0 (Crítico)** → **P1 (Alto impacto)** → **P2 (Melhorias)** → **P3 (Limpeza)**.
2. O detalhamento de cada tarefa (13 campos obrigatórios) está nos arquivos parte:
   - Tarefas **P0 e P1**: `PLANO_DE_OTIMIZACAO_PARTE_1.md`
   - Tarefas **P2**: `PLANO_DE_OTIMIZACAO_PARTE_2.md`
   - Tarefas **P3 + Listas Consolidadas**: `PLANO_DE_OTIMIZACAO_PARTE_3.md`
3. Cada tarefa no detalhamento traz: Título, Prioridade, Categoria, Impacto esperado, Motivo, Arquivos envolvidos, Funções/Classes/Componentes afetados, O que modificar, Como modificar, O que remover, O que simplificar, Risco, Validação, Dependências.
4. Execute na ordem das dependências (ex.: P1-1 antes de P1-2; P2-10 antes de P2-11; P0-1 base para P0-2).
5. Para cada tarefa, rode os testes correspondentes (`server/tests/*`, `npm run lint`, `npm run build`) e a validação descrita.

## Dependências entre tarefas (resumo)

- **P0-1** é base para **P0-2** (mesmo mecanismo de invalidação de cache).
- **P1-1** (`get_active_positions`) é pré-requisito para **P1-2** (reuso no request).
- **P1-5** (índices) depende de **P2-10** (criar migrations para os índices).
- **P2-10** (migrations) deve vir antes de **P2-11** (remover `create_all`).
- **P1-13** adiciona a dependência `flask-limiter` (ver P2 — dependências).
- **P0-4** exige atualizar `backend` **e** `worker` no compose com a mesma `SECRET_KEY`.

---

## Checklist de Execução

### P0 — Crítico

- [ ] **P0-1** Corrigir mismatch de chave de cache das métricas de risco (`risk_metrics_{uid}` vs `risk_metrics_cache_{uid}`)
- [ ] **P0-2** Invalidar caches de simulation (`optimize_portfolio_`, `risk_parity_`, `morning_brief_`) na invalidação quant
- [ ] **P0-3** Remover vazamento de erro interno (`"details": str(e)`) no handler global de exceções
- [ ] **P0-4** Definir `SECRET_KEY` estável via ambiente (backend + worker)

### P1 — Alto impacto

- [ ] **P1-1** Centralizar base query `get_active_positions()` + eager loading (eliminar N+1)
- [ ] **P1-2** Reutilizar posições já carregadas dentro de um mesmo request
- [ ] **P1-3** CORS explícito / remover `CORS(app)` genérico
- [ ] **P1-4** Token de backup via header-only + `hmac.compare_digest`
- [ ] **P1-5** `update_prices()` não carregar tabela toda + indexar `is_deleted`/`ticker`
- [ ] **P1-6** `safe_commit()` com retry para `database is locked`
- [ ] **P1-7** De-duplicar `_get_current_user_id()` (7 cópias)
- [ ] **P1-8** De-duplicar `get_secure_session()` + User-Agent (cliente HTTP central)
- [ ] **P1-9** De-duplicar helpers de data (refunds vs credit_cards)
- [ ] **P1-10** De-duplicar extração MultiIndex/close (8×) e bloco EWMA (5×)
- [ ] **P1-11** Unificar classificação setorial (3 implementações)
- [ ] **P1-12** Renomear `/api/market/brief` → `/api/ai/morning-brief` + validar JSON (`silent=True`)
- [ ] **P1-13** Rate limiting + política de senha no auth

### P2 — Melhorias

- [ ] **P2-1** Remover dependência `zod` (frontend, nunca usada)
- [ ] **P2-2** Remover dependência `python-dotenv` (backend, nunca usada)
- [ ] **P2-3** Remover imports não utilizados (page/QuantDashboard/agenda/SystemStatus)
- [ ] **P2-4** Remover variants/interfaces mortos (Card `dashed`, Badge `amber`, `AllocationItem`)
- [ ] **P2-5** Memoizar `Header` + `useCallback` nos handlers + seletores no `useModalStore`
- [ ] **P2-6** Corrigir classes Tailwind dinâmicas (EditModal/StatCard) — também bug de estilo
- [ ] **P2-7** Extrair componente `PrivateValue` (3 duplicações)
- [ ] **P2-8** Consolidar `fetch` manual no `apiCall`
- [ ] **P2-9** Otimizar Docker (.dockerignore, `npm ci`, healthchecks, requirements pinados)
- [ ] **P2-10** Corrigir migrações Alembic (ghost `receivables` + ALTER programático)
- [ ] **P2-11** Remover `create_all` antes do Alembic (ou idempotente)
- [ ] **P2-12** Substituir `print()` por `logging` em produção
- [ ] **P2-13** Remover `time.sleep()` bloqueante
- [ ] **P2-14** Remover imports mortos (backend: json/Category/Decimal/re no loop/sys.path)
- [ ] **P2-15** Remover `Modelfile` e `docker/README.md`
- [ ] **P2-16** Revisar dependências questionáveis (`lxml`, `baseline-browser-mapping`)
- [ ] **P2-17** `npm dedupe` / lockfile duplicado
- [ ] **P2-18** Remover props mortas `index`/`total` (AssetRow)
- [ ] **P2-19** Limpar `options` não usado em `useAssetData`

### P3 — Limpeza

- [ ] **P3-1** Vetorizar clip de outliers (risk.py)
- [ ] **P3-2** Vetorizar rolling Sharpe (analysis.py)
- [ ] **P3-3** Cachear calendário B3 módulo-nível
- [ ] **P3-4** Compartilhar preços entre optimize / efficient-frontier
- [ ] **P3-5** Reaproveitar `get_dashboard_data` em `get_single_asset_score_data`
- [ ] **P3-6** Otimizar SSE `sync_stream` (Session por segundo)
- [ ] **P3-7** Revisar `middleware.ts` (falso guard de auth)
- [ ] **P3-8** Limpeza de compose (extra_hosts / FLASK_ENV / worker depends_on)
- [ ] **P3-9** Allow-list de host no PDF extractor
- [ ] **P3-10** `Debtor` properties → agregação SQL (opcional)

---

## Ordem de execução recomendada (fases)

Execute em fases, respeitando as dependências. Cada fase deve passar nos testes antes de avançar.

- **Fase 0 — Correções críticas (P0):** P0-3 (sem risco, imediato) → P0-4 (SECRET_KEY no compose p/ backend+worker) → P0-1 → P0-2. Valide login persistente e ausência de `str(e)` no cliente.
- **Fase 1 — Performance/segurança de backend (P1):**
  - P1-6 (`safe_commit` retry) —独立, baixo risco.
  - P1-1 (`get_active_positions` + eager load) → P1-2 (reuso no request). Validar contagem de SQL.
  - P1-7, P1-8, P1-9, P1-10, P1-11 (de-duplicação) — independentes entre si.
  - P1-3 (CORS), P1-4 (backup token), P1-13 (auth) — segurança.
  - P1-5 (update_prices + índices) — **depende de P2-10** (migration dos índices).
  - P1-12 (rota + JSON) — ajustar URL no frontend.
- **Fase 2 — Limpeza e reprodutibilidade (P2):** P2-10 (migrations) → P2-11 (remove create_all) → P2-9 (Docker/requirements) → P2-12/13/14 (prints/sleeps/imports) → P2-1/2/16/17 (deps) → P2-3/4/18/19 (frontend mortos) → P2-5/6/7/8 (frontend perf) → P2-15 (arquivos mortos).
- **Fase 3 — Opcional (P3):** P3-1..P3-10 em qualquer ordem; P3-6 e P3-3 dão ganhos perceptíveis; P3-7/8/9 são de robustez.

## Comandos de validação (ambiente de execução)

Execute estes comandos como parte da validação de cada fase:

**Backend (Python)**
```bash
cd server
python -m pytest tests/ -q            # suíte completa (test_routes, test_quant, test_quant_advanced, test_fixed_income, test_ai_automation, test_ticker_helper)
python -m pytest tests/test_quant.py::<caso> -q   # teste pontual de risco/otimização
python -c "import ast,sys; [ast.parse(open(f).read()) for f in sys.argv[1:]]" server/routes/*.py server/domain/quant/*.py server/services_modules/*.py  # syntax check rápido
```
Habilitar log de SQL para contar queries: `import logging; logging.basicConfig(); logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)` (ou `SQLALCHEMY_ECHO` no engine) — útil para validar P1-1/P1-2/P1-5.

**Frontend (Next.js)**
```bash
npm run lint        # ESLint (avalia P2-3/4/18/19, P2-6, P2-7, P2-8)
npm run build       # build de produção (falha se houver import morto ou tipo quebrado)
```
Validação visual/interativa (P2-5, P2-6): React DevTools Profiler para confirmar re-render do `Header`; abrir `EditModal` e `StatCard` para confirmar cores/anel corretos.

**Docker / Compose**
```bash
docker compose config            # valida YAML após P2-9/P3-8
docker compose build             # reconstrói imagens (P2-9)
docker compose up -d             # sobe stack; healthchecks devem ficar "healthy" (P2-9)
docker compose exec backend python -c "from database.models import Base; print(len(Base.metadata.tables))"  # sanity do schema
```

**Banco (migrations)**
```bash
cd server
alembic upgrade head             # aplica migrations (P2-10); validar em DB de teste vazio E em cópia do prod
alembic downgrade -1             # testar reversibilidade (P2-10)
```

---

## Riscos de regressão e mitigação

- **P0-1/P0-2 (cache):** a exclusão por-usuário em `_invalidate_quant_cache` usa `self.current_user_id`. Se no ponto de invalidação o service não tiver `current_user_id` igual a `g.user_id`, a variante `_{user_id}` não é apagada. **Mitigação:** ao implementar, setar `service.current_user_id = g.user_id` antes de chamar a invalidação, ou confirmar cobertura por teste (editar posição → checar que otimização/risco mudam).
- **P1-1/P1-2 (query centralizada):** mudar a base query pode alterar ordenação/filtros onde hoje há `.join(Asset).join(Category)`. **Mitigação:** manter joins apenas onde há filtro/ordenção por essas colunas; rodar `test_routes.py` + `test_quant*.py` e comparar saídas numéricas (P1-10 exige o mesmo).
- **P1-10 (EWMA/extração):** tocar cálculos numéricos. **Mitigação:** snapshot dos retornos de `/api/quant/risk`, `/correlation`, `/optimize` antes/depois; diff deve ser igual (tolerância de float).
- **P2-10/P2-11 (migrations):** risco de schema drift. **Mitigação:** testar `alembic upgrade head` em DB vazio e em DB de produção (backup antes); manter `create_all` apenas como fallback de dev.
- **P2-9 (Docker):** remover `npm run build` do `command` do frontend exige que a imagem já tenha o build (multi-stage/correcto). **Mitigação:** validar `docker compose build` + `up` e healthchecks `healthy` antes de remover o build do start.
- **P2-14 (sys.path):** NÃO remover os `sys.path.append(os.path.join(dirname,'..'))` legítimos (apontam para raiz do server). Remover apenas `alerts_price.py:20` (`'../..'`).
- **P1-13 (auth):** senha mínima 8 quebra fixtures/testes com senha curta. **Mitigação:** ajustar senhas de teste; rate-limit via `flask-limiter` (nova dependência) ou throttle em memória.
- **P2-6 (Tailwind dinâmico):** é também correção de bug (estilos não gerados). **Mitigação:** validar visualmente o modal de edição e os StatCards após a mudança para mapa estático.

---

## Onde encontrar o detalhamento e as listas

- **Detalhamento P0/P1:** `PLANO_DE_OTIMIZACAO_PARTE_1.md`
- **Detalhamento P2:** `PLANO_DE_OTIMIZACAO_PARTE_2.md`
- **Detalhamento P3 + Listas Consolidadas** (arquivos mortos, componentes mortos, funções mortas, imports desnecessários, dependências removíveis, APIs sem uso, melhorias de performance frontend/backend, banco de dados, Docker, segurança, arquitetura): `PLANO_DE_OTIMIZACAO_PARTE_3.md`

## Resumo de impacto esperado

- **P0** corrige dados de risco defasados (bug silencioso), vazamento de erros e sessões que caem a cada restart.
- **P1** reduz drasticamente o número de queries por request (N+1 + 10+ redundantes), endurece a superfície de ataque e elimina dezenas de duplicações.
- **P2** remove dependências/código mortos, melhora o Docker e a reprodutibilidade do build.
- **P3** traz ganhos de performance incremental e limpeza final.

Nenhuma alteração de arquivo foi feita; este é apenas o plano de execução.
