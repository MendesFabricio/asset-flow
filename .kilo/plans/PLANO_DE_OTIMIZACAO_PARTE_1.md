# PLANO DE OTIMIZAÇÃO — Parte 1: Tarefas P0 e P1 (detalhamento)

Este arquivo contém o detalhamento completo das tarefas de **Prioridade P0 (Crítico)** e **P1 (Alto impacto)**.
O documento principal `PLANO_DE_OTIMIZACAO.md` (na mesma pasta) contém o índice, o checklist e as listas consolidadas finais.

Cada tarefa segue o formato obrigatório:
Título / Prioridade / Categoria / Impacto esperado / Motivo / Arquivos envolvidos / Funções-classes-componentes afetados / O que modificar / Como modificar / O que remover / O que simplificar / Risco / Validação / Dependências.

### Notas de verificação cruzada (confirmadas na fonte)
- `risk.py:20` grava com `cache_key = f"risk_metrics_{uid}" if uid is not None else "risk_metrics"`.
- `cache_helper.py:31` lista base de invalidação = `["risk_metrics_cache", "correlation_matrix_cache", "efficient_frontier"]`.
- `cache_helper.py:43,55` só adiciona sufixo `_user_id` para chaves nessa lista → `risk_metrics_cache_{user_id}` (NÃO `risk_metrics_{uid}`).
- `simulation.py:26,58` gravam `optimize_portfolio_{g.user_id}` e `risk_parity_{g.user_id}` (usam `g.user_id`, não `current_user_id`).
- `cache_helper._invalidate_quant_cache` lê `getattr(self, "current_user_id", None)` → a exclusão por-usuário depende de `current_user_id` estar setado no service no momento da invalidação.
- `models.py:9-11` `safe_commit` = apenas `session.commit()`; `OperationalError` já importado em `models.py:7`; `tenacity` já importado em `models.py:6`.

---

## P0-1 — Corrigir mismatch de chave de cache das métricas de risco

- **Título:** Corrigir chave de cache `risk_metrics_{uid}` divergindo de `risk_metrics_cache_{uid}`
- **Prioridade:** P0
- **Categoria:** Banco de Dados / Backend / Arquitetura
- **Impacto esperado:** Elimina dados de risco (beta, Sharpe, VaR) defasados por até 1h após editar/excluir posições. Corrige comportamento incorreto silencioso.
- **Motivo:** `server/domain/quant/risk.py:20` grava/le o cache com a chave `risk_metrics_{uid}`, mas `server/services_modules/cache_helper.py` e `facades` usam `risk_metrics_cache_{uid}`. A invalidação (`_invalidate_quant_cache`) só apaga a chave com sufixo `_cache`, nunca a chave interna do `risk.py`. Resultado: após editar a carteira, o `risk.py` encontra a entrada interna ainda viva e devolve risco obsoleto.
- **Arquivos envolvidos:** `server/domain/quant/risk.py`, `server/services_modules/cache_helper.py`, `server/services_modules/facades.py`
- **Funções/classes/componentes afetados:** `calculate_risk_metrics` (risk.py), `_get_cached_value`, `_invalidate_quant_cache` (cache_helper.py), `calculate_risk_metrics` (facades.py)
- **O que deve ser modificado:** Unificar a chave de cache em um único nome canônico (ex.: `risk_metrics_cache_{uid}`) em todos os pontos.
- **Como deve ser modificado (RECOMENDADO — menor risco):** Apenas em `cache_helper.py:31`, adicionar `"risk_metrics"` à lista base de chaves. Assim a invalidação apaga tanto `risk_metrics` quanto `risk_metrics_{user_id}` (via `[f"{k}_{user_id}" for k in keys]`), cobrindo exatamente o que `risk.py` grava.

  ```python
  # cache_helper.py (linha 31)
  keys = ["risk_metrics", "risk_metrics_cache", "correlation_matrix_cache", "efficient_frontier"]
  ```

  **Alternativa (maior refatoração):** unificar em `risk.py:20` para `f"risk_metrics_cache_{uid}"` e remover o cache interno separado, para ter uma única fonte. Mais arriscado; só se quiser eliminar o armazenamento duplo.
- **O que pode ser removido:** A eventual duplicidade de cache (`risk_metrics_{uid}` interno) caso se opte pela alternativa.
- **O que pode ser simplificado:** Ter uma única fonte de verdade para chaves de cache quant (centralizar prefixos em `cache_helper`).
- **Risco:** Baixo — alteração localizada de string; a invalidação já cobre o sufixo por usuário.
- **Validação:** Editar uma posição → chamar `/api/quant/risk` → confirmar que os valores refletem a edição imediatamente (sem espera de 1h). Testar `test_quant.py` e `test_quant_advanced.py`.
- **Dependências:** Nenhuma.

---

## P0-2 — Invalidar caches de simulation (optimize / risk-parity / morning-brief)

- **Título:** Adicionar chaves de simulation à invalidação de cache quant
- **Prioridade:** P0
- **Categoria:** Banco de Dados / Backend
- **Impacto esperado:** Evita retornar otimizações (Markowitz, Risk-Parity) e Morning Brief obsoletos após edição da carteira.
- **Motivo:** `server/routes/simulation.py` grava `optimize_portfolio_{uid}`, `risk_parity_{uid}` e `morning_brief_{uid}`, mas `cache_helper._invalidate_quant_cache` não os inclui na lista de exclusão. Edições de posições não invalidam esses resultados.
- **Arquivos envolvidos:** `server/services_modules/cache_helper.py`, `server/routes/simulation.py`
- **Funções/classes/componentes afetados:** `_invalidate_quant_cache` (cache_helper.py); endpoints `/optimize`, `/risk-parity`, `/api/market/brief` (simulation.py)
- **O que deve ser modificado:** Incluir as três chaves na lista de invalidação.
- **Como deve ser modificado:** Em `cache_helper._invalidate_quant_cache` (`cache_helper.py:31`), adicionar as chaves de simulation à lista base. As rotas (`simulation.py:26,58`) gravam com `g.user_id`, e a invalidação gera `f"{k}_{user_id}"` — então basta incluir os prefixos:

  ```python
  # cache_helper.py (linha 31)
  keys = [
      "risk_metrics", "risk_metrics_cache",
      "correlation_matrix_cache", "efficient_frontier",
      "optimize_portfolio", "risk_parity", "morning_brief",
  ]
  ```

  **Atenção de consistência:** a exclusão *por usuário* usa `self.current_user_id` (lido via `getattr`). Confirme que, no ponto onde `_invalidate_quant_cache` é chamado (edição/exclusão de posição), o service tem `current_user_id` setado com o mesmo valor de `g.user_id`; caso contrário a exclusão por-usuário não pega a variante `_{user_id}` (a variante global sem sufixo ainda é apagada). Se houver dúvida, invalidar também sem sufixo ou setar `current_user_id = g.user_id` antes de chamar.
- **O que pode ser removido:** Nada.
- **O que pode ser simplificado:** Usar um dicionário/constante central de chaves de cache por usuário.
- **Risco:** Baixo.
- **Validação:** Rodar otimização → editar posição → rodar otimização novamente → valores mudam. Executar `test_routes.py` e `test_quant.py`.
- **Dependências:** Depende de P0-1 (mesmo mecanismo de invalidação).

---

## P0-3 — Remover vazamento de erro interno no handler global de exceções

- **Título:** Não expor `str(e)` ao cliente no handler global
- **Prioridade:** P0
- **Categoria:** Segurança / Backend
- **Impacto esperado:** Elimina divulgação de stack traces, consultas SQL e caminhos de arquivo para o cliente.
- **Motivo:** `server/backend.py:108` retorna `"details": str(e)` no handler `@app.errorhandler(Exception)`. Qualquer exceção não tratada vaza detalhes internos.
- **Arquivos envolvidos:** `server/backend.py`
- **Funções/classes/componentes afetados:** `handle_global_exception` (linhas 101-109)
- **O que deve ser modificado:** Remover a chave `details` (ou substituir por mensagem genérica) da resposta JSON.
- **Como deve ser modificado:** Deixar a resposta apenas com `status` e `msg` genérica. O log já registra `str(e)` com `exc_info=True` em `logging.error` (linha 104) — manter esse log no servidor. Opcionalmente, em ambiente de dev, incluir `details` condicional a `app.debug`.
- **O que pode ser removido:** A linha `"details": str(e)` da resposta.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo — não afeta fluxo, só a resposta de erro.
- **Validação:** Forçar um erro 500 (ex.: rota inexistente com body inválido) → confirmar que o JSON não contém SQL nem caminhos. Verificar logs do servidor com o erro completo.
- **Dependências:** Nenhuma.

---

## P0-4 — Definir SECRET_KEY estável via ambiente

- **Título:** Garantir SECRET_KEY persistente entre reinícios
- **Prioridade:** P0
- **Categoria:** Segurança / Backend / Docker
- **Impacto esperado:** Sessões deixam de ser invalidadas a cada restart/redeploy; tokens de sessão estáveis.
- **Motivo:** `server/backend.py:54-58` usa `os.environ.get("SECRET_KEY")` e, se ausente, gera chave randômica por processo. O `docker-compose.yml` não define `SECRET_KEY` para backend nem worker → logout em massa a cada restart.
- **Arquivos envolvidos:** `server/backend.py`, `docker-compose.yml`
- **Funções/classes/componentes afetados:** config `app.config["SECRET_KEY"]`; serviços `backend` e `worker` no compose
- **O que deve ser modificado:** Prover `SECRET_KEY` estável via variável de ambiente/segredo.
- **Como deve ser modificado:** Gerar um segredo (`python -c "import secrets; print(secrets.token_hex(32))"`) e adicionar `SECRET_KEY=...` ao `environment` de `backend` e `worker` no `docker-compose.yml` (ou usar secret do Docker/`.env` não versionado). Manter o fallback apenas como aviso.
- **O que pode ser removido:** O aviso de chave provisória pode permanecer como log.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo (média se esquecer de propagar para worker também — ambos devem usar a mesma chave).
- **Validação:** Fazer login → reiniciar container → confirmar que a sessão continua válida. Checar que `backend.py:55` não emite o warning de SECRET_KEY ausente.
- **Dependências:** Nenhuma.

---

## P1-1 — Centralizar base query de posições ativas + eager loading (N+1)

- **Título:** Criar `get_active_positions()` com eager loading para eliminar N+1
- **Prioridade:** P1
- **Categoria:** Performance / Banco de Dados / Backend
- **Impacto esperado:** Redução drástica de queries por request (hoje 10+ carregamentos redundantes + N+1 em `dividends`, `alerts` e módulos quant). Dashboard e endpoints quant muito mais rápidos.
- **Motivo:** O padrão `Position.query.filter_by(user_id=uid).filter(Position.quantity > 0)` está duplicado em 14+ lugares, todos sem `joinedload`/`selectinload` de `asset`/`market_data`/`dividends`, causando lazy SELECTs em loop.
- **Arquivos envolvidos:** `server/database/models.py` (ou novo `server/services_modules/repository.py`), `server/routes/dividends.py`, `server/routes/alerts.py`, `server/routes/alerts_price.py`, `server/routes/quant_analysis.py`, `server/routes/simulation.py`, `server/routes/calendar.py`, `server/domain/quant/risk.py`, `analysis.py`, `optimization.py`, `projection.py`, `rebalance.py`, `correlation.py`, `monte_carlo.py`, `server/services_modules/integration.py`, `server/services_modules/dashboard.py`
- **Funções/classes/componentes afetados:** Todas as funções que montam a query base de posições (linhas ~36/22/25/27/23/24 etc.)
- **O que deve ser modificado:** Extrair a query base para um helper que aplica `selectinload(Position.asset).selectinload(Asset.market_data)` (e `Asset.dividends` onde necessário).
- **Como deve ser modificado:** Criar helper que espelhe o padrão exato já usado em `risk.py:34-38` (`filter(Position.user_id == uid, Position.quantity > 0)`, com branch `uid is None` filtrando só `quantity > 0`) e aplique eager loading. Exemplo:

  ```python
  # database/models.py (ou services_modules/repository.py)
  from sqlalchemy.orm import selectinload
  def get_active_positions(session, user_id):
      q = session.query(Position)
      if user_id is not None:
          q = q.filter(Position.user_id == user_id, Position.quantity > 0)
      else:
          q = q.filter(Position.quantity > 0)
      return q.options(
          selectinload(Position.asset).selectinload(Asset.market_data),
          selectinload(Position.asset).selectinload(Asset.dividends),
      )
  ```

  Substituir os 14+ pontos (dividends, alerts, alerts_price, quant_analysis, simulation, calendar, e os 7 módulos `domain/quant/*`, integration, dashboard) por chamadas a esse helper. Onde o código hoje faz `.join(Asset).join(Category)`, manter os joins apenas se houver ordenação/filtro por essas colunas; o `selectinload` já cobre o acesso a `pos.asset.*`.
- **O que pode ser removido:** As 14+ repetições inline da query.
- **O que pode ser simplificado:** Um único ponto de manutenção para a "posição ativa".
- **Risco:** Médio — mudança ampla; exige testar cada endpoint que consome posições.
- **Validação:** Ativar log de SQL do SQLAlchemy; carregar dashboard e endpoints quant; confirmar queda no número de queries. Rodar `test_routes.py`, `test_quant.py`, `test_quant_advanced.py`, `test_fixed_income.py`.
- **Dependências:** Nenhuma (facilita P1-2).

---

## P1-2 — Eliminar queries redundantes de posições por request

- **Título:** Reutilizar posições já carregadas dentro de um mesmo request
- **Prioridade:** P1
- **Categoria:** Performance / Backend
- **Impacto esperado:** Remove múltiplas recargas da mesma base de posições dentro de um endpoint (ex.: `dividends.py` carrega 4×; `analysis.py` 3×; `optimization.py` 3×).
- **Motivo:** Funções independentes dentro de um mesmo endpoint recarregam `positions + assets + market_data` do zero.
- **Arquivos envolvidos:** `server/routes/dividends.py`, `server/domain/quant/analysis.py`, `optimization.py`, `rebalance.py`, `correlation.py`, `monte_carlo.py`, `projection.py`, `risk.py`
- **Funções/classes/componentes afetados:** Funções de cálculo que recebem `session` e recarregam posições internamente
- **O que deve ser modificado:** Aceitar as posições já carregadas como parâmetro (injeção) em vez de recarregar.
- **Como deve ser modificado:** Refatorar assinaturas para `def calc(session, positions=None)` e, quando `positions` for None, chamar `get_active_positions` (P1-1). O endpoint carrega uma vez e passa adiante.
- **O que pode ser removido:** Recarregamentos internos redundantes.
- **O que pode ser simplificado:** Pipeline de cálculo recebe um único conjunto de posições.
- **Risco:** Médio — refatoração de assinaturas.
- **Validação:** Mesma contagem de SQL reduzida; testes de quant continuam passando.
- **Dependências:** Depende de P1-1.

---

## P1-3 — CORS explícito / remover CORS genérico

- **Título:** Restringir CORS a origens conhecidas (ou remover)
- **Prioridade:** P1
- **Categoria:** Segurança / Backend
- **Impacto esperado:** Elimina `Access-Control-Allow-Origin: *` com cookies de sessão; reduz superfície de ataque.
- **Motivo:** `server/backend.py:61` `CORS(app)` permite todas as origens. O frontend fala com a API via rewrite do Next (`next.config.ts:14-21`, same-origin), então CORS é desnecessário.
- **Arquivos envolvidos:** `server/backend.py`, `next.config.ts`
- **Funções/classes/componentes afetados:** `CORS(app)` (linha 61)
- **O que deve ser modificado:** Substituir por `CORS(app, origins=[...])` com a origem do frontend, ou remover CORS por completo se só houver same-origin.
- **Como deve ser modificado:** `CORS(app, resources={r"/api/*": {"origins": [os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")]}})` ou simplesmente deletar a linha se o rewrite cobrir tudo.
- **O que pode ser removido:** `CORS(app)` genérico.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo (média se houver algum cliente cross-origin não mapeado — verificar antes).
- **Validação:** Inspecionar headers de resposta CORS a partir de origem estranha → devem ser negados. Testes de integração de login seguem funcionando via rewrite.
- **Dependências:** Nenhuma.

---

## P1-4 — Token de backup via header-only + comparação constante

- **Título:** Endurecer endpoint de backup (manutenção)
- **Prioridade:** P1
- **Categoria:** Segurança / Backend / API
- **Impacto esperado:** Evita vazamento de token em logs de acesso/proxy e side-channel de temporização.
- **Motivo:** `server/routes/maintenance.py:57` aceita token via `request.args.get("token")` (URL); `:64` compara com `!=` (não constante).
- **Arquivos envolvidos:** `server/routes/maintenance.py`
- **Funções/classes/componentes afetados:** endpoint de download de backup (linhas ~57-64)
- **O que deve ser modificado:** Remover leitura via query param; usar `hmac.compare_digest`.
- **Como deve ser modificado:** `token = request.headers.get("X-Backup-Token")`; validar com `hmac.compare_digest(token or "", expected_token)`. Remover `request.args.get("token")`.
- **O que pode ser removido:** `request.args.get("token")`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo (média se algum script chamador usa query param — atualizar chamadores).
- **Validação:** Chamar backup com token na URL → 401; chamar com header correto → 200; teste de temporização não deve vazar.
- **Dependências:** Nenhuma.

---

## P1-5 — update_prices() não carregar tabela toda + índices is_deleted

- **Título:** Otimizar atualização de preços e indexar soft-delete
- **Prioridade:** P1
- **Categoria:** Performance / Banco de Dados / Backend
- **Impacto esperado:** `update_prices` deixa de carregar toda a `MarketData` em memória; filtros `is_deleted=False` usam índice.
- **Motivo:** `server/infrastructure/market_data.py:41` faz `session.query(MarketData).all()` montando dict de toda a tabela. Colunas `is_deleted` em várias tabelas não são indexadas.
- **Arquivos envolvidos:** `server/infrastructure/market_data.py`, `database/models.py`
- **Funções/classes/componentes afetados:** `update_prices` (market_data.py); modelos `CreditCard`, `FixedIncome`, `RefundConfig`, `Debtor`, `ReceivableLoan`, `LoanInstallment`, `PaymentTransaction`, `PriceAlert`, `AIChatHistory`, `TriggeredAlert`, `CardExpense`, `CardInstallment`
- **O que deve ser modificado:** Carregar apenas registros relevantes (por `asset_id` necessários) e adicionar índices em `is_deleted` (+ `user_id`).
- **Como deve ser modificado:** Em `update_prices`, buscar `MarketData` filtrando pelos `asset_id` em atualização (subquery/IN) em vez de `.all()`. Adicionar `Index('ix_<tabela>_user_deleted', 'user_id', 'is_deleted')` em `__table_args__` das tabelas soft-delete.
- **O que pode ser removido:** O `.all()` da tabela inteira.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo-Médio (índices exigem nova migration — ver P2-10).
- **Validação:** Medir tempo de `update_prices` com tabela grande; explain de queries `is_deleted` usando índice. Testes de preço continuam.
- **Dependências:** Índices dependem de P2-10 (migrations).

---

## P1-6 — safe_commit() com retry

- **Título:** Adicionar retry em `safe_commit` para `database is locked`
- **Prioridade:** P1
- **Categoria:** Banco de Dados / Backend / Escalabilidade
- **Impacto esperado:** Maior resiliência a `OperationalError: database is locked` sob concorrência (worker + 10 usuários).
- **Motivo:** `database/models.py:9-11` `safe_commit` é apenas `session.commit()` sem retry; `OperationalError` importado mas não usado ali.
- **Arquivos envolvidos:** `database/models.py`
- **Funções/classes/componentes afetados:** `safe_commit(session)`
- **O que deve ser modificado:** Envolver `commit` em retry com backoff curto capturando `OperationalError`.
- **Como deve ser modificado:** `tenacity` já está importado em `models.py:6` e `OperationalError` em `models.py:7`. Usar decorator de retry (mais limpo) ou loop explícito:

  ```python
  # models.py
  @retry(retry=retry_if_exception_type(OperationalError),
         stop=stop_after_attempt(3), wait=wait_fixed(0.1), reraise=True)
  def safe_commit(session):
      session.commit()
  ```

  **Cuidado:** `safe_commit` é chamado dentro de `cache_helper` e de rotas sob `Session()` scoped. O `reraise=True` garante que falhas reais ainda propagam. O SQLAlchemy já faz rollback implícito do statement falho; para `database is locked` o rollback explícito antes do retry não é necessário.
- **O que pode ser removido:** N/A.
- **O que pode ser simplificado:** Usar decorator `tenacity.retry` já disponível.
- **Risco:** Baixo.
- **Validação:** Teste de concorrência (várias escritas simultâneas) não deve falhar com locked; testes existentes continuam.
- **Dependências:** Nenhuma.

---

## P1-7 — De-duplicar `_get_current_user_id()` (7×)

- **Título:** Unificar helper de usuário atual nos módulos quant
- **Prioridade:** P1
- **Categoria:** Código Morto / Backend / Arquitetura
- **Impacto esperado:** Remove 7 cópias idênticas e ramos mortos (`else` quando `uid is None`); facilita manutenção.
- **Motivo:** `domain/quant/risk.py:9`, `analysis.py:7`, `monte_carlo.py:7`, `optimization.py:9`, `projection.py:5`, `rebalance.py:6`, `correlation.py:7` definem a mesma função (sempre retorna `1` no fallback).
- **Arquivos envolvidos:** os 7 arquivos abaixo + `server/domain/quant/helpers.py`
  - `server/domain/quant/risk.py:9`
  - `server/domain/quant/analysis.py:7`
  - `server/domain/quant/monte_carlo.py:7`
  - `server/domain/quant/optimization.py:9`
  - `server/domain/quant/projection.py:5`
  - `server/domain/quant/rebalance.py:6`
  - `server/domain/quant/correlation.py:7`
- **Localização (grep):** `grep -rn "def _get_current_user_id" server/domain/quant/`
- **Funções/classes/componentes afetados:** `_get_current_user_id()` (cada arquivo)
- **O que deve ser modificado:** Definir uma única função em `helpers.py` e importar.
- **Como deve ser modificado:** Adicionar `def get_current_user_id(): return getattr(g, "user_id", 1)` em `helpers.py`; remover as 7 definições locais e ajustar imports.
- **O que pode ser removido:** 7 definições duplicadas + ramos `else` inatingíveis.
- **O que pode ser simplificado:** Uma fonte de "usuário atual".
- **Risco:** Baixo.
- **Validação:** Testes quant continuam passando; grep confirma definição única.
- **Dependências:** Nenhuma.

---

## P1-8 — De-duplicar `get_secure_session()` + User-Agent

- **Título:** Centralizar cliente HTTP e User-Agent
- **Prioridade:** P1
- **Categoria:** Código Morto / Backend
- **Impacto esperado:** Remove 2 cópias idênticas de `get_secure_session` e 5+ strings User-Agent duplicadas.
- **Motivo:** `routes/market.py:60-81` e `routes/calendar.py:22-43` são idênticos; User-Agent repetido em news, calendar, market, b3_fnet, cvm_enet.
- **Arquivos envolvidos:** `server/routes/market.py:60`, `server/routes/calendar.py:22`, `server/routes/news.py:29`, `server/crawlers/b3_fnet.py:56`, `server/crawlers/cvm_enet.py:49`, (novo) `server/infrastructure/http_client.py`
- **Localização (grep):** `grep -rn "def get_secure_session" server/routes/` e `grep -rn "User-Agent" server/routes server/crawlers`
- **Funções/classes/componentes afetados:** `get_secure_session`, constantes de User-Agent
- **O que deve ser modificado:** Criar `infrastructure/http_client.py` com `get_secure_session()` e `DEFAULT_HEADERS`.
- **Como deve ser modificado:** Mover a função e o header para o módulo novo; importar nos 5 arquivos; remover duplicatas.
- **O que pode ser removido:** Cópias locais.
- **O que pode ser simplificado:** Um cliente HTTP compartilhado.
- **Risco:** Baixo.
- **Validação:** Crawlers/rotas de mercado continuam buscando dados; grep confirma definição única.
- **Dependências:** Nenhuma.

---

## P1-9 — De-duplicar helpers de data (refunds vs credit_cards)

- **Título:** Unificar helpers de fatura/vencimento/meses
- **Prioridade:** P1
- **Categoria:** Código Morto / Backend
- **Impacto esperado:** Remove 3 pares de funções idênticas com nomes diferentes.
- **Motivo:** `refunds.py:32-56` (`get_fatura_mes_helper`, `get_due_date_for_fatura_helper`, `add_months`) são idênticas a `credit_cards.py:12-36`.
- **Arquivos envolvidos:** `server/routes/refunds.py`, `server/routes/credit_cards.py`, (novo) `server/utils/date_helpers.py`
- **Funções/classes/componentes afetados:** as 3 funções em cada arquivo
- **O que deve ser modificado:** Mover para `utils/date_helpers.py` e importar.
- **Como deve ser modificado:** Criar `date_helpers.py` com as 3 funções; substituir chamadas; remover duplicatas.
- **O que pode ser removido:** 3 definições em refunds.py e 3 em credit_cards.py.
- **O que pode ser simplificado:** Helpers de data centralizados.
- **Risco:** Baixo.
- **Validação:** Testes de refund e cartão de crédito continuam; grep confirma definição única.
- **Dependências:** Nenhuma.

---

## P1-10 — De-duplicar extração MultiIndex/close e bloco EWMA

- **Título:** Centralizar extração de preços e cálculo EWMA nos módulos quant
- **Prioridade:** P1
- **Categoria:** Código Morto / Backend / Performance
- **Impacto esperado:** Remove 8× bloco de extração `Close` e 5× bloco EWMA (`0.94`); reduz inconsistências (`hasattr(levels)` vs `isinstance MultiIndex`).
- **Motivo:** Padrões copy-paste em risk, correlation, rebalance, optimization, analysis.
- **Arquivos envolvidos:** `server/domain/quant/risk.py`, `correlation.py`, `rebalance.py`, `optimization.py`, `analysis.py`, `helpers.py`
- **Localização exata (blocos):** extração `Close` em `risk.py:64-68`, `correlation.py:43-46 & 108-112`, `rebalance.py:64-68`, `optimization.py:41-45 & 98-102 & 167-171`, `analysis.py:40-44 & 131-134 & 231-235 & 307-311`; EWMA `decay=0.94` em `correlation.py:58-61 & 125-128`, `rebalance.py:72-75`, `optimization.py:53-56 & 110-115 & 179-184`, `analysis.py:144-148`.
- **Funções/classes/componentes afetados:** blocos inline de extração e EWMA; nota: `helpers.py:28-29` `_to_yf_ticker` é apenas pass-through para `utils.ticker_helper.to_yf_ticker` (14 call sites) — pode ser eliminado chamando `to_yf_ticker` direto (item menor, opcional dentro desta tarefa).
- **O que deve ser modificado:** Criar `extract_close(prices)` e `ewma_cov_corr(returns, decay=0.94)` em `helpers.py`.
- **Como deve ser modificado:** Substituir os blocos repetidos pelas funções; usar sempre `isinstance(raw.columns, pd.MultiIndex)`.
- **O que pode ser removido:** ~13 blocos duplicados.
- **O que pode ser simplificado:** Lógica de preços/correlação em um lugar.
- **Risco:** Médio (tocar cálculos numéricos — exige comparar resultados).
- **Validação:** Reproduzir saídas de risk/correlation/optimization antes e depois; testes quant.
- **Dependências:** Nenhuma.

---

## P1-11 — Unificar classificação setorial (3 implementações)

- **Título:** Única fonte de mapeamento ticker→setor
- **Prioridade:** P1
- **Categoria:** Arquitetura / Backend
- **Impacto esperado:** Evita divergência de classificação entre risk, exposure e dashboard.
- **Motivo:** `risk.py:199-221` (substring), `exposure.py:26-46` (`SECTOR_MAP` dict), `dashboard.py` — três lógicas diferentes.
- **Arquivos envolvidos:** `server/domain/quant/risk.py`, `exposure.py`, `server/services_modules/dashboard.py`
- **Funções/classes/componentes afetados:** funções de classificação de setor
- **O que deve ser modificado:** Definir `SECTOR_MAP` único (em `exposure.py` ou `helpers.py`) e função `sector_of(ticker)`.
- **Como deve ser modificado:** Consolidar os mapas; substituir as 3 implementações pela função central.
- **O que pode ser removido:** 2 implementações redundantes.
- **O que pode ser simplificado:** Um mapeamento de setor.
- **Risco:** Baixo-Médio (afeta exposição por setor — validar gráficos).
- **Validação:** Gráficos de exposição setorial inalterados; testes de exposure.
- **Dependências:** Nenhuma.

---

## P1-12 — Renomear `/api/market/brief` + validar JSON

- **Título:** Corrigir semântica de rota e validação de JSON
- **Prioridade:** P1
- **Categoria:** API / Backend / Segurança
- **Impacto esperado:** Rota com nome coerente; JSON malformado retorna 400 em vez de `None` downstream.
- **Motivo:** `simulation.py:104` `/api/market/brief` devolve Morning Brief de IA. `get_json(silent=True)` em 6 rotas mascara erros.
- **Arquivos envolvidos:** `server/routes/simulation.py`, `assets.py`, `ai.py`, `alerts_price.py`, `quant_analysis.py`, `dashboard.py`
- **Localização exata (`get_json(silent=True)`):** `quant_analysis.py:451`, `assets.py:225`, `assets.py:248`, `ai.py:141`, `ai.py:283`, `alerts_price.py:75`, `dashboard.py:115`
- **Funções/classes/componentes afetados:** endpoints que usam `request.get_json(silent=True)`
- **O que deve ser modificado:** Renomear para `/api/ai/morning-brief`; trocar `silent=True` por `force=True` com try/except ou validar `None`.
- **Como deve ser modificado:** Mudar `@route` e o fetch no frontend; substituir `get_json(silent=True)` por `get_json(force=True)` envolto em `try/except BadRequest` ou checar `if data is None: return 400`.
- **O que pode ser removido:** `silent=True`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo-Médio (renomear exige atualizar frontend que chama a rota).
- **Validação:** Enviar JSON inválido → 400; frontend carrega brief corretamente na rota nova.
- **Dependências:** Nenhuma (frontend usa via SWR — ajustar URL).

---

## P1-13 — Rate limiting e política de senha no auth

- **Título:** Endurecer autenticação (brute-force e força de senha)
- **Prioridade:** P1
- **Categoria:** Segurança / Backend
- **Impacto esperado:** Reduz risco de credential stuffing / força bruta; senhas mínimas mais seguras.
- **Motivo:** `auth.py:30` login sem throttle; `auth.py:69` aceita senha com 4 chars.
- **Arquivos envolvidos:** `server/routes/auth.py`
- **Funções/classes/componentes afetados:** `/api/auth/login`, registro de usuário
- **O que deve ser modificado:** Adicionar limite de tentativas e exigir senha mínima (ex.: 8) com talvez complexidade.
- **Como deve ser modificado:** Usar `flask-limiter` (adicionar dependência) ou throttle simples em memória por IP; validar `len(password) >= 8` no registro/login.
- **O que pode ser removido:** N/A.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo (média se quebrar logins de teste com senha curta — ajustar fixtures).
- **Validação:** 10 tentativas falhas seguidas → 429; senha <8 → 400. Testes de auth.
- **Dependências:** Adiciona `flask-limiter` (ver P2 — dependências).

---

> Continua em `PLANO_DE_OTIMIZACAO_PARTE_2.md` (P2) e `PLANO_DE_OTIMIZACAO_PARTE_3.md` (P3).
