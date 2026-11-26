# Task: Otimização e remoção de código legado

**Status:** Phase 3 (Implementation, fase por fase)
**Assigned Agents:** `@orchestrator` → `@code-archaeologist`, `@backend-specialist`, `@frontend-specialist`, `@clean-code`
**Skills Active:** `@[clean-code]`, `@[simplify-code]`, `@[python-patterns]`, `@[frontend-architecture]`
**Rodadas anteriores:** `auditoria-melhorias-assetflow.md` (concluída) · `auditoria-rodada-2.md` (bugs). **Este arquivo não corrige bugs** — ele remove e consolida.

> Levantamento feito com varredura AST no backend (definições, imports, arquivos órfãos) e
> cruzamento de imports no frontend (111 módulos). Números medidos, não estimados.

---

## Regra desta rodada

**Deletar primeiro, medir depois.** A melhor otimização é a linha que não existe. Toda fase
abaixo tem saldo negativo de linhas — se um item terminar com saldo positivo, foi mal feito.

Três categorias, com tratamentos diferentes:

| Categoria | Ação |
|---|---|
| **Morto de verdade** (definição sem nenhum consumidor) | Deletar |
| **Morto em produção mas testado** (só teste chama) | **Decidir**: ligar ou deletar. Não deixar meio-vivo |
| **Duplicado** (dois lugares fazem a mesma coisa) | Consolidar em um, deletar o outro |

---

## 0. Fase 0 — Branch

**Estado verificado em 15/11:** working tree **limpo**, branch `main`, último commit `c79567c`.
As rodadas 1 e 2 já foram executadas e commitadas (`c92ed40`, `2079c08`). Nada a commitar.

```bash
git switch -c chore/remover-legado
```

Confirme com `git status` antes — se aparecer trabalho novo, commite primeiro. Deleção é
irreversível e o diff é a única testemunha.

> **Já fechado pela rodada 2 — não repetir:** `.dockerignore` (já tem `server/data/`,
> `server/tests/`, `**/__pycache__/`), CI com `pytest` (`ci-cd.yml:67`) e `npm run lint`
> (`:31`), ledger `D1/D2`, harden de auth.

---

## 1. FASE 1 — Dependências (maior ganho por minuto gasto)

| Item | Evidência | Ganho | Confiança |
|---|---|---|---|
| `@headlessui/react` | **0 ocorrências** de `headlessui` em todo `.ts/.tsx/.mjs` fora de `node_modules`. O dropdown é `useState` na mão; o `ModalShell` é próprio | 1 dependência + árvore transitiva fora do `npm ci` e da imagem | alta |
| `beautifulsoup4` (requirements) | **0** refs a `BeautifulSoup`, `read_html`, `lxml`, `html5lib` | imagem menor, install mais rápido | alta |
| `curl-cffi` (requirements) | **0** imports explícitos | ~10 MB de imagem | **média** |

> ⚠️ **`curl-cffi` merece 2 minutos de checagem antes:** o `yfinance` usa `curl_cffi` como
> backend de sessão quando disponível. Remova, rode `pytest` e dispare um `update_prices`
> manual. Se os preços continuarem vindo, era peso morto. O `beautifulsoup4` não tem esse risco.

**Aceite:** `npm ci` e `pip install -r` sem erro; `pytest` verde; uma sincronização de preços
funcionando depois de remover o `curl-cffi`.

---

## 2. FASE 2 — Código morto confirmado (backend)

Todos verificados: **uma única ocorrência no código de produção** (a própria definição).

### Deletar direto (~70 linhas)

| arquivo:linha | item | obs |
|---|---|---|
| `routes/assets.py:13` | `_paginate` | helper de paginação escrito e nunca usado |
| `services_modules/cache_helper.py:71` | `_get_cached_value` | |
| `services.py:72` | `current_username` | |
| `utils/statement_parser.py:92` | `categorize_transaction` | substituído por `categorizer_engine` |
| `utils/brokerage_note_parser.py:33` | `parse_decimal` | |
| `utils/import_shared.py:30` | `DividendCandidate` | |
| `domain/tax/annual_irpf.py:34` | `_get_start_of_time` | |
| `routes/categorize.py:9` | `CategorizeRequest` | a rota lê `request.get_json()` cru |
| `schemas.py:35,40,48` | `DebtorCreate`, `ReceivableLoanCreate`, `CorporateEventCreate` | 3 models Pydantic sem uso |

### Decidir: ligar ou deletar (~90 linhas em jogo)

Três casos em que "morto" é sintoma de funcionalidade esquecida, não de código inútil.
**Deletar sem decidir é esconder o problema:**

| arquivo:linha | item | O que está faltando | Recomendação |
|---|---|---|---|
| `db/models/system.py:74` | `prune_expired_system_cache` | A tabela `SystemCache` **cresce para sempre** (cada chave de CDI/IPCA/quant/risco fica gravada). A função que limpa existe e nunca foi chamada | **Ligar** no job diário do worker |
| `backend.py:223` | `cleanup_http_sessions` | Sessões do `utils/http_client.py` nunca são fechadas no shutdown | **Ligar** via `atexit`, ou deletar e remover o pool |
| `utils/url_validator.py` (arquivo inteiro) | `is_safe_url` | A guarda de SSRF existe, tem teste, e **nenhum código de produção a usa**. Enquanto isso `pdf_extractor.py:30-37` mantém a própria allowlist inline, diferente desta, e `cvm_processor.py:36` baixa sem limite de bytes | **Ligar** nos pontos de download e apagar a lista duplicada do `pdf_extractor` |

### Chave contada como morta e não é

`_iso_or_none` (14 refs) e `_opt_float` (28 refs) em `routes/portfolio.py:222,231` **estão vivos**.
A primeira varredura errou; a segunda corrigiu. Não toque.

**Aceite:** `pytest` 100% verde depois das deleções; `grep` das 9 funções retorna zero.

---

## 3. FASE 3 — Imports não usados (varredura mecânica)

**71 achados**, dos quais ~60 são reais. Ganho de ~60 linhas e de leitura.

Exemplos do que sair (arquivo:linha):
`backend.py:2,4,19` (`time`, `threading`, `PortfolioService`) · `routes/ai.py:2,3,6` ·
`routes/simulation.py:10,14,16,18,19,20` (6 imports de uma vez: `time`, `Asset`, `Position`,
`MODEL_NAME`, `get_genai_client`, `types`, `joinedload`, `get_daily_sector_summary`) ·
`routes/maintenance.py:4,5,6` · `routes/calendar.py:9,11` · `services_modules/backup.py:7,9,10,12` ·
`services_modules/dashboard.py:5,6,12` · `routes/refunds/payments.py:3` · `routes/refunds/loans.py:7`

### ⚠️ NÃO são imports mortos — falsos positivos que a varredura não distingue

| Arquivo | Motivo |
|---|---|
| `db/models.py:12` | **Re-export deliberado** — `from db.models import Session, engine, get_active_positions, ...` é a API pública do pacote usada por todo mundo |
| `routes/refunds/__init__.py:5` | `from . import utils, config, debtors...` registra blueprints por **efeito colateral** |
| `app/features/header/components/Header/index.ts` | Barrel de 1 linha com 1 consumidor real |

**Aceite:** `python -c "import backend"` dentro do container sobe sem erro, `pytest` verde,
`npm run build` completa.

---

## 4. FASE 4 — Frontend: exports órfãos e consolidação

O frontend está mais limpo do que o esperado: **nenhum arquivo inteiro órfão** em 111 módulos.
O ganho real é ~170 linhas + uma dependência.

### Deletar (baixo risco, ~117 linhas)

| arquivo:linha | item | linhas |
|---|---|---|
| `app/components/ui/Skeletons.tsx:44-67` | `TableSkeleton` — zero refs, e o `SkeletonLoading` (:203-264) **copia as mesmas linhas** (241-259 ≡ 46-65) | ~24 |
| `app/components/ui/Skeletons.tsx:286-309` | `HeatmapSkeleton` — zero refs (`Correlation`, `MonteCarlo` e `MetricsGrid` **são** usados) | ~24 |
| `app/context/ToastContext.tsx:104` | `useToastNotify` — existe `useToast` e é ele que os 8 consumidores usam | ~12 |
| `app/types/index.ts` | 9 tipos mortos: `KellyItem`, `KellyData`, `AlphaAttributionItem`, `RebalanceBandItem`, `DCASimulationHistoryItem`, `CloudPoint`, `SharpeRollingData`, `MomentumItem`, `MomentumRankingData` | 53 |
| `app/lib/chartPalette.ts:45` | `CHART_COLORS` — o arquivo é usado, mas só `useChartPalette`; este array nunca aparece | 1 |
| `app/components/AssetsTable.tsx:14` | prop `onRefresh` — declarada, nunca passada nem lida | 1 |
| `AssetTooltip` | prop `variacaoPct` — idem | 1 |
| `ToolsMenu` | prop `onOpenAddModal` — idem (quem abre o modal é o `Header`) | 1 |

### Consolidar — este é o item de maior valor da rodada

**4.1 `maskMoney` reimplementado 5×, e o `PrivateValue` já existe**

`SmartAllocationModal.tsx:153` · `PerformanceAttributionChart.tsx:78` · `ReturnsKpiCards.tsx:60` ·
`MacroStressTestCard.tsx:49` · `TaxSellSimulatorCard.tsx:94` — todas a mesma linha
`isHidden ? 'R$ •••••' : formatMoney(v)`.

Pior que a duplicação: a **máscara diverge**. `PrivateValue` (usado por 9 telas) usa `'••••••'`;
as 5 cópias usam `'R$ •••••'`. Hoje o app tem duas aparências diferentes para "valor oculto".

→ Usar `PrivateValue` nos 5. Ganho: ~15 linhas e uma máscara única.

**4.2 Sete tooltips de gráfico hardcodam `#0f172a` e quebram o tema claro**

`CreditCardCategoryChart.tsx:46` · `ReceivablesTab.tsx:719,749` · `PerformanceAttributionChart.tsx:173` ·
`MonteCarloChart.tsx:144` · `QuantDashboard.tsx:148,732`.

O `useChartPalette` (`app/lib/chartPalette.ts:14`) existe exatamente para isso e é usado por
apenas 3 arquivos. Trocar os 7 objetos literais pelo hook: ~35 linhas a menos **e conserta o
tooltip escuro no modo claro** — esses 5 gráficos são a exceção que ainda não respeita o tema.

**Aceite:** `npm run build` + `npx tsc --noEmit` limpos; **conferir visualmente o modo claro**
nos 5 gráficos (é o único item que muda aparência).

---

## 5. FASE 5 — Peso da imagem (já corrigido — só medir)

O `.dockerignore` já foi ajustado na rodada 2 e hoje exclui `server/data/`, `server/tests/` e
`**/__pycache__/`. **Não há nada a deletar aqui.** O que falta é medir o resultado e fechar a
conta das dependências da Fase 1:

```bash
docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | Select-String assetflow
```

Imagem relatada antes do ajuste: 336 MB de conteúdo / ~1,1 GB em disco. Com o `cvm_cache` fora
(−70,7 MB) e `beautifulsoup4` + `curl-cffi` fora (−~11 MB), o esperado é abaixo de 260 MB.
Se não baixar, a causa é cache de layer: rebuild com `--no-cache` uma vez para confirmar.

### Otimização nova (1 linha, sem deleção)

Adicionar `PRAGMA optimize` no job diário do worker. O banco só cresce (snapshot diário + cache
de quant/risco) e as estatísticas do query planner nunca são atualizadas. Diferente de `VACUUM`,
é rápido e seguro de rodar em produção.

> Não rode `VACUUM` no SQLite em uso: ele reescreve o arquivo inteiro e trava escritas.

---

## 6. FASE 6 — Legado estrutural e artefatos

### Decidir (não fazer sem aprovação do Fabricio)

| Item | Tamanho | Risco | Recomendação |
|---|---|---|---|
| **`services.py` (122 linhas) + `services_modules/facades.py` (160 linhas) de indireção** | 282 linhas | médio — ~60 call sites | `facades.py` é importado **só** por `services.py:23`. O caminho é `routes → services → facades → módulos`. Duas camadas para o mesmo destino. **Deletar as duas e apontar as rotas para `services_modules.*`** é a maior limpeza estrutural disponível. Fazer em PR próprio, arquivo por arquivo, com `pytest` entre cada um |
| **`app/components/` (11 arquivos) convivendo com `app/features/`** | 11 arquivos | médio-baixo | Duas organizações na mesma pasta. Não migrar agora: só valerá a pena quando um desses componentes for editado de verdade. Regra no `AGENTS.md`: componente novo nasce em `features/` |
| `.agents/` — 205 arquivos / 1,3 MB, incluindo `game-development`, `rust-pro`, `mobile-design`, `red-team-tactics` | 1,3 MB | baixo | Se o Argon não usa, poda os domínios irrelevantes para um app de finanças pessoais. **Decisão sua** — é seu kit de orquestração |

### Deletar direto

| Item | Evidência |
|---|---|
| `sentry.client.config.ts` + `sentry.server.config.ts` | Sentry v10 + Next 16 inicializa por `instrumentation.ts`, e **não existe** `instrumentation.ts` no projeto. Os dois arquivos são no-op. **Confiança média**: validar com um erro proposital e ver se o Sentry recebe |
| `.env.local` (2 linhas) | `BASIC_AUTH_USER/PASSWORD` — **zero** referências no repo. Credenciais mortas |
| `docker-compose.yml` (10 linhas) | Só um `include:` do dev compose. O `-f` explícito resolve; o arquivo é indireção |
| `server/alembic/README` (39 bytes) | Boilerplate do `alembic init` |
| `// Force Next.js rebuild` | `app/api/ai/chat/route.ts:3` · `app/api/auth/login/route.ts:2` · `app/api/sync/stream/route.ts:3` |
| `server/db/lock.py` (arquivo) | Per backend-audit: `DistributedLock` é instanciado em `backend.py:57` e **nunca adquirido**; o `release()` faz `unlink` incondicional. Código morto que vira perigoso se alguém ligar. Deletar ou documentar |
| `server/db/lock.py:2` | Comentário aponta para `database/lock.py`, diretório que não existe — resquício do layout antigo |
| `app/README.md` · `server/README.md` · `server/db/README.md` | 3 READMEs internos (6,2 KB) duplicando o raiz. O raiz **já ficou desatualizado uma vez** nesta série. Consolidar em um |
| Tab id `'Financeiro'` | `app/page.tsx:162` e `DashboardTabContent.tsx:125` mantêm o id antigo como alias de `'Reembolsos'`. Nenhum bookmark usa isso (a URL por aba nasceu depois). Deletar as 3 referências |

---

## 7. Saldo esperado da rodada

| Fase | Linhas | Outros |
|---|---|---|
| 1 — Dependências | — | 2–3 deps fora |
| 2 — Backend morto | ~70 | 9 funções/modelos |
| 3 — Imports não usados | ~60 | |
| 4 — Frontend | ~170 | `@headlessui` fora, máscara única, tema claro correto |
| 5 — Imagem | — | −90 MB |
| 6 — Artefatos | ~50 | 4 arquivos fora |

**≈ 350 linhas a menos de código vivo, 3 dependências, 4 arquivos, ~90 MB.**

---

## 8. Ordem e Definition of Done

```
F0 commit  →  F1 deps  →  F2 backend morto  →  F3 imports  →  F4 frontend  →  F5 imagem  →  F6 artefatos
```

F1 e F3 são de baixo risco e alto volume: comece por elas para criar confiança.
F4.2 é o único item que muda aparência — exige olhada no modo claro.
F6 estrutural (services/facades) é PR separado e opcional.

- [ ] `python -m pytest` verde (instalar `pytest` no `.venv` — hoje só roda no container).
- [ ] `npm test` verde · `npm run lint` sem erro novo · `npx tsc --noEmit` limpo · `npm run build` completa.
- [ ] Nenhum arquivo deletado que o Next/Alembic/flask monte por convenção (`page.tsx`, `route.ts`, `layout.tsx`, `error.tsx`, `not-found.tsx`, migrations).
- [ ] Nenhuma deleção sem `git grep` do nome confirmando zero consumidores.
- [ ] README consolidado menciona a estrutura real.

---

## 9. Prompt para o Argon (copiar e colar)

> Rode uma fase por vez. A ordem importa: deps e imports primeiro criam confiança para mexer no resto.

```
Leia `.agents/tasks/otimizacao-e-limpeza.md` e execute a Fase 0 e depois APENAS as Fases 1 e 3 (dependências não usadas + imports não usados).

Contexto obrigatório:
- Projeto: C:\Users\Fabricio\Projetos\asset-flow (Flask 3 + SQLite + SQLAlchemy 2 + Alembic + Next 16/React 19).
- Esta task é de REMOÇÃO. O objetivo é saldo negativo de linhas. Não adicione abstração, opção ou dependência.
- Os achados foram levantados com varredura AST e têm arquivo:linha. Se um item não bater ao conferir, reporte e pule.

Fase 0 (bloqueante):
- `git status`. Se houver trabalho não commitado, commite como checkpoint e crie a branch `chore/remover-legado`.

Fase 1 — dependências:
- Remover `@headlessui/react` do package.json (0 imports). Rodar `npm ci && npm run build`.
- Remover `beautifulsoup4` do server/requirements.txt (0 refs a BeautifulSoup/read_html/lxml).
- `curl-cffi`: NÃO remover direto. Primeiro confira se o yfinance usa o backend curl_cffi (grep em node_modules não vale — confira a documentação da versão instalada). Se usar, deixe e reporte. Se não usar, remova, e valide com um `update_prices` manual que os preços continuam vindo.

Fase 3 — imports não usados:
- A varredura encontrou 71; cerca de 60 são reais. Remova os reais.
- NÃO remova estes (são re-export ou efeito colateral, a varredura erra neles):
  `server/db/models.py:12` (re-export da API pública do pacote),
  `server/routes/refunds/__init__.py:5` (registra blueprints por side effect),
  `app/features/header/components/Header/index.ts`.
- NÃO remova `_iso_or_none` nem `_opt_float` de `routes/portfolio.py` — a primeira varredura errou, eles têm 14 e 28 usos.

Critérios de aceite:
- `git grep` de cada símbolo removido retorna zero no código de produção.
- `python -m pytest` verde (100 testes).
- `npm test` verde, `npx tsc --noEmit` limpo, `npm run build` completa.
- `pip install -r server/requirements.txt` sem erro e `python -c "import backend"` dentro do container sobe.
- O diff tem mais linhas removidas do que adicionadas. Se não tiver, algo saiu errado — reporte.

Ao final, entregue: linhas adicionadas vs removidas (`git diff --stat`), arquivos tocados, saída dos testes, e o que ficou de fora com o motivo.
```

---

## 10. O que NÃO fazer

- **Não deletar nada de `app/*/page.tsx`, `route.ts`, `layout.tsx`, `error.tsx`, `not-found.tsx` nem migrations** — o Next e o Alembic montam por convenção, não por import.
- **Não remover `geist`, `lucide-react`, `recharts`, `swr`, `zustand`, `@tanstack/react-virtual` nem `@sentry/nextjs`** — todos verificados em uso real (`ErrorBoundary.tsx:29` chama `Sentry.captureException` de verdade; a nota anterior de que não reportava está desatualizada).
- **Não colapsar `services.py`/`facades.py` junto com as deleções simples.** É a maior mudança estrutural da lista e merece PR próprio.
- **Não rodar `VACUUM` no SQLite de produção** para "otimizar". Só `PRAGMA optimize`, no worker.
- **Não "consolidar" os 3 READMEs internos apagando conteúdo** — traga o que for único para o README raiz antes.
- **Não otimizar o que já está certo:** `next/dynamic`, `optimizePackageImports`, `output: "standalone"`, os pragmas do SQLite, o `api.ts` (o `requestCache` é dedupe em voo) e o motor quant.
