# PLANO DE OTIMIZAÇÃO — Parte 2: Tarefas P2 (detalhamento)

Detalhamento das tarefas de **Prioridade P2 (Melhorias)**. O índice/checklist está em `PLANO_DE_OTIMIZACAO.md`; P0/P1 em `PARTE_1`.

---

## P2-1 — Remover dependência `zod` (frontend)

- **Título:** Remover `zod` do package.json (nunca usado)
- **Prioridade:** P2
- **Categoria:** Dependências / Frontend
- **Impacto esperado:** Redução do lockfile/install; elimina dependência morta.
- **Motivo:** Nenhum arquivo em `app/` importa `zod` (validação é feita manualmente).
- **Arquivos envolvidos:** `package.json`
- **Funções/classes/componentes afetados:** N/A (declaração de dependência)
- **O que deve ser modificado:** Remover `"zod"` de `dependencies`.
- **Como deve ser modificado:** Editar `package.json` removendo a linha; rodar `npm install` para atualizar `package-lock.json`.
- **O que pode ser removido:** `"zod": "^3.24.1"`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo — nenhum uso confirmado por grep.
- **Validação:** `npm run build` e `npm run lint` sem erros; grep por `from 'zod'` vazio.
- **Dependências:** Nenhuma.

---

## P2-2 — Remover dependência `python-dotenv` (backend)

- **Título:** Remover `python-dotenv` do requirements.txt (nunca usado)
- **Prioridade:** P2
- **Categoria:** Dependências / Backend
- **Impacto esperado:** Imagem menor e reprodutível; remove dep morta.
- **Motivo:** Nenhum `load_dotenv`/`dotenv` no repositório; variáveis vêm de ambiente/compose.
- **Arquivos envolvidos:** `server/requirements.txt`
- **Funções/classes/componentes afetados:** N/A
- **O que deve ser modificado:** Remover `python-dotenv`.
- **Como deve ser modificado:** Remover a linha do `requirements.txt`; reconstruir imagem.
- **O que pode ser removido:** `python-dotenv`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** App sobe normalmente; grep por `dotenv` vazio.
- **Dependências:** Nenhuma.

---

## P2-3 — Remover imports não utilizados (frontend)

- **Título:** Limpar imports mortos em page/QuantDashboard/agenda/SystemStatus
- **Prioridade:** P2
- **Categoria:** Código Morto / Frontend
- **Impacto esperado:** Código mais limpo; lint sem warnings.
- **Motivo:** Imports nunca referenciados após a importação.
- **Arquivos envolvidos:** `app/page.tsx:6-8`, `app/components/QuantDashboard.tsx:3,37`, `app/agenda/page.tsx:13-18`, `app/components/Header/SystemStatus.tsx:7`
- **Funções/classes/componentes afetados:** `PlusCircle, Calendar, Eye, EyeOff, Search` (page); `useMemo, RotateCcw` (QuantDashboard); `Sliders, AlertTriangle, Info, HelpCircle` (agenda); `RefreshCw, Layers` (SystemStatus)
- **O que deve ser modificado:** Remover os símbolos não usados das linhas de import.
- **Como deve ser modificado:** Editar cada import deixando apenas os símbolos efetivamente usados.
- **O que pode ser removido:** Os símbolos citados.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** `npm run lint` limpo; build ok.
- **Dependências:** Nenhuma.

---

## P2-4 — Remover variants/interfaces mortos (Card/Badge/AllocationItem)

- **Título:** Remover variant `dashed` (Card), `amber` (Badge) e interface `AllocationItem`
- **Prioridade:** P2
- **Categoria:** Código Morto / Frontend
- **Impacto esperado:** Remove membros de tipo nunca instanciados.
- **Motivo:** `ui/Card.tsx:6` variant `dashed` nunca passado; `ui/Badge.tsx:3` variant `amber` nunca passado; `SmartAllocationModal.tsx:33` `AllocationItem` nunca usada.
- **Arquivos envolvidos:** `app/components/ui/Card.tsx`, `app/components/ui/Badge.tsx`, `app/components/SmartAllocationModal.tsx`
- **Funções/classes/componentes afetados:** `CardProps.variant`, `BadgeProps.variant`, `interface AllocationItem`
- **O que deve ser modificado:** Remover as variantes/membro mortos.
- **Como deve ser modificado:** Editar uniões de variant e a interface.
- **O que pode ser removido:** `'dashed'`, `'amber'`, `AllocationItem`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** `npm run lint`/`build` ok; grep por `dashed`/`amber`/`AllocationItem` vazio em usos.
- **Dependências:** Nenhuma.

---

## P2-5 — Memoizar Header + handlers + selectors do store

- **Título:** `React.memo` no Header, `useCallback` nos handlers e seletores no `useModalStore`
- **Prioridade:** P2
- **Categoria:** Performance / Frontend
- **Impacto esperado:** Reduz re-renders da árvore Header (9 componentes com SWR/setInterval) a cada render de `Home`.
- **Motivo:** `Header` não memoizado; ~13 handlers inline em `page.tsx:241-257`; `useModalStore()` sem selector re-renderiza `Home` em qualquer mudança.
- **Arquivos envolvidos:** `app/components/Header/Header.tsx`, `app/page.tsx`, `app/store/modalStore.ts`
- **Localização exata:** `Header.tsx:19,37` (prop `money` é uma função recriada a cada render de `Home`); handlers `onOpenSmartModal`/`onOpenAddModal`/etc definidos inline em `app/page.tsx` (próximo a `:241-257`); `modalStore.ts:20` `useModalStore` sem seletor (quem chama `useModalStore()` recebe o estado inteiro).
- **Funções/classes/componentes afetados:** componente `Header`; handlers `onOpenSmartModal` etc; hook `useModalStore`
- **O que deve ser modificado:** Envolver `Header` em `React.memo`; criar handlers com `useCallback`; usar seletores de campo no store.
- **Como deve ser modificado:** Envolver `Header` em `React.memo`; criar handlers com `useCallback`; usar seletores de campo no store.

  ```tsx
  // Header.tsx
  export default React.memo(Header);

  // page.tsx (em vez de onOpenSmartModal={() => setSmartModalOpen(true)})
  const onOpenSmartModal = useCallback(() => setSmartModalOpen(true), []);
  const money = useCallback((v: number) => formatMoney(v), []); // se formatMoney for estável

  // qualquer componente que usa o store
  const isAddModalOpen = useModalStore((s) => s.isAddModalOpen);
  ```

  **Nota:** `React.memo(Header)` só evita re-render se as props forem estáveis — por isso os handlers/`money` precisam de `useCallback`. Props primitivas (`total`, `loading`, `isRefetching`) já são estáveis.
- **O que pode ser removido:** Handlers inline recriados.
- **O que pode ser simplificado:** Estado de UI mais estável.
- **Risco:** Baixo-Médio (verificar que memo não quebra atualizações de props reais).
- **Validação:** Abrir React DevTools Profiler; confirmar que editar/alternar tabs não re-renderiza Header sem motivo.
- **Dependências:** Nenhuma.

---

## P2-6 — Corrigir classes Tailwind dinâmicas (EditModal/StatCard)

- **Título:** Substituir classes Tailwind dinâmicas por mapas estáticos
- **Prioridade:** P2
- **Categoria:** Frontend / Bug
- **Impacto esperado:** Corrige estilos que hoje NÃO são gerados pelo JIT (campos de cor quebrados).
- **Motivo:** `EditModal.tsx:31,35,48` montam classes com interpolação (`` ring-${color}-500/50 ``, `` text-${color}-500 ``, `` bg-${color}-500/10 ``) em runtime; `StatCard.tsx:72` deriva classes com `colorClass.replace('text','bg').replace('400','500')`. Tailwind v4 JIT só gera classes que aparecem literalmente no source → essas não são geradas → estilo ausente (anel/realce de cor quebrado).
- **Arquivos envolvidos:** `app/components/EditModal.tsx`, `app/components/StatCard.tsx`
- **Localização exata:** `EditModal.tsx:31` (`focus-within:ring-${color}-500/50`), `:35` e `:48` (`text-${color}-500`, `bg-${color}-500/10`); `StatCard.tsx:72` (`colorClass.replace(...)`). Em `EditModal`, `color` default é `"blue"` (`:28`).
- **Funções/classes/componentes afetados:** `InputControl` (EditModal), lógica de `colorClass` (StatCard)
- **O que deve ser modificado:** Mapear `color`/`colorClass` para strings de classe estáticas conhecidas (ou safelist no `postcss.config.mjs`/Tailwind).
- **Como deve ser modificado:** Criar mapa estático e usar a classe pré-montada:

  ```tsx
  // EditModal.tsx
  const COLOR_CLASSES: Record<string, string> = {
    blue:   'focus-within:ring-blue-500/50 text-blue-500 hover:bg-blue-500/10',
    emerald:'focus-within:ring-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10',
    // ... demais cores usadas
  };
  // uso: className={`... ${COLOR_CLASSES[color] ?? COLOR_CLASSES.blue} ...`}

  // StatCard.tsx
  const BADGE_CLASSES: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-200',
    // ...
  };
  ```

  Alternativa: adicionar as classes dinâmicas ao `safelist` do Tailwind, mas o mapa estático é preferível (menor bundle, sem risco de esquecer cor).
- **O que pode ser removido:** Interpolação de classe dinâmica.
- **O que pode ser simplificado:** Um mapa de cores reutilizável.
- **Risco:** Baixo.
- **Validação:** Abrir modal de edição e verificar que os controles têm cor/anel corretos; build ok.
- **Dependências:** Nenhuma.

---

## P2-7 — Extrair componente `PrivateValue`

- **Título:** Unificar `PrivateValue` duplicado em 3 componentes
- **Prioridade:** P2
- **Categoria:** Código Morto / Frontend
- **Impacto esperado:** Remove 3 cópias idênticas do sub-componente de blur de valor privado.
- **Motivo:** `AssetRow.tsx:29`, `CategorySummary.tsx:137`, `ReportModal.tsx:51` definem o mesmo `PrivateValue`.
- **Arquivos envolvidos:** `app/components/AssetRow.tsx`, `app/components/CategorySummary.tsx`, `app/components/ReportModal.tsx`, (novo) `app/components/ui/PrivateValue.tsx`
- **Funções/classes/componentes afetados:** `PrivateValue` (3x)
- **O que deve ser modificado:** Criar `ui/PrivateValue.tsx` e importar nos 3.
- **Como deve ser modificado:** Mover a implementação para o novo arquivo; remover as 3 locais.
- **O que pode ser removido:** 2 definições duplicadas.
- **O que pode ser simplificado:** Um componente de valor privado.
- **Risco:** Baixo.
- **Validação:** Toggle de privacidade funciona igual nos 3 locais; lint/build ok.
- **Dependências:** Nenhuma.

---

## P2-8 — Consolidar `fetch` manual no `apiCall`

- **Título:** Usar `apiClient.apiCall` nos componentes que reimplementam fetch
- **Prioridade:** P2
- **Categoria:** Código Morto / Frontend
- **Impacto esperado:** Remove duplicação de tratamento de erro/timeout; formato de erro consistente.
- **Motivo:** `CreditCardsTab`, `ReceivablesTab`, `MarketTicker` usam `fetch`+`res.ok` manual em vez do helper `utils/apiClient.ts`.
- **Arquivos envolvidos:** `app/components/CreditCardsTab.tsx`, `app/components/ReceivablesTab.tsx`, `app/components/Header/MarketTicker.tsx`, `app/utils/apiClient.ts`
- **Funções/classes/componentes afetados:** funções de chamada HTTP nesses componentes; `apiCall`
- **O que deve ser modificado:** Substituir blocos `fetch` por `apiCall(...)`.
- **Como deve ser modificado:** `const data = await apiCall('/api/credit-cards', { method: 'POST', body })` e tratar erro centralizado. (Streaming do Jarvis/MonteCarlo permanece com fetch direto.)
- **O que pode ser removido:** Blocos `fetch`/`res.ok` repetidos.
- **O que pode ser simplificado:** Uma utilidade de API.
- **Risco:** Baixo.
- **Validação:** Funcionalidades de cartão/recebíveis funcionam; erros aparecem consistentes.
- **Dependências:** Nenhuma.

---

## P2-9 — Otimizar Docker (dockerignore, npm ci, healthchecks, requirements pinados)

- **Título:** Melhorar Dockerfile/compose: .dockerignore, `npm ci`, healthchecks, pinar deps
- **Prioridade:** P2
- **Categoria:** Docker
- **Impacto esperado:** Imagens menores e reprodutíveis; build não redundante; operabilidade (healthchecks).
- **Motivo:** `Dockerfile:18` `COPY . .` + `.dockerignore` incompleto (backend vai p/ imagem frontend); compose refaz `npm run build` no start (frontend `command` em `docker-compose.yml:71`); `requirements.txt` sem pin; sem healthchecks em nenhum serviço.
- **Arquivos envolvidos:** `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `server/requirements.txt`, `server/Dockerfile`
- **Localização exata (compose):** backend env `docker-compose.yml:17-22` (sem `SECRET_KEY` — ver P0-4); `extra_hosts` `:22-23`; worker `depends_on: backend` `:51-52`; frontend `volumes: .:/app` `:69` + `command: npm run build && npm start` `:71`; ausência de `healthcheck:` em todos os 4 serviços.
- **Funções/classes/componentes afetados:** estágios de build; serviços backend/worker/frontend/ollama
- **O que deve ser modificado:** Completar `.dockerignore`; trocar `npm install`→`npm ci`; remover build redundante no compose (usar imagem); adicionar healthchecks; pinar requirements.
- **Como deve ser modificado:** `.dockerignore` adicionar `server/`, `database/`, `docker/`, `utils/`, `.env.local`, `*.tsbuildinfo`, `README.md`, `ROADMAP.md`. `Dockerfile` usar `npm ci`. Compose: remover `npm run build &&` do command ou usar `:ro` apenas. Adicionar `healthcheck` (curl `/api/health` p/ backend; `curl -f http://localhost:3000` p/ frontend; `ollama` `curl -f http://localhost:11434`). `requirements.txt`: fixar versões.
- **O que pode ser removido:** `COPY . .` não filtrado; build redundante no start.
- **O que pode ser simplificar:** Pipeline de build mais enxuto.
- **Risco:** Médio (exige testar subida completa do compose após mudanças).
- **Validação:** `docker compose build` sem copiar backend p/ frontend; `docker compose up` sobe e healthchecks ficam healthy; build determinístico.
- **Dependências:** Nenhuma.

---

## P2-10 — Corrigir migrações Alembic (ghost `receivables` + ALTER programático)

- **Título:** Tornar migrações consistentes e mover ALTER programático p/ Alembic
- **Prioridade:** P2
- **Categoria:** Banco de Dados / Arquitetura / Backend
- **Impacto esperado:** Esquema reprodutível; evita drift/silent failure entre ambientes.
- **Motivo:** `initial_schema` referencia `receivables` já dropada; `backend.py:614-709` faz `ALTER TABLE` (colunas de AI, migração price_alerts) fora do Alembic.
- **Arquivos envolvidos:** `server/alembic/versions/9d180fb19a1b_initial_schema.py`, `server/backend.py`, (novas) migrations em `server/alembic/versions/`
- **Funções/classes/componentes afetados:** `init_db()` (backend.py:568-709); migrations
- **O que deve ser modificado:** Limpar referências a `receivables` na `initial_schema`; criar migration(s) para as colunas AI e `price_alerts` atualmente feitas em `init_db`.
- **Como deve ser modificado:** Remover `op.alter_column`/`op.create_index` de `receivables` da `initial_schema`; adicionar nova migration `add_ai_columns_and_price_alerts` com `op.add_column`/criação de tabela; remover o bloco programático de `init_db` (manter apenas `create_all` para dev ou remover conforme P2-11).
- **O que pode ser removido:** Bloco ALTER programático em `init_db`; referências `receivables`.
- **O que pode ser simplificado:** Uma única fonte de schema (Alebic).
- **Risco:** Médio (exige testar fresh DB e upgrade/downgrade).
- **Validação:** `alembic upgrade head` em DB vazio cria esquema completo; `alembic downgrade base` funciona; app sobe sem erro de índice duplicado.
- **Dependências:** Relacionada a P2-11 e P1-5 (índices).

---

## P2-11 — Remover `create_all` antes do Alembic (ou idempotente)

- **Título:** Evitar `Base.metadata.create_all` antes das migrations
- **Prioridade:** P2
- **Categoria:** Banco de Dados / Arquitetura / Backend
- **Impacto esperado:** Evita criação de índice duplicado silenciado e drift de migration.
- **Motivo:** `backend.py:568` `create_all` cria tabelas/índices; depois `alembic upgrade head` tenta recriar índices → `OperationalError` engolido.
- **Arquivos envolvidos:** `server/backend.py`
- **Funções/classes/componentes afetados:** `init_db()` (linhas ~568-589)
- **O que deve ser modificado:** Remover `create_all` (confiar em Alembic) OU torná-lo idempotente para dev.
- **Como deve ser modificado:** Remover `Base.metadata.create_all(engine)`; deixar Alembic como única fonte. Em dev sem migrations, pode manter `create_all` condicional a flag.
- **O que pode ser removido:** `create_all` (em produção).
- **O que pode ser simplificado:** Bootstrap de DB mais simples.
- **Risco:** Médio (DB existente deve já ter migrations aplicadas).
- **Validação:** Subir app em DB novo via só Alembic → schema completo; sem warnings de índice.
- **Dependências:** Depende de P2-10.

---

## P2-12 — Substituir `print()` por `logging`

- **Título:** Migrar `print` em produção para `logging`
- **Prioridade:** P2
- **Categoria:** Backend / Código Morto
- **Impacto esperado:** Logs estruturados; sem vazamento de PII em stdout não rotacionado.
- **Motivo:** `fii_processor.py:146`, `cvm_finder.py:21/25/46`, `cnpj_finder.py:21/25` usam `print`.
- **Arquivos envolvidos:** `server/utils/fii_processor.py`, `server/utils/cvm_finder.py`, `server/utils/cnpj_finder.py`
- **Funções/classes/componentes afetados:** pontos de `print` citados
- **O que deve ser modificado:** Trocar `print(...)` por `logging.info/warning/error`.
- **Como deve ser modificado:** `import logging`; `logging.warning(f"Erro parser FII: {e}")` etc.
- **O que pode ser removido:** chamadas `print`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** Rodar crawler; verificar logs via handler de logging, não stdout solto.
- **Dependências:** Nenhuma.

---

## P2-13 — Remover `time.sleep()` bloqueante

- **Título:** Eliminar `time.sleep` em código de produção
- **Prioridade:** P2
- **Categoria:** Performance / Backend
- **Impacto esperado:** Threads do Gunicorn não ficam bloqueadas artificialmente.
- **Motivo:** `backend.py:228/238`, `dashboard.py:46`, `market_data.py:330` dormem a thread. (`sync_stream.py:66` também tem `time.sleep(1.0)`, mas esse é o intervalo intencional de poll do SSE — ver P3-6, NÃO remover.)
- **Localização exata:** `server/backend.py:228`, `server/backend.py:238`, `server/services_modules/dashboard.py:46`, `server/infrastructure/market_data.py:330`
- **Arquivos envolvidos:** `server/backend.py`, `server/services_modules/dashboard.py`, `server/infrastructure/market_data.py` (e `server/routes/sync_stream.py` apenas para P3-6)
- **Funções/classes/componentes afetados:** funções de sync/fundamentals/update
- **O que deve ser modificado:** Remover sleeps ou mover para fila/background.
- **Como deve ser modificado:** Remover `time.sleep(5)` onde for apenas espera artificial; no crawler, reduzir/remover `sleep(0.5)` ou usar backoff.
- **O que pode ser removido:** `time.sleep` desnecessários.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** Endpoints retornam sem espera artificial; crawlers continuam funcionando.
- **Dependências:** Nenhuma.

---

## P2-14 — Remover imports mortos (backend)

- **Título:** Limpar imports não utilizados nos módulos backend
- **Prioridade:** P2
- **Categoria:** Código Morto / Backend
- **Impacto esperado:** Lint limpo; menos confusão.
- **Motivo:** `optimization.py:4` `import json`; `exposure.py:2` `Category`; `cache_helper.py:5` `Decimal`; `cvm_enet.py` imports duplicados (linhas 1-6) + `import re` dentro do loop (linha 119); `alerts_price.py:20` `sys.path.append('../..')` (caminho que sai do projeto). **Atenção:** os demais `sys.path.append(os.path.join(os.path.dirname(__file__), '..'))` em `quant_analysis.py:9`, `assets.py:9`, `dashboard.py:10`, `alerts_price.py:19` apontam corretamente para a raiz do `server/` e são legítimos (anti-pattern, mas funcionais) — NÃO remover.
- **Arquivos envolvidos:** `server/domain/quant/optimization.py`, `server/domain/quant/exposure.py`, `server/services_modules/cache_helper.py`, `server/crawlers/cvm_enet.py`, `server/routes/alerts_price.py`
- **Localização exata:** `optimization.py:4`; `exposure.py:2`; `cache_helper.py:5`; `cvm_enet.py:1-6` (dup) e `cvm_enet.py:119` (`import re` no loop); `alerts_price.py:20` (`sys.path.append('../..')`)
- **Funções/classes/componentes afetados:** imports citados
- **O que deve ser modificado:** Remover imports não usados / duplicados; mover `import re` para topo.
- **Como deve ser modificado:** Editar linhas de import conforme citado.
- **O que pode ser removido:** `json`, `Category`, `Decimal`, duplicatas, `sys.path.append('../..')`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** `python -m pyflakes`/lint limpo; app sobe.
- **Dependências:** Nenhuma.

---

## P2-15 — Remover `Modelfile` e `docker/README.md`

- **Título:** Excluir arquivos de configuração mortos
- **Prioridade:** P2
- **Categoria:** Código Morto / Docker
- **Impacto esperado:** Menos ruído; remove config não referenciado.
- **Motivo:** `Modelfile` define modelo nunca usado (compose usa `llama3.2:3b`); `docker/` só tem README não referenciado.
- **Arquivos envolvidos:** `Modelfile`, `docker/README.md`, `docker/` (dir)
- **Funções/classes/componentes afetados:** N/A
- **O que deve ser modificado:** Remover os arquivos (ou integrar `Modelfile` ao compose se desejado).
- **Como deve ser modificado:** `git rm Modelfile docker/README.md`; remover `docker/` se vazio.
- **O que pode ser removido:** `Modelfile`, `docker/`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** Compose sobe normalmente; grep por `Modelfile`/`docker/README` vazio.
- **Dependências:** Nenhuma.

---

## P2-16 — Revisar dependências questionáveis (`lxml`, `baseline-browser-mapping`)

- **Título:** Avaliar remoção de `lxml` e `baseline-browser-mapping`
- **Prioridade:** P2
- **Categoria:** Dependências
- **Impacto esperado:** Lockfile/imagem menores.
- **Motivo:** `lxml` sem imports diretos (transitivo); `baseline-browser-mapping` devDep auto-injetada pelo Next 16.
- **Arquivos envolvidos:** `server/requirements.txt`, `package.json`
- **Funções/classes/componentes afetados:** N/A
- **O que deve ser modificado:** Remover `lxml` se nenhum uso direto confirmado; confirmar se `baseline-browser-mapping` é exigida pelo toolchain.
- **Como deve ser modificado:** Testar build sem `lxml`; verificar se Tailwind/PostCSS quebra sem `baseline-browser-mapping` antes de remover.
- **O que pode ser removido:** `lxml` (provável), `baseline-browser-mapping` (confirmar).
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo-Médio (remover sem confirmar pode quebrar build).
- **Validação:** Build frontend e backend ok após remoção.
- **Dependências:** Nenhuma.

---

## P2-17 — `npm dedupe` / lockfile duplicado

- **Título:** Deduplicar versões no lockfile Node
- **Prioridade:** P2
- **Categoria:** Dependências / Frontend
- **Impacto esperado:** Menos duplicatas de pacotes transitivos (eslint toolchain).
- **Motivo:** 13 pacotes com 2 versões no `package-lock.json` (transitivos do eslint).
- **Arquivos envolvidos:** `package-lock.json`
- **Funções/classes/componentes afetados:** N/A
- **O que deve ser modificado:** Rodar `npm dedupe`.
- **Como deve ser modificado:** `npm dedupe` e commitar lockfile atualizado.
- **O que pode ser removido:** Duplicatas de versão.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** `npm ci` e build/lint ok.
- **Dependências:** Nenhuma.

---

## P2-18 — Remover props mortas `index`/`total` (AssetRow)

- **Título:** Parar de passar props não utilizadas para AssetRow
- **Prioridade:** P2
- **Categoria:** Código Morto / Frontend
- **Impacto esperado:** Menos props confusas.
- **Motivo:** `AssetsTable.tsx:137` passa `index`/`total`; `AssetRow` os recebe como `_index`/`_total` e nunca lê.
- **Arquivos envolvidos:** `app/components/AssetsTable.tsx`, `app/components/AssetRow.tsx`
- **Funções/classes/componentes afetados:** `AssetRow` props; `AssetsTable` render
- **O que deve ser modificado:** Remover as props da interface e do render.
- **Como deve ser modificado:** Editar `AssetRowProps` e a chamada em `AssetsTable`.
- **O que pode ser removido:** `index`, `total`.
- **O que pode ser simplificado:** N/A.
- **Risco:** Baixo.
- **Validação:** Lint/build ok; tabela renderiza igual.
- **Dependências:** Nenhuma.

---

## P2-19 — Limpar `options` não usado em `useAssetData`

- **Título:** Remover parâmetro `options` morto em mutate do hook
- **Prioridade:** P2
- **Categoria:** Código Morto / Frontend
- **Impacto esperado:** API do hook mais clara.
- **Motivo:** `useAssetData.ts:118-125` `mutateSync`/`mutateFundamentals` aceitam `options` nunca lido; `:112-115` `refreshAll` descarta resposta do fetch.
- **Arquivos envolvidos:** `app/hooks/useAssetData.ts`
- **Funções/classes/componentes afetados:** `mutateSync`, `mutateFundamentals`, `refreshAll`
- **O que deve ser modificado:** Remover o segundo parâmetro; usar a resposta ou remover o fetch descartado.
- **Como deve ser modificado:** Simplificar assinaturas e `refreshAll` (manter `mutateDashboard()`).
- **O que pode ser removido:** `options`, fetch descartado.
- **O que pode ser simplificar:** Hook mais enxuto.
- **Risco:** Baixo.
- **Validação:** Funcionalidade de refresh mantida; lint ok.
- **Dependências:** Nenhuma.

---

> Continua em `PLANO_DE_OTIMIZACAO_PARTE_3.md` (P3).
