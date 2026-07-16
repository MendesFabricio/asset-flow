# Roadmap de Melhorias - AssetFlow Pro

Foram analisadas as regras do `code-rules.md`, do `project-planner.md` e os anti-patterns definidos na skill de `database-design`.

## Overview
**Objetivo:** Diagnóstico arquitetural do ecossistema AssetFlow Pro e estruturação de um roadmap de evolução técnica.
**Justificativa:** O projeto cresceu com adição de IA e microsserviços. É necessário alinhar a dívida técnica (especialmente no banco de dados SQLite) e planejar futuras evoluções.

## Project Type
**WEB & BACKEND** (Full-stack React/Next.js + Python/Flask + SQLite).

## Success Criteria
- [ ] Eliminar armazenamento de JSON em colunas que demandam busca estruturada (`PortfolioSnapshot.breakdown`).
- [ ] Resolver seed de `RefundConfig` conflitante com `foreign_keys=ON`.
- [ ] Aprimorar a fonte de imagens para ativos (melhoria do Backlog original).
- [ ] Implementar verificação Phase X (Security + E2E Playwright).

## Tech Stack
- Frontend: Next.js 16, React 19, Tailwind CSS v4, Zustand, SWR.
- Backend: Flask, SQLAlchemy, Gunicorn, APScheduler.
- Database: SQLite (com WAL mode e timeout configurado).
- IA: Llama 3.2 via Ollama (Function Calling).

## File Structure (Current Base)
```text
/app         -> Interface Next.js (App Router)
/server      -> Backend Flask (API)
/database    -> Modelos e Persistência SQLite
/graphify-out-> Knowledge Graph do projeto
```

---

## Task Breakdown (Roadmap Priorizado)

### 🔴 Prioridade Crítica (P0)

#### Task 1: Normalização de Estrutura JSON (Database Design Rule)
* **Agent:** `database-architect` | **Skill:** `database-design`
* **INPUT:** Coluna `PortfolioSnapshot.breakdown` armazena JSON stringificado.
  ```python
  # [database/models.py:196-197]
  # Detalhamento do patrimônio por classe de ativo (JSON stringificado)
  breakdown = Column(String, nullable=True)
  ```
* **OUTPUT:** Criação da tabela relacional `SnapshotItem(snapshot_id, category_id, total_value, target_percent)` e script Alembic de migração dos dados históricos.
* **VERIFY:** `schema_validator.py` passa sem erros; consultas ao histórico por classe de ativo rodam direto no SQL.

#### Task 2: Correção do Seed de RefundConfig
* **Agent:** `backend-specialist` | **Skill:** `clean-code`
* **INPUT:** Raw query inserindo `id=1` em `RefundConfig` no init viola a Foreign Key de `user_id`.
  ```python
  # [database/models.py:741]
  conn.execute(text("INSERT INTO refund_configs (id, fechamento_dia, vencimento_dia) VALUES (1, 15, 20)"))
  ```
* **OUTPUT:** Refatoração do bloco de seed no `models.py` para criar o `RefundConfig` dinamicamente quando um usuário for criado (usando eventos SQLAlchemy).
* **VERIFY:** Inicialização com banco zerado gera tabelas limpas sem avisos ou `IntegrityError`.

### 🟠 Prioridade Alta (P1)

#### Task 3: Nova Fonte de Imagens para Ativos
* **Agent:** `frontend-specialist` | **Skill:** `api-patterns`
* **INPUT:** Componente acoplado a um repositório pessoal do GitHub com dados defasados, gerando 404s.
  ```tsx
  // [app/components/AssetRow.tsx:122-129]
  <Image
    src={`https://raw.githubusercontent.com/thefintz/icones-b3/main/icones/${ativo.ticker}.png`}
    alt={ativo.ticker}
    width={36}
    height={36}
    className="h-full w-full object-cover"
    onError={() => setImgError(true)}
  />
  ```
* **OUTPUT:** Integração com nova API (ex: API da B3, Yahoo Finance Logos, ou Clearbit) no `crawlers/` do backend e cacheamento seguro dessas URIs.
* **VERIFY:** Componente de ícone do ativo renderiza a imagem real ou fallback (letra inicial) sem erros HTTP 404.

#### Task 4: Isolamento de Deadlocks SQLite
* **Agent:** `backend-specialist` | **Skill:** `python-patterns`
* **INPUT:** Múltiplas funções usando session nativa que não usam o wrapper `safe_commit`, sujeitas ao erro `database is locked`.
  ```python
  # [server/routes/ai.py:155-156] (Exemplo)
  new_msg = AIChatHistory(user_id=g.user_id, session_id=session_id, role="user", content=user_message)
  session.commit()
  ```
* **OUTPUT:** Decorador global `@with_safe_commit` para automatizar o retry de `OperationalError` ("database is locked") nas rotas HTTP do Flask.
* **VERIFY:** Execução de carga de testes simultâneos (ab (Apache Bench) com concorrência > 20) não resulta em Crash.

### 🟡 Prioridade Média (P2)

#### Task 5: Proteção de N+1 na API de Portfolio
* **Agent:** `backend-specialist` | **Skill:** `database-design`
* **INPUT:** Ocorrência de N+1 disfarçada em laços Python para cálculos financeiros:
  ```python
  # [database/models.py:228-232]
  @property
  def valor_total_emprestado(self):
      from decimal import Decimal
      active_loans = [l for l in self.loans if not l.is_deleted]
      return sum(Decimal(str(l.valor_total)) for l in active_loans)
  ```
* **OUTPUT:** Ajustar as `@property` de cálculos (em `Debtor`, `ReceivableLoan`) para usar `hybrid_property` ou queries agregadas no banco (`func.sum`) ao invés de laços Python.
- [ ] **Métricas de Performance da API (APM)**: Instrumentação de telemetria das rotas principais, log de queries lentas (> 50ms) no backend.

## Histórico de Releases Recentes
- **v1.2.0:** Refatoração da camada de chamadas de API do frontend para `apiCall`, implementação de `useTransition` na tabela de busca para mitigar input lag, e implantação de detecção automática de travamento no sentiment checking.
- **v1.1.0:** Lançamento do Agente Jarvis com Function Calling ativo (integração fundamentalista CVM + métricas quantitativas de risco).
- **v1.0.0:** Lançamento da Dashboard do AssetFlow Pro com simulações de Monte Carlo e rebalanceamento de pesos patrimoniais.

#### Task 6: Implementação das Verificações Phase X
* **Agent:** `test-engineer` | **Skill:** `webapp-testing`
* **INPUT:** Repositório sem scripts robustos de validação de PR (Lighthouse/Playwright) requeridos pelo `code-rules.md`.
* **OUTPUT:** Instalação de pacote e script E2E Playwright validando login, busca sem lag (useTransition) e simulação quantitativa.
* **VERIFY:** `npm run test:e2e` ou equivalente roda em CI/CD com sucesso.

### 🟢 Prioridade Baixa (P3)

#### Task 7: Limpeza de Arquivos e Dead Code
* **Agent:** `backend-specialist` | **Skill:** `simplify-code`
* **INPUT:** Comentários antigos sobre `do_orm_execute` e logs desnecessários.
* **OUTPUT:** Remoção de código inativo, atualização do `ROADMAP.md` antigo unificando com este novo roadmap.
* **VERIFY:** `flake8` / `eslint` não apontam unused imports ou variáveis pendentes.

---

## Phase X (Final Verification Checklist)

- [ ] Security Scan (Ausência de tokens do Ollama vazados ou secrets locais).
- [ ] Schema Validator (Modelos normais alinhados às migrações Alembic).
- [ ] E2E Tests (Interface responsiva no Next.js testada pelo Playwright).
- [ ] Build & Sync (Banco SQLite inicializado, crawlers ativados).

---
## ✅ PHASE X COMPLETE
*(Pendente - Preencher após execução do Roadmap)*
