# Task: Auditoria Rodada 2 — dinheiro, segurança, confiança e frontend

**Status:** Phase 2 (Planning) → Phase 3 (Implementation, fase por fase)
**Assigned Agents:** `@orchestrator` → `@debugger`, `@backend-specialist`, `@database-architect`, `@security-auditor`, `@frontend-specialist`, `@test-engineer`
**Skills Active:** `@[clean-code]`, `@[systematic-debugging]`, `@[python-patterns]`, `@[database-design]`, `@[frontend-design]`, `@[tdd-workflow]`
**Rodada anterior:** `auditoria-melhorias-assetflow.md` — **concluída**. Todos os B1-B8, P2, L1-L3 e as features F1-F3 foram implementados. Este arquivo é a rodada seguinte.

> Achados verificados por leitura de código + testes executados de verdade.
> **Backend: 100 testes, 99 passando, 1 falhando** (`test_ai_automation.py`, mock desatualizado).
> **Frontend: 46 testes passando, `tsc --noEmit` limpo.**
> Não invente achado. Se não reproduzir, reporte e pule.

---

## 0. Estado atual (leia antes de começar)

- **78 arquivos modificados + 16 untracked, nada commitado.** Isso inclui `xirr.py`, `attribution.py`, `local_ai.py`, 4 componentes novos e 4 arquivos de teste novos. Alguém trabalhou 12h em cima disso sem checkpoint.
- **A suíte de backend não roda na sua máquina**: `pytest` não está instalado no `.venv`. Só roda dentro do container. Isso precisa mudar (Fase 3).
- O app está de pé (`assetflow.localhost`), containers dev, 12 min de uptime.

**Correções ao que eu afirmei na rodada 1** (registro de honestidade):
- Eu suspeitei de "dois donos do schema" (`init_db` + Alembic). **Errado**: `init_db()` chama `command.upgrade(head)`, não `create_all`. Alembic é o dono único.
- A auditoria de frontend apontou o SSE como quebrado. **Já foi corrigido** — hoje é `EventSource('/api/sync/stream')` relativo. Item morto.

---

## 1. Fase 0 — Commitar (BLOQUEANTE, de novo)

```bash
git add -A && git commit -m "feat: XIRR, atribuição, simulador fiscal, IA local, correções B1-B8"
git switch -c fix/auditoria-rodada-2
```

78 + 16 arquivos sem commit é o maior risco do repositório hoje. **Não pule.**

---

## 2. FASE 1 — Dinheiro e patrimônio (faça esta primeiro)

Estes quatro podem apagar ou corromper dado financeiro seu. Nada mais importa antes deles.

### D1. Apagar uma transação pode **zerar a posição inteira** ⚠️ crítico

`server/services_modules/portfolio.py:322-341`

O replay do ledger trata só `BUY`, `SELL`, `SPLIT`, `INPLIT`, `BONUS`, `AMORTIZATION`. Mas `add_corporate_action` grava também `TICKER_CHANGE_OUT` (:536), `TICKER_CHANGE_IN` (:573), `SPIN_OFF` (:478) e `SPIN_OFF_RECEIPT` (:513).

Se a posição nasceu de uma mudança de ticker, o ledger dela tem **só** `TICKER_CHANGE_IN`. O laço não casa nenhum tipo conhecido, termina com `running_qty = 0`, e as linhas 340-341 gravam `pos.quantity = 0` / `pos.average_price = 0`. O commit acontece por cima. **A posição desaparece** (o dashboard filtra `quantity > 0`).

**Correção:** tratar os 4 tipos no replay — `TICKER_CHANGE_IN`/`SPIN_OFF_RECEIPT` como recomeço de posição (`running_qty = t.quantity`, `running_pm = t.unit_price`); `TICKER_CHANGE_OUT`/origem de `SPIN_OFF` como marcador sem efeito. Teste obrigatório: posição com ledger só de `TICKER_CHANGE_IN`, apagar a transação, garantir que não zera.

### D2. Edição manual de posição vive fora do ledger ⚠️ alto

`server/services_modules/portfolio.py:23-25`

`pos.quantity = Decimal(str(qtd))` grava direto na coluna, sem criar `AssetTransaction`. A partir daí existem duas verdades: a coluna e a soma do ledger. Qualquer replay futuro (D1, edição de outra transação) recalcula pelo ledger e **descarta sua edição em silêncio**.

**Correção:** `update_position` cria uma transação de ajuste (`type="ADJUSTMENT"`) e o replay a aplica como recomeço. Alternativa mínima aceitável: bloquear edição direta quando existir ledger na posição, com mensagem clara.

### D3. Backup do SQLite copia só o `.db` num banco em WAL ⚠️ alto

`server/services_modules/backup.py:23` — `shutil.copy(db_path, dest)`

`journal_mode=WAL` + `wal_autocheckpoint=1000` (`db/models/base.py:45,49`): commits recentes vivem no `-wal`. Copiar só o `.db` gera snapshot defasado e, no meio de um checkpoint, potencialmente inconsistente. **Nunca testado** — `tests/test_performance_features.py:78` mocka `_backup_database`.

**Correção:** `sqlite3.connect(db_path).backup(dest)` (API de backup do SQLite) ou `VACUUM INTO`. Teste: escrever linha, fazer backup, abrir o backup e ler a linha.

**Verifique os 13 arquivos em `backups/`** com `PRAGMA integrity_check` antes de confiar neles.

### D4. Snapshot diário pode duplicar — a tabela não impede ⚠️ médio

`server/services_modules/backup.py:50-58` faz read-then-write. `PortfolioSnapshot` (`db/models/portfolio.py:140-153`) **não tem** `UniqueConstraint('user_id','date')` — ao contrário de `MonthlyPortfolioSnapshot` (:175-177), que tem. E `take_daily_snapshot` é disparado pelo cron `0 23 * * *` **e** por cada mutação de ativo (`routes/assets.py`, 6 call sites, em background).

Editar um ativo às 22:59:58 com o cron das 23:00 rodando → dois pontos no mesmo dia no gráfico de Evolução, e a atribuição mensal passa a somar errado.

**Correção:** `UniqueConstraint('user_id','date')` + upsert (ou `IntegrityError` tratado no commit). Migration nova.

### D5. `min_6m` vira o preço atual e mata o sinal de desconto ⚠️ médio

`server/services_modules/portfolio.py:39` — `mdata.min_6m = Decimal(str(current_price))`

`min_6m` não é decorativo: `dashboard_metrics.py:102-103,125-126` calcula `desconto = ((preco - min_6m)/min_6m)*100`, e esse desconto alimenta a recomendação de compra/venda. Ao cadastrar/editar com preço atual, `min_6m == preco` → desconto sempre 0% → "sem desconto" mesmo com o papel 30% abaixo da máxima, até o próximo ciclo de preços.

**Correção:** não tocar em `min_6m` aqui. `update_prices` é a única fonte.

**Aceite da Fase 1:** os 5 cenários com teste automatizado; `pytest` 100% verde; nenhuma posição zera após exclusão de transação de evento corporativo.

---

## 3. FASE 2 — Segurança de sessão

### S1. Não existe revogação de sessão ⚠️ alto

`server/routes/auth.py:68-78,172-176,277`

Token assinado com `max_age=604800` (7 dias), stateless. `logout` (:175) só apaga o cookie do navegador. `change_password` (:277) troca o hash e **não invalida token nenhum**. Cookie vazado = acesso por 7 dias, mesmo depois de trocar a senha.

**Correção:** incluir `session_version` (ou `password_hash[:8]`) no payload de `verify_session_token`, e incrementar no `User` ao trocar senha / clicar "sair de todos os aparelhos". Migration + uma coluna.

### S2. Rate limit de login é global e conta login bem-sucedido ⚠️ alto

`server/routes/auth.py:82-83,118`

`request.remote_addr` atrás do Traefik+Next é **o IP do container do frontend** — igual para todo cliente. E `is_rate_limited` roda antes da validação, incrementando em toda tentativa, inclusive as que dão certo.

Resultado: você erra a senha 2x, tenta de novo e recebe 429. Pior: `/api/auth/login` está em `PUBLIC_PREFIXES` (`middleware.ts`), então qualquer um que alcance a rota queima suas 5 vagas e te tranca fora.

**Correção:** usar o primeiro IP de `X-Forwarded-For` e só contar quando `check_password_hash` falhar.

### S3. `getattr(g, 'user_id', 1)` em 13 lugares ⚠️ médio (latente)

`routes/portfolio.py:42,178,200,212,758,784` · `routes/tax.py:16,24,36,62` · `routes/simulation.py:310,328` · `routes/ocr_import.py:74`

Se `g.user_id` faltar, a rota lê/grava **dados do usuário 1** em vez de falhar. Hoje não é explorável (o `before_request` garante `g.user_id`), mas basta uma rota nova entrar na lista de exceções para virar IDOR.

**Correção:** helper `current_user_id()` em `utils/` que levanta 401 quando ausente; trocar os 13 pontos.

### S4. `/api/sync/stream` é público nas duas pontas

`server/backend.py:126` e `PUBLIC_PREFIXES` em `middleware.ts`. Entrega status/progresso/mensagem de sync sem auth. Sensibilidade baixa, mas é uma rota de API aberta.

**Correção:** exigir sessão no route handler do Next (que já tem o cookie) e repassar; ou aceitar o risco e documentar.

**Aceite da Fase 2:** teste provando que trocar a senha invalida um token emitido antes; teste provando que 5 logins bem-sucedidos não disparam 429; nenhum `getattr(g, 'user_id', 1)` restante.

---

## 4. FASE 3 — Confiança: o CI está verde mentindo

### C1. O CI não roda a maior parte dos testes ⚠️ crítico (para confiança)

`.github/workflows/ci-cd.yml:63` — `python -m unittest discover -s server/tests -p "test_*.py"`

`unittest discover` só coleta subclasses de `TestCase`. **8 arquivos** usam `TestCase`; **11 arquivos** usam `def test_` de módulo (~50 funções) e **não são coletados**. Os pulados incluem `test_tax_engine`, `test_risk_metrics`, `test_quant`, `test_quant_pure`, `test_monte_carlo`, `test_projection`, `test_fixed_income`, `test_portfolio_service`, `test_routes`.

O job se chama "🐍 Backend Check (Flask & PyTest)" e não usa pytest. **Correção:** `python -m pytest server/tests -q`. Adicionar `pytest` ao `requirements.txt` (já está) e instalar no `.venv` local.

### C2. Nenhum gate de lint em lugar nenhum ⚠️ médio

O job `frontend-check` se chama "Lint & Vitest" e não roda `npm run lint` (`ci-cd.yml:17-34`). O `pre-commit` (`.pre-commit-config.yaml`) também não tem linter. **Correção:** adicionar `npm run lint` ao CI e um hook `ruff`/`eslint` no pre-commit.

### C3. Job de deploy fantasma ⚠️ médio

`ci-cd.yml:100-120` é só `echo`, com o SSH comentado. Enquanto isso `.github/workflows/deploy.yml:61-113` faz o deploy real, e **os dois disparam em push para `main`**. **Correção:** remover o job fantasma do `ci-cd.yml`.

### C4. O mecanismo de isolamento por usuário não tem teste ⚠️ alto

`server/db/models/base.py:52-58` — `before_flush_user_scoping` é o único ponto que carimba `user_id` em objeto novo. Zero referências em `server/tests/`.

**Correção:** dois testes — objeto novo sem `user_id` recebe o carimbo; objeto com `user_id` alheio **não** é sobrescrito (o hook só preenche quando é `None`, então hoje um `user_id` errado passa).

### C5. Sem teste: `dedup.py`, `dividends`, `simulation`, `refunds/loans`, `refunds/payments`, `ocr_import` ⚠️ médio

`dedup.py` é o guarda contra importar duas vezes e inflar o patrimônio. As rotas de recebíveis e de simulação movem dinheiro. **Correção:** ao menos um teste por caminho de escrita.

### C6. 1 teste falhando ⚠️ baixo

`tests/test_ai_automation.py:47` — mock monta `query().filter_by().options().all()`, mas o código usa `query().options().filter_by().all()`. **É bug do teste, não do código.** Aproveitar e conferir por que `risk.py:20` engoliu o erro (hoje protege, mas mascara).

**Aceite da Fase 3:** CI verde com `pytest` coletando ~100 testes; `npm run lint` como gate; 100% de aprovação local.

---

## 5. FASE 4 — Performance de dados e imagem

### P1. `get_active_positions` carrega **todos os dividendos de todos os ativos** ⚠️ alto

`server/db/models/base.py:31-37` — `selectinload(Asset.dividends)` sempre, em toda chamada.

`services_modules/dashboard.py:182` e `:207` chamam `get_active_positions` **duas vezes na mesma request** de detalhe de ativo, e o laço `:213-222` só precisa de um somatório por categoria. Custo: ~10 queries por clique + O(ativos × dividendos) linhas em memória (30 ativos × 100 proventos ≈ 3.000 linhas) para produzir dois escalares.

**Correção:** no detalhe do ativo, usar `SUM()` agregado por categoria em vez de `get_active_positions`. E criar uma variante sem `dividends` para quem não exibe proventos.

### P2. N+1 no histórico de dividendos ⚠️ médio

`server/routes/dividends.py:84,89` — `.join(Asset)` sem `contains_eager`/`joinedload`; `div.asset.ticker` faz lazy load por linha. 200 proventos = 201 queries. **Correção:** `.options(joinedload(Dividend.asset))`.

### P3. Dois índices duplicados cobram escrita sem ganho ⚠️ baixo

`alembic/versions/e4f5a6b7c8d9_add_performance_indexes.py:23,26`:
- `idx_asset_tx_user_date` duplica `idx_txs_user_date_desc` (SQLite varre índice em sentido inverso).
- `idx_dividends_asset_date` duplica `idx_dividends_asset_date_com`.

**Correção:** migration nova com `DROP INDEX`.

### P4. Índices declarados nos models que não existem no banco ⚠️ baixo (confiança)

`idx_dividends_asset_date_com_desc` e `idx_market_data_asset_date_desc` estão nos models e em **nenhuma** das 13 migrations. Como Alembic é o dono único do schema, são decorativos. **Correção:** criar na migration ou remover do model.

### P5. 70,7 MB de cache CVM vão para a imagem de produção ⚠️ médio

`.dockerignore` não exclui `server/data/` nem `server/tests/`; `server/Dockerfile:39` faz `COPY server /app/server`. Medido: `cvm_cache` 70,7 MB (3 zips) + `sample_nubank.pdf`. Imagem: 336 MB de conteúdo. Só 7 dos 14 `__pycache__` estão listados.

**Correção:** `.dockerignore` += `server/data/`, `server/tests/`, `**/__pycache__`. O worker baixa o cache de novo.

### P6. Chamada de rede síncrona com resultado descartado no caminho de escrita ⚠️ médio

`services_modules/portfolio.py:144-147` — `yf.Ticker(...).fast_info` e `_ = ticker_info['lastPrice']`. O valor é jogado fora; só serve para o `except` logar. Roda a cada `add_transaction` de ticker novo, **dentro** do `with Session()`, sem timeout. Yahoo lento trava o POST por 10-30s; com `--threads 8`, 8 destes travam o backend.

**Correção:** deletar o bloco. A validação real já existe em `market_data.py:108`.

**Aceite da Fase 4:** detalhe de ativo com ≤4 queries (medir com logging de SQL); nenhum `selectinload(dividends)` em caminho que não mostra proventos; imagem < 270 MB.

---

## 6. FASE 5 — Frontend: bugs e UX

### U1. `slate-850` não existe — **79 usos, 69 no Skeletons** ⚠️ alto (visual)

`app/components/ui/Skeletons.tsx` e mais 6 arquivos usam `bg-slate-850`. A escala slate do Tailwind v4 termina em 900/950, e `globals.css` não define `--color-slate-850`. A classe **não gera CSS**: os skeletons renderizam **transparentes**, então toda tela de carregamento parece página vazia.

**Correção:** declarar `--color-slate-850` no `@theme inline` (1 linha resolve os 79) — ou trocar por `slate-800`.

### U2. Variação diária zera entre 21h e 23h59 ⚠️ alto

`app/features/assets/components/asset-row/useAssetRowStats.ts:25` e `app/features/assets/hooks/usePortfolioMetrics.ts:31` usam `new Date().toISOString().split('T')[0]`, que é **UTC**. Em BRT o dia UTC vira às 21h. Nesse intervalo, "hoje" não casa com a data da cotação e a variação diária zera em todas as linhas — e no total do header.

**Correção:** `new Date().toLocaleDateString('sv-SE')` entrega `YYYY-MM-DD` local. Teste com data fixa.

### U3. `apiCall` força `Content-Type: application/json` em `FormData` ⚠️ alto (causa raiz)

`app/lib/api.ts:41`. É por isso que existem 19 `fetch` crus no app: uploads não podem usar `apiCall` e perdem o timeout. Em `UnifiedImportModal.tsx` (6 pontos), `StatementImportModal.tsx:120`, `FixedIncomeTab.tsx:49,69,95`, `ToolsMenu.tsx:65` — requisição pendurada deixa o botão em "enviando" **para sempre**, sem erro.

**Correção:** não setar o header quando `body instanceof FormData`. Uma linha destrava a consolidação de todas as chamadas.

### U4. `ToastContext` recria o value a cada render ⚠️ médio

`app/context/ToastContext.tsx:67` — `value={{ notify }}`. Cada toast e cada auto-dismiss (3s) re-renderiza os 8 consumidores, incluindo `page.tsx`, que derruba o `memo` de `AssetsTable`. **Correção:** `useMemo(() => ({ notify }), [notify])`.

### U5. Login ignora o `callbackUrl` ⚠️ médio

`app/login/page.tsx:45` — `router.push('/')`. O `middleware.ts` grava `?callbackUrl=` no redirect e **nada lê**. Sessão expirada em `/tax` → login → cai em `/`. **Correção:** ler o parâmetro, validar `startsWith('/')` e navegar.

### U6. Agenda é all-or-nothing ⚠️ médio

`app/agenda/page.tsx:68-89` — `Promise.all` de 5 endpoints; um timeout de 60s e o `.catch` só faz `console.error`. Calendário, YOC e sazonalidade ficam vazios e a página diz "sem proventos" — erro de rede vira informação financeira falsa. **Correção:** `Promise.allSettled` e renderizar o que chegou, com aviso do que falhou.

### U7. Logout pode não deslogar ⚠️ médio

`app/features/header/components/Header/UserMenu.tsx:38-43` — não checa `res.ok` e tenta apagar cookie `HttpOnly` via `document.cookie` (o browser ignora e cria um segundo cookie de mesmo nome). Se `/api/auth/logout` falhar, o middleware lê o cookie antigo e devolve o usuário para `/`. **Correção:** usar `apiCall`, redirecionar só em sucesso, remover a linha 43.

### U8. Mensagem de erro aponta para a porta 5328 ⚠️ baixo

`usePortfolioHandlers.ts:62` — "Verifique se o backend está rodando na porta 5328" e descarta `e.message`. Atrás do Traefik não existe essa porta. **Correção:** mostrar `e.message`.

### U9. Acessibilidade ⚠️ baixo

- `app/login/page.tsx:98-120` — inputs sem `name`, `id`/`htmlFor` e `autocomplete`. Gerenciador de senha não preenche; leitor de tela anuncia campo sem nome.
- `SystemStatus.tsx:44-52` e `UserMenu.tsx:27-33` — o mesmo dropdown duplicado duas vezes: não fecha no `Escape`, não move foco, `aria-haspopup="menu"` sem `role="menu"`. **Correção:** um `<Dropdown>` único com `Escape`, foco inicial e roles.

### U10. Busca promete "setor" e não busca ⚠️ baixo

`app/components/AssetsTable.tsx:55,93` — placeholder diz "ticker ou setor", o filtro compara só `ticker` e `tipo`, e `Asset` não tem setor. Digitar "Bancos" mostra "Sem correspondências". **Correção:** tirar "ou setor" do placeholder ou expor o setor no payload.

### U11. `ErrorBoundary` não reporta ao Sentry ⚠️ baixo

`app/components/ui/ErrorBoundary.tsx:26` — `componentDidCatch` só faz `console.error`, e o `Header` está fora de qualquer boundary em `page.tsx`: um erro ali derruba a página inteira sem telemetria.

**Aceite da Fase 5:** skeleton visível (não transparente); variação diária correta às 22h; upload de extrato falha com mensagem em vez de travar o botão; `npm test` cobrindo U2 e U3.

---

## 7. FASE 6 — Polir os módulos novos

Os módulos que acabaram de nascer têm bugs de rótulo e de robustez. Num app de dinheiro, rótulo errado é bug.

### N1. `xirr.py` importa módulo que não existe ⚠️ alto

`server/domain/portfolio/xirr.py:218` — `from services_modules.market_data import MarketDataService`. Esse módulo **não existe** (o único `get_usd_rate` está em `services.py:78`, em `PortfolioService`). O `except Exception: pass` engole o ImportError e `usd_rate` fica **fixo em 5.5**.

Efeito: o `patrimonio_atual` do endpoint de retornos calcula ativos em USD a 5,5 fixo, divergindo do total do dashboard (que usa a cotação real). **Correção:** `from services import PortfolioService; PortfolioService().get_usd_rate()`, como já é feito em `routes/ai.py`.

### N2. Rótulos falsos de benchmark ⚠️ alto

- `app/features/evolution/components/ReturnsKpiCards.tsx:82` — título **"TIR Real (XIRR Anual)"** exibe `xirr_aa_pct`, que é a TIR **nominal**. A real (`xirr_real_aa_pct`) está no rodapé da linha 89.
- `ReturnsKpiCards.tsx:112` ignora `benchmarks.cdi_source`. Quando o BCB cai, o backend devolve `fallback` (10,5% a.a. hardcoded) e a tela mostra como se fosse CDI real.
- `PerformanceAttributionChart.tsx:217` afirma "Fonte IPCA: BCB SGS 433" **sempre**, mesmo com `ipca_source: "fallback"`.

**Correção:** título "TIR (XIRR a.a.)" e um `Badge` "estimado" quando `cdi_source`/`ipca_source` for `fallback` ou `bcb_stale_cache`. O dado já vem do backend; só falta mostrar.

### N3. TWR cai para ROI sem avisar ⚠️ médio

`xirr.py:345` — `twr_pct = ... if has_twr else roi_simples_pct`. Sem série de atribuição, o card "TWR (Modified Dietz)" mostra ROI simples — e o rodapé já mostra ROI, então aparece o mesmo número duas vezes com nomes diferentes. **Correção:** devolver `twr_pct: None` quando não houver série, e a UI mostra "N/D".

### N4. XIRR anualizado explode em horizonte curto ⚠️ médio

`xirr.py:314,317` — `days = max(1, ...)` e anualiza sempre. Carteira de 20 dias com +2% mostra **+43% a.a.**; com +5%, +147% a.a. Matematicamente correto, praticamente enganoso.

**Correção:** se `days < 90`, mostrar a TIR do período com sufixo "no período" em vez de anualizada (ou expor `is_short_horizon` e a UI decide).

### N5. IPCA ausente cai em 0,40%/mês silenciosamente ⚠️ médio

`attribution.py:182` — `ipca_by_ym.get((y, m), FALLBACK_MONTHLY_IPCA)`. A URL do BCB pede `ultimos/60`; qualquer mês além de 60 atrás usa o fallback, e `ipca_acumulado_pct` acumula os falsos. Isso contamina o "retorno real".

**Correção:** marcar por linha `ipca_is_fallback: true` e expor a contagem no `summary`. A UI mostra um aviso quando houver meses estimados.

### N6. Componentes novos ignoram o padrão SWR ⚠️ médio

`ReturnsKpiCards.tsx:47-60` e `PerformanceAttributionChart.tsx:61-79` usam `useEffect + apiCall + useState` e buscam **uma vez no mount**. Depois de lançar uma transação os KPIs ficam velhos até recarregar a página — o resto do app usa SWR + `mutate`.

**Correção:** `useSWR('/api/performance/returns', ...)` nos dois. Menos código, e resolve a staleness.

### N7. Trabalho duplicado entre os dois endpoints ⚠️ baixo

`calculate_portfolio_returns` chama `calculate_monthly_attribution` internamente (`xirr.py:331`), e o gráfico chama `/api/performance/attribution` separado. Abrir a aba Evolução roda `get_monthly_evolution_series` **duas vezes** + dois scans completos de `AssetTransaction` e `Dividend`.

**Correção:** `/api/performance/returns` devolve também a série, ou o gráfico consome só o endpoint de retornos.

### N8. Robustez do Jarvis local ⚠️ baixo

`server/infrastructure/local_ai.py:85` — `json.loads(raw_line)` sem try: uma linha malformada do Ollama derruba o stream. E `get_ollama_status()` roda em toda completion (`:100`), um round-trip HTTP extra por mensagem.

**Correção:** `try/except json.JSONDecodeError: continue`; cachear o status por ~30s.
**Observação:** `apiCall` dá 60s para `/api/jarvis` (`app/lib/api.ts:17`) mas o Ollama tem `timeout=180` (`local_ai.py:66`). Resposta longa é abortada no cliente e o servidor continua gerando. Alinhar os dois.

---

## 8. Definition of Done (por fase)

- [ ] `cd server && python -m pytest` verde — **instalar pytest no `.venv`** (hoje não roda fora do container).
- [ ] `npm test` verde · `npm run lint` sem erro novo · `npx tsc --noEmit` limpo · `npm run build` completa.
- [ ] Migration Alembic com `upgrade` e `downgrade` funcionais quando houver schema.
- [ ] Nenhuma query sem `g.user_id`; soft delete preservado; `Numeric(18,4)` para dinheiro.
- [ ] Todo bug de dado financeiro (Fases 1, 4 e 6) tem teste que falha sem a correção.
- [ ] README/AGENTS atualizado quando o comportamento muda.

---

## 9. Prompt para o Argon (copiar e colar)

> Rode fase por fase. Ordem: **0 → 1 → 2 → 3 → 4 → 5 → 6**. A Fase 1 é a única inegociável antes de qualquer outra.

```
Leia `.agents/tasks/auditoria-rodada-2.md` e execute a Fase 0 e depois APENAS a Fase 1 (D1 a D5 — dinheiro e patrimônio).

Contexto obrigatório:
- Projeto: C:\Users\Fabricio\Projetos\asset-flow (Flask 3 + SQLite/WAL + SQLAlchemy 2 + Alembic + Next 16/React 19).
- Os achados têm `arquivo:linha` e foram verificados. Comece por eles; se um não reproduzir, reporte com evidência e pule.
- Estado real hoje: 78 arquivos modificados + 16 untracked, nada commitado. 100 testes de backend (99 passando, 1 falhando por mock), 46 de frontend passando, tsc limpo.

Fase 0 (bloqueante):
- `git add -A && git commit -m "feat: XIRR, atribuição, simulador fiscal, IA local, correções B1-B8"` e crie a branch `fix/auditoria-rodada-2`.
- Sem esse commit, pare e avise.

Restrições:
- Não trocar stack. Não adicionar dependência.
- Toda query com `filter_by(user_id=g.user_id)`; soft delete com `is_deleted`; `Numeric(18,4)` para dinheiro.
- Não refatorar `server/domain/quant/` (matemática correta) nem a pilha de overrides do tema claro.
- Não quebrar rota, campo ou resposta existente.

Ordem dentro da Fase 1 (por severidade):
1. D1 — replay de `delete_transaction` ignora TICKER_CHANGE_IN/OUT, SPIN_OFF, SPIN_OFF_RECEIPT e ZERA a posição. Corrigir os 4 tipos no replay.
2. D2 — `update_position` grava quantidade fora do ledger; criar `AssetTransaction` de ajuste.
3. D3 — backup com `shutil.copy` em WAL; trocar pela API de backup do SQLite.
4. D4 — `PortfolioSnapshot` sem unique (user_id, date); migration + upsert.
5. D5 — `min_6m = preço atual`; remover a atribuição.

Para cada um: teste que FALHA antes da correção e passa depois. Se não conseguir escrever esse teste, o bug não está entendido — pare e reporte.

Critérios de aceite:
- Posição cujo ledger só tem TICKER_CHANGE_IN não zera ao apagar transação (teste).
- Backup restaurado contém a última linha escrita antes do backup (teste).
- Snapshot diário não duplica com duas execuções concorrentes (teste).
- Editar ativo não sobrescreve `min_6m` (teste).
- `python -m pytest` 100% verde, incluindo o teste de `test_ai_automation.py` corrigido.
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` limpos.

Ao final, entregue: arquivos alterados, saída de pytest/npm test/lint/build, e o que ficou de fora com o risco.
```

---

## 10. O que NÃO fazer

- Não começar pela Fase 5 (frontend) porque é mais fácil de ver. D1 e D3 apagam dado.
- Não "melhorar" o replay criando um evento-sourcing novo. Ajustar os 4 tipos que faltam é a menor mudança completa.
- Não trocar SQLite por Postgres. O problema nunca foi o banco.
- Não instalar `scipy`, `date-fns`, `axios` ou `@tanstack/react-query` — numpy e SWR já resolvem.
- Não mexer em `api.ts` além do header de `FormData`.
- Não refatorar `ReceivablesTab`/`QuantDashboard` (já são `dynamic`) nem o tema claro.
- Não confiar no CI atual como sinal de qualidade: ele não roda 50 dos testes e não roda lint.
