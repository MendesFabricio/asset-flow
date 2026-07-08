# PLANO DE OTIMIZAÇÃO — Parte 3: Tarefas P3 (detalhamento) + Listas Consolidadas

Detalhamento das tarefas de **Prioridade P3 (Limpeza/Opcional)** e, ao final, todas as **listas consolidadas** exigidas. Índice/checklist em `PLANO_DE_OTIMIZACAO.md`; P0/P1 em `PARTE_1`; P2 em `PARTE_2`.

---

## P3-1 — Vetorizar clip de outliers (risk.py)

- **Título:** Substituir loop Python de clamp por operação vetorizada pandas
- **Prioridade:** P3
- **Categoria:** Performance / Backend
- **Impacto esperado:** Rápido para séries longas; menos CPU por chamada de risco.
- **Motivo:** `risk.py:72-84` itera `prices[col].tolist()` reescrevendo coluna a coluna para limitar picos de razão.
- **Arquivos envolvidos:** `server/domain/quant/risk.py`
- **Funções/classes/componentes afetados:** bloco de clamp em `calculate_risk_metrics`
- **O que deve ser modificado:** Usar `prices[col] = prices[col].where(cond, prev_val)` / `.clip`.
- **Como deve ser modificado:** `prev = prices[col].shift(1); ratio = prices[col]/prev; mask = ratio > limite; prices.loc[mask, col] = prev[mask]*limite`.
- **O que pode ser removido:** Loop `for` sobre `.tolist()`.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo-Médio (validar que resultado numérico é igual).
- **Validação:** Comparar séries antes/depois; teste de risk passa.
- **Dependências:** Nenhuma.

---

## P3-2 — Vetorizar rolling Sharpe (analysis.py)

- **Título:** Substituir duplo loop Python por `rolling().apply`
- **Prioridade:** P3
- **Categoria:** Performance / Backend
- **Impacto esperado:** Acelera `calculate_rolling_sharpe` (hoje O(N*M) em loops).
- **Motivo:** `analysis.py:263-277` computa Sharpe móvel célula a célula.
- **Arquivos envolvidos:** `server/domain/quant/analysis.py`
- **Funções/classes/componentes afetados:** `calculate_rolling_sharpe`
- **O que deve ser modificado:** Usar `returns.rolling(window).apply(sharpe_func)`.
- **Como deve ser modificado:** Vetorizar com pandas `rolling`.
- **O que pode ser removido:** Loops aninhados.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo-Médio (comparar resultados).
- **Validação:** Teste `test_quant.py`/`test_quant_advanced.py` passa; tempos menores.
- **Dependências:** Nenhuma.

---

## P3-3 — Cachear calendário B3 módulo-nível

- **Título:** Não reconstruir `mcal.get_calendar('BVMF')` a cada chamada
- **Prioridade:** P3
- **Categoria:** Performance / Backend
- **Impacto esperado:** Evita custo de rebuild do calendário em cada endpoint quant.
- **Motivo:** `helpers.py:16-21` `_align_prices_to_b3` recria calendário + schedule toda chamada.
- **Arquivos envolvidos:** `server/domain/quant/helpers.py`
- **Funções/classes/componentes afetados:** `_align_prices_to_b3`
- **O que deve ser modificado:** Cachear o calendário em variável módulo-nível (lazy).
- **Como deve ser modificado:** `_B3_CAL = None; if _B3_CAL is None: _B3_CAL = mcal.get_calendar('BVMF')`.
- **O que pode ser removido:** Rebuild repetido.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo.
- **Validação:** Endpoints quant retornam igual; menos chamadas a `get_calendar`.
- **Dependências:** Nenhuma.

---

## P3-4 — Compartilhar preços entre optimize / efficient-frontier

- **Título:** Única busca de preços + simulação para Markowitz
- **Prioridade:** P3
- **Categoria:** Performance / Backend
- **Impacto esperado:** Evita ~10k simulações Monte Carlo e 2 downloads quando frontend chama ambos os endpoints.
- **Motivo:** `optimization.py` roda 5000 portfólios em `calculate_markowitz_optimization` e em `calculate_efficient_frontier_points`, cada um re-baixando preços e re-derivando EWMA cov.
- **Arquivos envolvidos:** `server/domain/quant/optimization.py`, `server/routes/simulation.py`
- **Funções/classes/componentes afetados:** `calculate_markowitz_optimization`, `calculate_efficient_frontier_points`
- **O que deve ser modificado:** Buscar preços/retornos uma vez e passar para ambas; ou retornar fronteira junto da otimização.
- **Como deve ser modificado:** Extrair `prices = fetch_price_history(...)` + `returns/cov` antes dos dois cálculos; reutilizar.
- **O que pode ser removido:** Downloads/computação duplicados.
- **O que pode ser simplificar:** Pipeline de otimização único.
- **Risco:** Baixo-Médio (validar resultados).
- **Validação:** Endpoints retornam iguais; tempo de resposta cai (~metade das sims).
- **Dependências:** Nenhuma.

---

## P3-5 — Reaproveitar `get_dashboard_data` em `get_single_asset_score_data`

- **Título:** Unificar lógica de score de ativo único com dashboard
- **Prioridade:** P3
- **Categoria:** Código Morto / Backend
- **Impacto esperado:** Remove reimplementação de métricas/estratégia para ativo único.
- **Motivo:** `dashboard.py:420-507` reimplementa boa parte de `dashboard.py:135-418`.
- **Arquivos envolvidos:** `server/services_modules/dashboard.py`
- **Funções/classes/componentes afetados:** `get_single_asset_score_data`, `get_dashboard_data`
- **O que deve ser modificado:** Fazer `get_single_asset_score_data` chamar/reutilizar helpers de `get_dashboard_data`.
- **Como deve ser modificado:** Refatorar métricas para função parametrizada por ativo.
- **O que pode ser removido:** Lógica duplicada.
- **O que pode ser simplificar:** Uma função de métricas.
- **Risco:** Baixo.
- **Validação:** Score de ativo único inalterado; testes passam.
- **Dependências:** Nenhuma.

---

## P3-6 — Otimizar SSE `sync_stream` (Session por segundo)

- **Título:** Reduzir abertura de Session no stream SSE
- **Prioridade:** P3
- **Categoria:** Performance / Backend / Escalabilidade
- **Impacto esperado:** Menos pressão sobre o pool de conexões SQLite sob SSE concorrente.
- **Motivo:** `routes/sync_stream.py:66` (`time.sleep(1.0)`) abre nova `Session()` a cada iteração do loop SSE. O `sleep(1.0)` é o intervalo de poll intencional (NÃO remover — diferente dos `time.sleep(5)` de `P2-13`).
- **Localização exata:** `server/routes/sync_stream.py:48-66` (o `Session()` dentro do `while` + `time.sleep(1.0)`)
- **Arquivos envolvidos:** `server/routes/sync_stream.py`
- **Funções/classes/componentes afetados:** gerador SSE
- **O que deve ser modificado:** Reutilizar uma Session com `session.refresh()`/`expire_all()` ou consultar via `with` por intervalo maior.
- **Como deve ser modificado:** Manter Session fora do loop e atualizar objetos; ou aumentar intervalo de 1s.
- **O que pode ser removido:** `Session()` por iteração.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo.
- **Validação:** SSE entrega updates corretos; sem exaustão de conexões.
- **Dependências:** Nenhuma.

---

## P3-7 — Revisar `middleware.ts` (falso guard)

- **Título:** Esclarecer papel do middleware de auth
- **Prioridade:** P3
- **Categoria:** Segurança / Frontend / Arquitetura
- **Impacto esperado:** Remove falsa sensação de segurança; reduz hop de redirect.
- **Motivo:** `middleware.ts:5` só lê `request.cookies.get('assetflow_session')?.value` (qualquer valor não-vazio passa); o enforcement real é `backend.require_authentication` (`backend.py:75-99`). O `matcher` (`:35-37`) roda em toda rota não-estática, adicionando um hop de redirect por request.
- **Localização exata:** `middleware.ts:5` (checagem de presença), `:23` (redirect p/ login), `:35-37` (matcher).
- **Arquivos envolvidos:** `middleware.ts`
- **Funções/classes/componentes afetados:** `middleware` export
- **O que deve ser modificado:** Documentar que é UX; ou validar token de forma leve; ou remover se redundante.
- **Como deve ser modificado:** Comentar claramente ou substituir checagem por validade mínima; manter matcher restrito.
- **O que pode ser removido:** Redirecionamento enganoso (se decidido remover).
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo.
- **Validação:** Fluxo de login/roteamento UX inalterado.
- **Dependências:** Nenhuma.

---

## P3-8 — Limpeza de compose (extra_hosts / FLASK_ENV / worker depends_on)

- **Título:** Remover configs mortas do docker-compose
- **Prioridade:** P3
- **Categoria:** Docker
- **Impacto esperado:** Compose mais enxuto e correto.
- **Motivo:** `extra_hosts host.docker.internal` não usado (usa DNS de serviço); `FLASK_ENV=development` deprecated; `worker.depends_on: backend` espúrio.
- **Arquivos envolvidos:** `docker-compose.yml`
- **Funções/classes/componentes afetados:** serviços backend/worker/frontend/ollama
- **O que deve ser modificado:** Remover `extra_hosts`, trocar `FLASK_ENV` por `FLASK_DEBUG=0`, remover `depends_on: backend` do worker.
- **Como deve ser modificado:** Editar o YAML.
- **O que pode ser removido:** `extra_hosts`, `FLASK_ENV`, `depends_on` do worker.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo.
- **Validação:** `docker compose config` válido; stack sobe igual.
- **Dependências:** Nenhuma.

---

## P3-9 — Allow-list de host no PDF extractor

- **Título:** Restringir URLs baixadas pelo extrator de PDF
- **Prioridade:** P3
- **Categoria:** Segurança / Backend
- **Impacto esperado:** Reduz risco de SSRF caso `last_report_url` seja influenciável.
- **Motivo:** `utils/pdf_extractor.py:18-26` baixa qualquer URL; `quant_analysis.py:466` passa URL do DB.
- **Arquivos envolvidos:** `server/utils/pdf_extractor.py`, `server/routes/quant_analysis.py`
- **Funções/classes/componentes afetados:** `extract_text_from_pdf`
- **O que deve ser modificado:** Validar hostname contra allow-list (b3/cvm/statusinvest).
- **Como deve ser modificado:** `from urllib.parse import urlparse; assert urlparse(url).netloc in ALLOWED_HOSTS`.
- **O que pode ser removido:** Download irrestrito.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo.
- **Validação:** URL de CVM/B3 funciona; host estranho é rejeitado.
- **Dependências:** Nenhuma.

---

## P3-10 — `Debtor` properties -> agregação SQL (opcional)

- **Título:** Mover propriedades Python de Debtor para agregação SQL
- **Prioridade:** P3
- **Categoria:** Performance / Banco de Dados / Backend
- **Impacto esperado:** Evita iteração O(N×M×K) em memória para muitos débitos.
- **Motivo:** `database/models.py:205-259` itera relacionamentos em Python a cada acesso; chamado em `refunds.py:136-141` por devedor.
- **Arquivos envolvidos:** `database/models.py`, `server/routes/refunds.py`
- **Funções/classes/componentes afetados:** propriedades de `Debtor`
- **O que deve ser modificado:** Substituir properties por queries agregadas (`func.sum`, `func.max`).
- **Como deve ser modificado:** Calcular totais via `db.session.query(func.sum(...)).filter_by(...)` sob demanda/cache.
- **O que pode ser removido:** Iteração em memória.
- **O que pode ser simplificar:** N/A.
- **Risco:** Baixo (para 10 usuários impacto pequeno).
- **Validação:** Tela de refund mostra totais iguais; testes de refund passam.
- **Dependências:** Nenhuma.

---

# LISTAS CONSOLIDADAS FINAIS

## Arquivos mortos que podem ser removidos
- `Modelfile` (modelo nunca referenciado; compose usa `llama3.2:3b`).
- `docker/README.md` (único conteúdo de `docker/`, não referenciado).
- `docker/` (diretório, se esvaziado).
- `server/data/` (zips CVM ~103MB + PDFs) — artefatos runtime, já `.gitignore`; limpar sob demanda.
- `AuditLog` (tabela write-only — ver Banco de Dados).

## Componentes mortos
- `app/components/ui/Card.tsx` → variant `dashed` (nunca passado).
- `app/components/ui/Badge.tsx` → variant `amber` (nunca passado).
- `app/components/SmartAllocationModal.tsx` → interface `AllocationItem` (nunca instanciada).
- `app/components/AssetRow.tsx` → props `index`/`total` (nunca lidas).
- (Nenhum componente React inteiro está morto — todos são importados.)

## Funções mortas
- `server/domain/quant/optimization.py:4` `import json` (não usado).
- `server/domain/quant/exposure.py:2` `Category` importado, não usado.
- `server/services_modules/cache_helper.py:5` `Decimal` não usado.
- `server/crawlers/cvm_enet.py` imports duplicados (linhas 1-8) + `import re` dentro do loop.
- `server/routes/alerts_price.py:20` `sys.path.append('../..')` (fora do projeto).
- `_get_current_user_id()` (7 cópias — mortas após unificação em P1-7).
- `server/routes/maintenance.py` leitura de token via query param (após P1-4).
- `useAssetData.ts` `options` param (P2-19).

## Imports desnecessários
- Frontend: `app/page.tsx` (`PlusCircle, Calendar, Eye, EyeOff, Search`); `app/components/QuantDashboard.tsx` (`useMemo, RotateCcw`); `app/agenda/page.tsx` (`Sliders, AlertTriangle, Info, HelpCircle`); `app/components/Header/SystemStatus.tsx` (`RefreshCw, Layers`).
- Backend: `optimization.py` (`json`), `exposure.py` (`Category`), `cache_helper.py` (`Decimal`), `cvm_enet.py` (dup + `re` no loop), `alerts_price.py` (`sys.path.append('../..')`).
- `print()` em produção (fii_processor, cvm_finder, cnpj_finder) → trocar por logging (P2-12).

## Dependências removíveis
- `zod` (frontend, nunca usado) — P2-1.
- `python-dotenv` (backend, nunca usado) — P2-2.
- `lxml` (backend, sem imports diretos; provável) — P2-16.
- `baseline-browser-mapping` (devDep Next 16, confirmar antes) — P2-16.
- Duplicatas de lockfile Node → `npm dedupe` — P2-17.
- `requirements.txt` despinado → pinar versões — P2-9.
- `npm install` → `npm ci` — P2-9.

## APIs sem uso
- Nenhuma rota órfã (todas registradas em `backend.py:112-129`).
- `server/data/cvm_cache/*.zip` (dados de API, não endpoints) — limpar.
- `/api/market/brief` (nome semântico incorreto; renomear para `/api/ai/morning-brief`) — P1-12.
- `request.get_json(silent=True)` mascara erros em 6 rotas (não é API morta, mas anti-padrão) — P1-12.

## Melhorias de performance do frontend
- `Header` com `React.memo` + `useCallback` nos handlers + seletores no `useModalStore` — P2-5.
- Corrigir classes Tailwind dinâmicas (EditModal/StatCard) — P2-6 (também bug).
- `portfolioTabs`/`analyticsTabs` com `useMemo` (`page.tsx:84-101`).
- `useModalStore()` sem selector → re-render de `Home` — P2-5.
- `RiskRadar` recebe `[]` novo quando `data` nulo — P2-5.
- Extrair `PrivateValue` (dedup) — P2-7.
- Consolidar `fetch`→`apiCall` — P2-8.
- Virtualização (AssetsTable) e lazy loading (modais/charts): **já corretos** — manter.

## Melhorias de performance do backend
- Centralizar base query + eager loading (N+1) — P1-1.
- Reutilizar posições no request — P1-2.
- `update_prices()` não carregar tabela toda — P1-5.
- `safe_commit()` com retry — P1-6.
- Cachear calendário B3 — P3-3.
- Vetorizar clip (risk) e rolling Sharpe (analysis) — P3-1/P3-2.
- Compartilhar preços entre optimize/efficient-frontier — P3-4.
- Otimizar SSE `sync_stream` — P3-6.
- Remover `time.sleep` bloqueante — P2-13.
- `Debtor` properties → SQL aggregate — P3-10.

## Melhorias no banco de dados
- `AuditLog` write-only → adicionar leitura ou remover — §1/P2.
- Colunas `PaymentTransaction.data_movimentacao/forma_pagamento/tipo_movimentacao` nunca lidas.
- Índices em `is_deleted` (+`user_id`) nas tabelas soft-delete — P1-5.
- Índice em `Asset.ticker` (lookup global) — P1-5.
- Índices em `PriceAlert.is_active`, `TriggeredAlert.is_notified` — P1-5.
- Remover `index=True` redundante em PKs — P1-5.
- `safe_commit()` com retry — P1-6.
- Migrations consistentes (ghost `receivables`, ALTER programático) — P2-10.
- Remover `create_all` antes do Alembic — P2-11.
- Pragmas WAL/cache já corretos (`models.py:39-55`) — manter.

## Melhorias no Docker
- Completar `.dockerignore` (não copiar backend/`database`/`docker`/`utils` p/ imagem frontend) — P2-9.
- `npm install` → `npm ci` — P2-9.
- Remover build redundante no start do compose (`npm run build &&`) — P2-9.
- Healthchecks em backend/worker/frontend/ollama — P2-9.
- Pinar `requirements.txt` — P2-9.
- Multi-stage no frontend (opcional) — P2-9.
- Remover `gcc python3-dev` sem `--no-install-recommends` (server) — P2-9.
- Remover `Modelfile`/`docker/` — P2-15.
- Limpeza de compose (`extra_hosts`, `FLASK_ENV`, `worker.depends_on`) — P3-8.

## Melhorias de segurança
- Não expor `str(e)` ao cliente (handler global) — P0-3.
- `SECRET_KEY` estável via env — P0-4.
- CORS explícito / remover — P1-3.
- Token de backup via header + `hmac.compare_digest` — P1-4.
- Rate limiting + política de senha no auth — P1-13.
- Token de sessão sem revogação server-side (7 dias) — revisar.
- Cookie de sessão verificar HttpOnly/SameSite — revisar.
- `middleware.ts` falso guard — P3-7.
- Allow-list de host no PDF extractor — P3-9.
- `.env.local` `admin/admin` — só local (git-ignored); trocar em prod — P0-4.

## Melhorias de arquitetura
- Unificar helper de usuário atual (`_get_current_user_id`) — P1-7.
- Centralizar cliente HTTP + User-Agent — P1-8.
- Centralizar helpers de data — P1-9.
- Centralizar extração de preços + EWMA — P1-10.
- Única classificação setorial — P1-11.
- `get_active_positions()` repository — P1-1.
- Chaves de cache quant centralizadas + invalidação única — P0-1/P0-2.
- Migrations como única fonte de schema — P2-10/P2-11.
- `get_single_asset_score_data` reaproveitar `get_dashboard_data` — P3-5.
- `PrivateValue` componente único — P2-7.
- `apiCall` como única utilidade de API — P2-8.
