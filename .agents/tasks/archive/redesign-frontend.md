# Redesign do frontend — método para o Gemini executar

**Data:** 21/11/2026 · **Escopo:** 118 arquivos de UI, 22.913 linhas
**Regra desta rodada:** o Gemini **executa**, você **decide**. Não o contrário.

---

## 1. O diagnóstico — por que não parece bom

Medi o código. Não é falta de talento visual nem de features de CSS: é **ausência de sistema**.

| Métrica | Medido | O que significa |
|---|---|---|
| `bg-slate-*` / `text-slate-*` / `border-slate-*` | **1.880** | 60% da cor é hardcoded |
| Tokens semânticos (`bg-surface-card`, `text-text-muted`) | **1.224** | só 40% |
| Hex cru no JSX (`#0f172a`) | **166** | cor fora do sistema |
| Tamanhos de fonte arbitrários | **564** | `text-[10px]` ×309, `[11px]` ×114, `[9px]` ×104, `[8px]` ×33, `[7px]` ×4, e **`[9.5px]`** |
| Raios de borda | **759 usos em 6 variantes** | `rounded-lg` 293 e `rounded-xl` 247 — quase empatados |
| `font-bold` | **702** | contra 154 `semibold` e 131 `medium` |
| `font-extrabold` + `font-black` | **52** | |
| Sombras | 215 | |
| `backdrop-blur` | 58 | |
| `tabular-nums` | **27** em 118 arquivos | e o `formatMoney` **não** aplica |
| Features sem skeleton de loading | **6 de 10** (evolution, valuation, header, jarvis, tax, transactions) | |

**Tradução:** existem **564 tamanhos de fonte** com passos de 1px, incluindo meio pixel. Um app
inteiro com 702 negritos e 154 semibold não tem hierarquia — tudo grita no mesmo volume. E os
números da tabela, que deveriam alinhar em coluna, usam fonte proporcional.

**Por que "deixe mais bonito" piora:** um LLM sem sistema escreve um sistema novo por arquivo. É
exatamente como se chegou a 564 tamanhos e 6 raios. Pedir redesign sem entregar o sistema produz
a sétima variante.

**E o efeito colateral que ninguém vê:** `globals.css` tem ~200 linhas de `.light-theme .bg-slate-900
{ ... !important }` — uma pilha de overrides que existe **porque** 60% das cores são hardcoded.
Tokenizar não é cosmético: é o que **apaga essa pilha e faz o tema claro funcionar de verdade**.

---

## 2. Fase 0 — Escrever o sistema (você decide, 30 min)

Crie `app/DESIGN.md`. É o contrato que o Gemini passa a ler em toda sessão. Sem isso, a
consistência morre entre uma conversa e outra.

Sistema proposto — derivado do que já existe (Geist, dark default, azul #3b82f6, escala slate).
Não invente paleta nova; trocar paleta quebra os dois temas de uma vez.

### Tipografia

| Token | Valor | Uso |
|---|---|---|
| `--text-2xs` | 11px | label de tabela, metadado |
| `--text-xs` | 12px | texto secundário |
| `--text-sm` | 13px | corpo de tabela |
| `--text-base` | 14px | corpo |
| `--text-lg` | 16px | título de card |
| `--text-xl` | 20px | título de seção |
| `--text-2xl` | 28px | número-herói (patrimônio) |

**Piso: 11px.** `[7px]`, `[8px]`, `[9px]`, `[9.5px]` saem todos.

**Pesos: só 3.** `400` corpo, `500` label e ênfase, `600` título e número. `extrabold` e `black` saem.

**Números:** `font-variant-numeric: tabular-nums` obrigatório em toda célula monetária, percentual e
quantidade. Criar utility `.num` aplicada por `formatMoney`/`formatPercent`. **Este é o item de maior
impacto por linha de código.**

### Raios

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 6px | badge, pill, chip |
| `--radius-md` | 10px | input, botão |
| `--radius-lg` | 14px | card, modal, painel |

`rounded-2xl` e `rounded-3xl` saem. `rounded-full` só para avatar e dot de status.

### Cores

Só tokens. `slate-*` e hex cru proibidos no JSX. Tokens existentes em `globals.css` (`--surface`,
`--surface-card`, `--text-primary`, `--text-muted`, `--accent`, `--status-*`) bastam — se faltar
matiz, **adicione um token**, nunca use `slate-800` solto.

### Sombras e espaçamento

- Sombras: 2. `shadow-sm` em card, `shadow-lg` em modal. As outras 213 saem.
- Espaçamento: só a escala do Tailwind (2, 3, 4, 6, 8). Nada de `p-[13px]`.
- `backdrop-blur`: só no header fixo e no backdrop de modal. Os outros 56 saem.

### Estados (obrigatório em todo painel)

Todo painel tem 3 estados: **skeleton** (não spinner), **vazio** (frase + ação) e **erro** (frase +
retry). Hoje 6 das 10 features não têm skeleton.

---

## 3. Fase 1 — Tokenizar (mecânico, verificável)

Esta fase **não é redesign** — é troca de classe. O Gemini é ótimo nisso porque o critério é
objetivo e ele pode rodar em lote por pasta.

Ordem: `app/components/ui/` → `app/features/header/` → `app/features/dashboard/` → resto.

**Critérios de aceite — grep que tem que zerar:**

```bash
# no app/, excluindo node_modules e .next
grep -rn "text-\[[0-9.]*px\]" app | wc -l      # → 0
grep -rn "bg-slate-\|text-slate-\|border-slate-\|divide-slate-" app | wc -l   # → 0
grep -rnE "#[0-9a-fA-F]{6}" app --include=*.tsx | wc -l   # → 0
grep -rn "rounded-2xl\|rounded-3xl" app | wc -l           # → 0
grep -rn "font-extrabold\|font-black" app | wc -l         # → 0
grep -rn "tabular-nums" app | wc -l                       # → >= 60
```

E, no fim: **deletar as ~200 linhas de override `.light-theme`** de `globals.css` e conferir o modo
claro. Se algo quebrar, é porque ficou cor hardcoded — o override é a rede de segurança.

---

## 4. Fase 2 — Redesenhar por tela (uma por sessão)

**Nunca** o app inteiro numa sessão. Contexto grande = inconsistência.

Ordem por impacto:

1. **Header + Resumo** — primeira impressão. É o que você vê 90% do tempo.
2. **AssetsTable** — a tabela é o produto. Tipografia, alinhamento de número, densidade.
3. **Evolução** — 3 gráficos + KPIs.
4. **Cartões** e **Renda Fixa**.
5. **Quant**, **Valuation/Radar**, **Jarvis**.
6. **Login**, **agenda**, **perfil**, **tax**.

### O formato de cada sessão

**Passo A — inventário antes de editar.** Peça a lista de problemas visuais, sem tocar no código.
Isso evita edição às cegas e te dá controle.

**Passo B — screenshot.** Tire print da tela em `assetflow.localhost` e **anexe na conversa**. Gemini
aceita imagem. Este é o maior ganho único do processo: o modelo passa a julgar o que está na tela,
não o que ele imagina. Mande sempre **dark e light**.

**Passo C — referência.** Anexe 1–2 prints de interfaces que você goste. Sem referência, o modelo
cai no default dele (card com gradiente e borda arredondada demais).

**Passo D — só então editar**, com o pedido específico e o critério de aceite.

---

## 5. Como pedir — 7 regras

1. **Nunca "deixe mais bonito".** Peça objetivo: "reduza a tabela de 6 para 3 pesos de fonte",
   "aplique tabular-nums em todas as células de valor", "una `rounded-lg` e `rounded-xl` em `--radius-lg`".
2. **Uma tela por sessão.** Duas telas = o modelo inventa um terceiro padrão.
3. **Proíba criar token novo.** "Use apenas os tokens de `app/DESIGN.md`. Se faltar, pare e pergunte."
4. **Peça inventário primeiro, código depois.** Sempre em duas mensagens.
5. **Sempre com screenshot.** Dark e light.
6. **Critério de aceite numérico.** O grep da Fase 1 é o contrato.
7. **Não deixe tocar em lógica.** "Só classes e estrutura visual. Não altere hooks, chamadas de API,
   cálculo nem nome de prop." Redesign que muda `useEffect` é regressão disfarçada.

---

## 6. Prompt para colar (Fase 1 — tokenização)

```
Leia `app/DESIGN.md` e as regras de `.agents/tasks/redesign-frontend.md`.

Tarefa: tokenizar o design system em `app/components/ui/` e `app/features/header/`.
NÃO é redesign. É troca de classe. Não altere lógica, hooks, chamadas de API nem nomes de prop.

Faça, nesta ordem:
1. Substitua todo `text-[Npx]` pela escala de `DESIGN.md` (piso 11px).
2. Substitua `bg-slate-*`, `text-slate-*`, `border-slate-*`, `divide-slate-*` pelos tokens semânticos.
3. Remova todo hex cru do JSX.
4. Una `rounded-2xl`/`rounded-3xl` em `--radius-lg`.
5. Reduza para 3 pesos de fonte (400/500/600); remova `font-extrabold` e `font-black`.
6. Aplique `tabular-nums` em toda célula monetária, percentual e de quantidade.

Antes de editar: liste em 15 linhas o que encontrou em cada arquivo e o plano de troca.
Depois de editar: rode
  grep -rn "text-\[[0-9.]*px\]" app | wc -l                  (esperado 0)
  grep -rn "slate-" app | wc -l                              (esperado 0)
  grep -rnE "#[0-9a-fA-F]{6}" app --include=*.tsx | wc -l     (esperado 0)
  npm run build && npx tsc --noEmit && npm test

Se um número não zerar, me diga qual arquivo resistiu e por quê — não invente exceção.
```

## 7. Prompt para colar (Fase 2 — uma tela)

```
Leia `app/DESIGN.md`.

Tela: Header + aba Resumo (`app/features/header/`, `app/features/dashboard/components/SummaryDashboard.tsx`).
Anexei 2 prints do estado atual (dark e light) e 1 referência de estilo.

Passo 1 — NÃO edite nada ainda. Faça o inventário visual desta tela:
tipografia (hierarquia, peso, tamanho), espaçamento, alinhamento de números, densidade,
uso de cor, estados de loading/vazio/erro. Máximo 15 linhas, priorizado por impacto.

Passo 2 — Depois que eu aprovar, implemente APENAS os 5 itens de maior impacto.
Regras: use só os tokens de `app/DESIGN.md`; não crie token novo; não altere lógica,
hooks nem chamadas de API; mantenha os dois temas funcionando.

Critério de aceite: nenhum `text-[Npx]`, nenhum `slate-*`, `tabular-nums` em todo valor
monetário, e o print final em light não pode ter contraste pior que o atual.
```

---

## 8. O que NÃO fazer

- **Não peça "redesenhe o app inteiro".** 22.913 linhas em um contexto = 22.913 decisões
  inconsistentes.
- **Não use a skill `frontend-design/SKILL.md` inteira.** Ela declara no topo: *"Landing pages,
  portfolios, and redesigns. **Not dashboards, not data tables, not multi-step product UI**"*.
  É exatamente o seu caso. Use o `redesign.md` dela (audit-first, genérico e útil) e o
  `style-brutalist.md` (data-heavy). Ignore as instruções de headline editorial e serifa.
- **Não troque a paleta.** Dark + light já existem e funcionam; trocar cor quebra os dois.
- **Não adicione biblioteca de UI** (shadcn, Radix, MUI). O projeto é Tailwind 4 puro — 22 mil
  linhas já estabelecidas. Trocar de base é reescrita, não melhoria.
- **Não mexa em lógica** durante o redesign. Um `useEffect` alterado "para ficar melhor" é regressão.
- **Não aceite "adicionei um gradiente e uma sombra" como entrega.** O ganho tem que aparecer no grep.
- **Não faça o redesign antes de tokenizar.** Sem a Fase 1, cada tela nova reintroduz o problema.

---

## 9. Esforço estimado

| Fase | Sessões | Ganho visível |
|---|---|---|
| 0 — DESIGN.md | 1 | nenhum direto, mas é o que segura tudo |
| 1 — tokenizar | 3–5 | números alinhados, hierarquia, **tema claro funcionando**, −200 linhas |
| 2 — telas (6 blocos) | 6–8 | a diferença que você "vê" |
| 3 — estados | 2 | app para de piscar vazio |

O maior salto perceptivo está na **Fase 1**, não na Fase 2. Alinhar os números da tabela e reduzir
de 702 negritos para 3 pesos muda mais a percepção de qualidade do que qualquer gradiente.
