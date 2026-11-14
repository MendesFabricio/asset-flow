> ## ⏸️ EM ESPERA — não executar
>
> Este plano foi escrito antes de comparar os dois projetos a fundo. Para uso
> **pessoal**, portar as camadas do Securo para o AssetFlow custa semanas
> reconstruindo o que já existe pronto e testado.
>
> **Decisão:** rodar os dois lado a lado atrás do gateway — Securo para fluxo de
> caixa, AssetFlow para carteira/imposto. Nenhum código atravessa entre eles.
>
> As fases 4 a 7 (orçamento, metas, multi-currency, QoL) podem ser consideradas
> descartadas: o Securo já faz, e melhor. A fase 3 (2FA) só vale se um dia o
> AssetFlow for exposto na internet aberta.
>
> Volte a este arquivo apenas se, depois de algumas semanas usando os dois, a
> duplicação de telas virar um problema real. Nesse caso a direção correta é a
> **inversa** da descrita aqui: fork do Securo + o motor quant do AssetFlow
> (~1.500 linhas de matemática pura). Ver seção 10.

# Task: Trazer do Securo o que o AssetFlow ainda não tem (finanças + segurança)

**Status:** Phase 2 (Planning) → Phase 3 (Implementation, fase por fase)
**Assigned Agents:** `@orchestrator` → `@database-architect`, `@backend-specialist`, `@frontend-specialist`, `@security-auditor`, `@test-engineer`
**Skills Active:** `@[clean-code]`, `@[api-patterns]`, `@[database-design]`, `@[tdd-workflow]`, `@[frontend-design]`, `@[vulnerability-scanner]`
**Fonte de referência:** `C:\Users\Fabricio\Projetos\securo` (somente leitura — ver Regra Zero)

---

## 0. Contexto

- **AssetFlow** (`C:\Users\Fabricio\Projetos\asset-flow`): Flask 3 + SQLAlchemy 2 + SQLite/WAL + Alembic, Next.js 16 / React 19, foco em **carteira de investimentos** (B3, CVM, IRPF, quant, cartões, recebíveis). ~16k LOC backend + ~17k frontend. Auth de usuário único por sessão assinada (`g.user_id`).
- **Securo** (`C:\Users\Fabricio\Projetos\securo`): FastAPI + Postgres + Redis + Celery, React/Vite, foco em **finanças pessoais** (contas, transações, conciliação, sync bancário, multi-moeda, multi-workspace). ~54k LOC backend + ~76k frontend + ~87k testes.

Os dois se **complementam**: o AssetFlow sabe o que você *tem* (ativos), o Securo sabe o que você *gasta* (fluxo de caixa). O que falta no AssetFlow é exatamente o alicerce do Securo: contas + transações.

**Objetivo desta task:** portar seletivamente as camadas que preenchem essa lacuna e endurecer a segurança, **sem** reescrever o AssetFlow e **sem** copiar código AGPL.

---

## 1. Regra Zero — Licença (bloqueante)

O Securo é **AGPL-3.0**. Copiar código dele para o AssetFlow obriga o AssetFlow a ser AGPL-3.0 também (inclusive no uso como serviço de rede).

- **Permitido:** ler o Securo para entender *comportamento*, *modelo de dados* e *decisões de produto*; reimplementar do zero no estilo do AssetFlow.
- **Proibido:** copiar/colar arquivos, funções, trechos de código, nomes de migration, cabeçalhos ou templates do Securo.
- **Exceções que não têm copyright de software:** listas factuais (ex.: nomes de categorias-padrão), formato de arquivo, esquema de banco em abstrato (tabelas e colunas são ideia, não expressão — mas escreva do seu jeito).

> Se o Fabricio decidir aceitar AGPL-3.0 no AssetFlow, isso muda o escopo e precisa ser registrado no `README.md` **antes** da primeira linha de código. Na dúvida, reimplemente.

Todos os arquivos criados nesta task levam, no topo, um comentário:
`# Reimplementação própria. Nenhum código do projeto Securo (AGPL-3.0) foi copiado.`

---

## 2. Regras técnicas invioláveis

1. **Não trocar a stack.** Continua Flask, SQLite/WAL, SQLAlchemy 2, Alembic, Next 16, Tailwind 4. Não introduzir FastAPI, Postgres, Redis, Celery, TanStack Query, React Router, shadcn.
2. **Nada de dependência nova** sem justificar em uma linha no PR. Exceções pré-aprovadas: `pyotp` (2FA, fase 3) e `cmdk` (paleta de comandos, fase 7). Todo o resto já existe.
3. **Seguir o padrão do projeto**, não o do Securo:
   - `g.user_id` em toda query; `filter_by(user_id=g.user_id, is_deleted=False)`.
   - Soft delete com `is_deleted` (padrão de `financials.py`), nunca `DELETE` físico em entidade de negócio.
   - Dinheiro em `Numeric(18, 4)`, nunca `float`.
   - Blueprint novo registrado em `server/backend.py` (`create_app`, bloco "Registrando blueprints").
   - Frontend em `app/features/<dominio>/{components,hooks}`, dinheiro por `app/lib/format.ts`, privacidade por `app/components/ui/PrivateValue`, toasts por `ToastContext`, confirmação por `ConfirmDialog`.
4. **Migration Alembic obrigatória** para cada mudança de schema (`server/alembic/versions/`), com `upgrade` e `downgrade` funcionais.
5. **Cada fase é um commit/PR independente e verde.** Não misturar fases. Se a fase 1 não estiver com `pytest` e `npm test` verdes, a fase 2 não começa.
6. **Nunca quebrar contrato existente**: rotas, campos e nomes de resposta atuais permanecem. Só adicionar.
7. **Ponytail full**: menor código que resolve por inteiro. Reaproveitar `categorizer_engine.py`, `statement_parser.py`, `formatMoney`, `ModalShell`, `Skeleton`, `Card`, `Badge` antes de criar qualquer coisa.

---

## 3. O que portar e o que ignorar

### Portar (ordem de execução)

| # | Fase | Valor | Esforço | Risco | Depende de |
|---|------|-------|---------|-------|------------|
| 1 | Contas + transações + transferências + saldo corrido | Altíssimo (é o alicerce) | Alto | Médio | — |
| 2 | Regras de categorização + payees (estende o categorizer atual) | Alto | Médio | Baixo | 1 |
| 3 | TOTP 2FA + rate limit no login + hardening de sessão | Alto | Baixo | Baixo | — |
| 4 | Orçamentos + metas | Médio | Baixo | Baixo | 1 |
| 5 | Multi-moeda (FX + fallback 1:1 com aviso) | Médio | Médio | Médio | 1 |
| 6 | Sync bancário Pluggy (atrás de env) | Alto, mas exige credencial | Alto | Alto | 1, 2 |
| 7 | Qualidade de vida: paleta ⌘K, export CSV, anexos | Médio | Baixo | Baixo | 1 |

### Não portar (e por quê)

- **Fiscal / NFS-e / jurisdições** (49 `.toml`): o AssetFlow já tem motor IRPF próprio e melhor para o caso dele. NFS-e é outro produto.
- **Invoices completo** (PDF, logo, agendamento, compartilhamento público): o AssetFlow já tem cartões com faturas (`CardInstallment.invoice_month`). Portar o stack inteiro duplica.
- **Mortgage / loan schedules**: colide com `refunds/loans.py` que já resolve recebíveis.
- **Groups / settlements**: `refunds/debtors.py` já faz isso.
- **Multi-workspace**: o AssetFlow é uma conta por usuário. Workspaces são meses de trabalho e não trazem valor agora.
- **Runtime MCP de agentes + RAG**: o Jarvis com Gemini Function Calling já resolve. Trocar agora é refatoração sem entrega.
- **Passkeys/WebAuthn**: valor real só com HTTPS em domínio próprio (o Securo documenta isso). Fica para depois do 2FA.

---

## 4. Contratos de dados (fase 1 — a base de tudo)

Criar `server/db/models/finance.py` (novo arquivo, ao lado de `portfolio.py` e `financials.py`) e exportar em `server/db/models/__init__.py`.

```python
class Account(Base):
    __tablename__ = "accounts"
    id, user_id (FK users, CASCADE, index)
    name = Column(String, nullable=False)
    type = Column(String, default="checking")   # checking | savings | cash | investment | credit_card
    institution = Column(String, nullable=True)
    currency = Column(String, default="BRL")
    opening_balance = Column(Numeric(18, 4), default=0)
    opening_date = Column(Date, default=date.today)
    is_archived = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    # Index('idx_accounts_user_deleted', 'user_id', 'is_deleted')

class Payee(Base):
    __tablename__ = "payees"
    id, user_id (FK users, CASCADE, index)
    name = Column(String, nullable=False)
    is_deleted = Column(Boolean, default=False)
    # UniqueConstraint('user_id', 'name')

class Transaction(Base):
    __tablename__ = "transactions"
    id, user_id (FK users, CASCADE, index)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(18, 4), nullable=False)   # sinal: + entrada, - saída
    description = Column(String, nullable=False)
    category = Column(String, nullable=True)          # mesma taxonomia de categorizer_engine.CATEGORIES
    payee_id = Column(Integer, ForeignKey('payees.id', ondelete="SET NULL"), nullable=True)
    notes = Column(String, nullable=True)
    transfer_id = Column(String, nullable=True, index=True)   # uuid; par de transações
    is_reconciled = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    # Index('idx_tx_user_account_date', 'user_id', 'account_id', text('date DESC'))
    # Index('idx_tx_user_date', 'user_id', text('date DESC'))
    # Index('idx_tx_user_category', 'user_id', 'category')

class CategoryRule(Base):
    __tablename__ = "category_rules"
    id, user_id (FK users, CASCADE, index)
    field = Column(String, nullable=False)      # description | payee | amount
    operator = Column(String, nullable=False)   # contains | equals | starts_with | regex | gt | lt
    value = Column(String, nullable=False)
    category = Column(String, nullable=False)
    priority = Column(Integer, default=100)     # menor roda primeiro
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
```

**Convenções que o Argon não pode inventar:**
- `amount` é **sinalizado** e único (sem coluna `type`). Entrada positiva, saída negativa.
- **Transferência** = duas linhas em `transactions`, mesmo `transfer_id` (uuid4 hex), sinais opostos, `category = "Transferências/Pessoas"`. Criadas em uma única transação de banco.
- **Saldo nunca é coluna.** Saldo = `opening_balance + SUM(amount)` calculado em SQL. Saldo corrido por window function (`SUM(...) OVER (PARTITION BY account_id ORDER BY date, id)`).
- Valor de investimento **não** é duplicado: `Position` continua sendo a verdade dos ativos. `Account(type="investment")` só espelha o caixa da corretora, se ele quiser.

---

## 5. Fases detalhadas

### Fase 1 — Contas e transações

**Backend**
- `server/db/models/finance.py` (models acima) + export em `__init__.py`.
- Migration `alembic revision -m "add accounts transactions payees rules"` com `upgrade`/`downgrade`.
- `server/routes/accounts.py` → `accounts_bp`:
  - `GET /api/accounts` (lista + `balance` e `transaction_count` por conta)
  - `POST /api/accounts`, `PUT/PATCH /api/accounts/<id>`, `DELETE /api/accounts/<id>` (soft)
  - `GET /api/accounts/<id>/balance?as_of=YYYY-MM-DD`
- `server/routes/transactions.py` → `transactions_bp`:
  - `GET /api/transactions?account_id&from&to&category&q&limit&offset` (paginado, ordenado por `date DESC, id DESC`)
  - `GET /api/accounts/<id>/transactions?from&to` com `running_balance` por linha
  - `POST /api/transactions`, `PATCH /api/transactions/<id>`, `DELETE /api/transactions/<id>` (soft)
  - `POST /api/transactions/transfer` (`from_account_id`, `to_account_id`, `amount`, `date`, `description`) → par atômico, 400 se contas iguais
  - `GET /api/transactions/summary?from&to` → total entradas, total saídas, saldo do período, por categoria
- Registrar os dois blueprints em `server/backend.py`.

**Frontend**
- `app/features/accounts/hooks/useAccounts.ts`, `useTransactions.ts` (SWR, padrão dos hooks existentes).
- `app/features/accounts/components/`: `AccountsTab.tsx`, `AccountCard.tsx`, `AccountModal.tsx`, `AccountDetail.tsx`, `TransactionsTable.tsx`, `TransactionModal.tsx`, `TransferModal.tsx`, `TransactionFilters.tsx`.
- Nova aba "Contas" em `useDashboardState.ts` + `DashboardTabContent.tsx` (grupo "Minha Carteira", antes de Cartões).
- Reusar: `ModalShell`, `Card`, `Badge`, `Skeleton`, `ConfirmDialog`, `PrivateValue`, `ToastContext`, `formatMoney`, `useFloatingTooltip`.
- Tabela com virtualização só se passar de 200 linhas (já existe `@tanstack/react-virtual`).

**Testes (obrigatórios)**
- `server/tests/test_accounts.py`: criar conta, listar com saldo, soft delete, isolamento por `user_id`.
- `server/tests/test_transactions.py`: criar, saldo = opening + soma, transferência gera 2 linhas com sinais opostos, saldo corrido na ordem certa, paginação.
- `app/features/accounts/hooks/useTransactions.test.ts` (mock de `apiCall`).
- Seguir o padrão de `server/tests/test_credit_cards_invoices.py` (unittest + patch de `routes.auth.verify_session_token` + nomes únicos por `uuid`).

**Aceite:** consigo criar 2 contas, lançar 5 transações, transferir entre elas, ver saldo correto em cada uma e saldo total consolidado. `pytest` e `npm test` verdes.

---

### Fase 2 — Regras de categorização + payees

- `server/services/rules_engine.py`: função pura `apply_rules(description, payee_name, amount, rules) -> category|None`. Ordena por `priority`, primeira que casar vence. `regex` compilado com `re.IGNORECASE`, **rejeitar padrão que casa string vazia** e tratar `re.error` como erro de validação.
- **Não duplicar categorização**: a ordem é `regra do usuário` → `categorizer_engine.classify()` (que já existe) → `"Outros"`. Se a regra casar, o ML nem roda.
- Aplicar regras em `POST /api/transactions`, no import de extrato (`statement_import`) e em `POST /api/rules/apply` (preview: retorna quantas seriam afetadas, não grava; `?commit=true` grava).
- `server/routes/rules.py` → `rules_bp`: CRUD de regras + CRUD de payees (`/api/payees`).
- Auto-criar payee a partir da descrição normalizada quando o usuário lançar transação nova e não escolher payee (reusar `utils/formatters.py` ou criar normalização local simples: uppercase + sem acento, como o Securo faz — reimplementado).
- Frontend: `app/features/rules/components/RulesTab.tsx` + `RulesModal.tsx` na aba "Avançado" (`app/avancado/page.tsx`), não em aba nova.

**Aceite:** crio a regra `description contains "ifood" → Alimentação`, lanço 3 transações, as 3 saem categorizadas; apago a regra e nada quebra. Preview de apply retorna contagem correta sem gravar.

---

### Fase 3 — Segurança (independente das fases 1 e 2)

- `Users` ganha: `totp_secret` (String, nullable), `totp_enabled` (Boolean, default False), `totp_backup_codes` (String/JSON, hashes), `failed_login_count`, `locked_until`.
- `pyotp` para TOTP; `qrcode` para o QR (ou gerar `otpauth://` e deixar o front desenhar — preferir o `otpauth://` e um QR em canvas, evitando dependência).
- `POST /api/auth/2fa/setup` (gera secret, retorna otpauth URL), `POST /api/auth/2fa/enable` (confirma código), `POST /api/auth/2fa/disable` (exige senha + código), `GET /api/auth/2fa/backup-codes` (regenera), `POST /api/auth/2fa/verify` (no login).
- Fluxo de login em duas etapas: senha correta + `totp_enabled` → cookie parcial (5 min) que só serve para `/api/auth/2fa/verify`.
- **Backup codes**: 10 códigos de uso único, guardados como hash, exibidos uma vez.
- Rate limit no login: 5 falhas → bloqueio de 15 min (`locked_until`), mensagem genérica ("credenciais inválidas", nunca revelar se o usuário existe).
- Sessão: cookie `HttpOnly`, `SameSite=Lax`, `Secure` quando `FLASK_ENV=production`; rotação do token no login.
- `middleware.ts` do Next: tratar o estado `2fa_pending`.

**Aceite:** ativo 2FA, faço logout, login pede o código; código errado 5x bloqueia; backup code funciona uma vez e só uma vez; desativar exige senha + código.

---

### Fase 4 — Orçamentos e metas

- `Budget` (`user_id`, `category`, `year`, `month`, `amount`) e `Goal` (`user_id`, `name`, `target_amount`, `target_date`, `account_id` opcional, `is_achieved`).
- `GET /api/budgets?year&month` retorna `amount`, `spent` (soma de `transactions` negativas da categoria no mês), `remaining`, `pct`.
- `GET /api/goals` com `progress` = saldo da conta vinculada / `target_amount` (ou soma manual).
- Frontend: `app/features/budgets/components/BudgetsTab.tsx` + `GoalCard.tsx`. Uma aba "Orçamentos" no grupo "Análises & IA".

**Aceite:** defino orçamento de R$ 500 para Alimentação; ao lançar despesa de R$ 120 a barra mostra 24% e fica vermelha acima de 100%.

---

### Fase 5 — Multi-moeda

- `server/services/fx.py`: `get_rate(from_currency, to_currency, date)` com provider `openexchangerates` (env `OPENEXCHANGERATES_APP_ID`), cache de 24h em `SystemCache`, **fallback 1:1 com flag `is_fallback: true`** na resposta.
- `Transaction` ganha `original_amount` e `original_currency` (nullable).
- Conversão usada em saldo consolidado e nos relatórios; o front mostra um `Badge` de aviso quando `is_fallback`.

**Aceite:** sem API key, tudo funciona com 1:1 e aviso visível. Com key, o saldo em USD converte para BRL na consolidação.

---

### Fase 6 — Sync bancário Pluggy (só se as fases 1–2 estiverem prontas)

- `server/infrastructure/pluggy.py`: cliente mínimo (`/auth`, `/items`, `/accounts`, `/transactions`) com `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`.
- `server/routes/bank_sync.py`: `POST /api/bank-sync/connect-token` (gera connect token), `POST /api/bank-sync/items` (salva item + contas), `POST /api/bank-sync/sync` (importa transações), `GET /api/bank-sync/status`.
- **Dedupe obrigatório** (reusar `utils/dedup.py`): chave `(account_id, external_id)` + fallback `(account_id, date, amount, normalized_description)`.
- Sync no worker (`worker/worker_jobs.py`), não na request.
- Feature gate: se as envs não existirem, as rotas respondem 501 com mensagem clara e o front esconde a opção.
- Documentar em `.env.example` e no `README.md`.

**Aceite:** sem credenciais o app sobe normal e a UI não mostra a opção; com credenciais, conectar um item importa transações sem duplicar quando rodar 2x.

---

### Fase 7 — Qualidade de vida

- Paleta de comandos ⌘K (`cmdk`): busca unificada em contas, transações, ativos e ações (nova transação, nova conta, ir para aba).
- Export CSV de transações e de posições (já existe export em algum lugar? se existir, reaproveitar).
- Anexos de comprovante: `TransactionAttachment` (arquivo em `server/data/attachments/<user_id>/<uuid>.<ext>`, limite 5 MB, só `pdf/jpg/png`), download autenticado por `user_id`.

---

## 6. Definition of Done (por fase)

- [ ] `cd server && python -m pytest` verde (sem regressão nos testes que já existem).
- [ ] `npm test` verde.
- [ ] `npm run lint` sem erro novo.
- [ ] `npx tsc --noEmit` limpo.
- [ ] Migration aplica e reverte (`alembic upgrade head` / `downgrade -1`).
- [ ] Nenhuma query sem `g.user_id` no filtro.
- [ ] `docker compose -f docker-compose.gateway.yml config` sem erro.
- [ ] README do projeto atualizado com o que entrou.
- [ ] Cabeçalho de reimplementação em todo arquivo novo que nasceu de referência ao Securo.
- [ ] Nenhum código, comentário ou template copiado do repositório Securo.

---

## 7. Ordem de execução

```
Fase 3 (segurança)  ─┐
Fase 1 (contas)      ├─ podem rodar em paralelo por agentes diferentes
                     │  (3 não toca em models de finanças)
Fase 2 (regras)      ─┘  depende de 1
Fase 4 (orçamentos)     depende de 1
Fase 5 (FX)             depende de 1
Fase 7 (QoL)            depende de 1
Fase 6 (Pluggy)         depende de 1 + 2
```

Cada fase: um PR, um commit, verificação própria. Não abrir a fase seguinte com a anterior vermelha.

---

## 8. Prompt para o Argon (copiar e colar)

> Troque só a fase na primeira linha para rodar as outras. Sugestão de ordem: 1 → 2 → 3 → 4 → 5 → 7 → 6.

```
Leia `.agents/tasks/port-securo-financas.md` e execute APENAS a Fase 1 (Contas, transações, transferências e saldo corrido).

Contexto obrigatório:
- Projeto: C:\Users\Fabricio\Projetos\asset-flow (Flask 3 + SQLite/WAL + SQLAlchemy 2 + Alembic + Next 16/React 19).
- Referência de COMPORTAMENTO (somente leitura, NUNCA copiar código): C:\Users\Fabricio\Projetos\securo — licença AGPL-3.0. Copiar código contamina o projeto. Reimplemente no estilo do AssetFlow.
- Regra Zero do arquivo de task é bloqueante: nenhum trecho, nome de função, template ou migration copiado do Securo.
- O contrato de dados da Fase 1 (seção 4 do arquivo) é fechado: não invente coluna, não troque nome, não adicione `type` em Transaction. `amount` é sinalizado; saldo é calculado, nunca armazenado.

Restrições:
- Não trocar stack. Não adicionar dependência fora das pré-aprovadas no arquivo.
- Toda query com `filter_by(user_id=g.user_id)`; soft delete com `is_deleted`; dinheiro em Numeric(18,4).
- Blueprints novos registrados em `server/backend.py` no bloco "Registrando blueprints".
- Migration Alembic com upgrade E downgrade funcionais.
- Reaproveitar o que já existe (`ModalShell`, `Card`, `Badge`, `Skeleton`, `ConfirmDialog`, `ToastContext`, `PrivateValue`, `formatMoney`, `useFloatingTooltip`) antes de criar componente novo.
- Não quebrar nenhuma rota, campo ou resposta existente. Só adicionar.

Antes de escrever código:
1. Leia `server/db/models/portfolio.py`, `server/db/models/financials.py`, `server/db/models/__init__.py`, `server/routes/credit_cards.py` (padrão de rota + g.user_id + soft delete), `server/backend.py` (before_request e registro de blueprints), `server/alembic/versions/` (padrão de migration), `app/features/dashboard/hooks/useDashboardState.ts`, `app/features/dashboard/components/DashboardTabContent.tsx`, `app/components/ModalShell.tsx`, `app/lib/format.ts`, `app/lib/api.ts`.
2. Liste em 15 linhas o que será tocado e o que será criado.
3. Só então implemente.

Critérios de aceite (todos obrigatórios):
- Criar 2 contas com saldos iniciais diferentes, lançar entradas e saídas, ver saldo individual e consolidado corretos.
- `POST /api/transactions/transfer` gera exatamente 2 linhas com o mesmo `transfer_id` e sinais opostos, atomicamente; retorna 400 se as contas forem iguais.
- `GET /api/accounts/<id>/transactions` devolve `running_balance` correto por linha, na ordem `date, id`.
- Uma conta nunca vaza dados de outro `user_id` (teste explícito disso).
- `DELETE` é soft (`is_deleted=True`) e o saldo passa a ignorar a linha.
- Nova aba "Contas" aparece na UI, abre o detalhe da conta com extrato e permite criar/editar/excluir conta e transação.
- `pytest` verde (sem quebrar os testes existentes), `npm test` verde, `tsc --noEmit` limpo, `npm run lint` sem erro novo.
- Migration aplica e reverte.

Ao final, entregue: arquivos criados/alterados, saída de pytest/npm test/tsc, e o que ficou de fora com o risco.
```

---

## 9. O que NÃO fazer

- Não reescrever o AssetFlow em FastAPI.
- Não importar modelos do Securo "adaptando" — reimplementar.
- Não migrar SQLite → Postgres. O WAL aguenta o volume de um usuário (o Securo precisa de Postgres por causa de multi-workspace e Celery, o AssetFlow não).
- Não criar `Transaction` genérica que englobe `AssetTransaction`. São coisas diferentes: uma é caixa, a outra é posição.
- Não criar tela nova para tudo: aba existente > página nova.
- Não portar `invoices`, `fiscal`, `mortgage`, `groups`, `workspace` (ver seção 3).

---

## 10. A direção inversa (se um dia quiser um app só)

Se a duplicação de telas incomodar de verdade, o caminho **não** é trazer o
Securo para cá — é levar o que só existe aqui para lá.

**Por quê:** `server/domain/quant/` inteiro tem **1.527 linhas** de numpy/pandas,
sem acoplamento a framework. O Securo não tem uma linha de Sharpe, VaR, CVaR,
drawdown ou Monte Carlo (verificado por busca no backend dele). O motor IRPF
também não existe lá — o "fiscal" do Securo é emissão de nota, não imposto de
renda de pessoa física.

Então o balanço real é:

| Direção | O que se move | Custo |
|---|---|---|
| Securo → AssetFlow | ledger, sync, regras, orçamento, 2FA, multi-moeda (dezenas de milhares de LOC) | semanas |
| AssetFlow → Securo | `domain/quant` + rotas + 5 gráficos (poucos milhares de LOC) | dias |

**Custo escondido da direção inversa:** fork de projeto vivo. O Securo está na
0.17.0 com `renovate.json` ativo — o upstream anda e o patch do quant conflita
para sempre. É a pior manutenção possível para algo "só pra mim".

**Licença nessa direção:** limpa. O fork nasce AGPL-3.0 e continua AGPL-3.0. O
AssetFlow (sem LICENSE no repositório hoje) não é contaminado.

**Requisito técnico:** o Securo já tem `AssetTransaction` com replay de `units`,
`average_price` e cost basis (`asset_transaction_service.recompute_position`) e
já tem `providers/market_price.py`. A entrada que o motor quant precisa existe.
