# REDESIGN.md — Briefing de frontend para o agente

> **Como usar:** abra o Gemini/Antigravity neste repositório e mande:
> *"Leia REDESIGN.md inteiro. Depois execute a fase indicada. Não pule a ordem."*
> Uma fase por sessão. Não peça o app todo de uma vez.

---

## 1. Contexto do projeto

| | |
|---|---|
| App | AssetFlow — gestão de investimentos pessoal (B3, FII, renda fixa, IR) |
| Frontend | Next.js 16 · React 19 · TypeScript · **Tailwind 4** |
| Escala | 118 arquivos de UI, ~22.900 linhas em `app/` |
| Temas | dark (padrão) e light, ambos obrigatórios |
| Gráficos | Recharts |
| Estado | single-user, dados reais, **não há ambiente de teste visual** |

### Comandos obrigatórios antes de dizer "pronto"

```powershell
npm run build
npx tsc --noEmit
npm test
npm run lint
```

Todos têm que passar. Hoje: 56 testes passando, `tsc` limpo, 41 warnings de lint (0 erros).

### Estrutura

```
app/
  components/            # UI compartilhada (ui/, credit-cards/, ...)
  features/              # assets, dashboard, evolution, header, jarvis, news, quant, tax, transactions, valuation
  context/               # Privacy, Theme, Toast
  lib/                   # api, format, session, colors, chartPalette
  globals.css            # tokens + ~200 linhas de override do tema claro
```

---

## 2. Diagnóstico medido — por que hoje não parece bom

Não é falta de talento visual. É **ausência de sistema**. Números do código atual:

| Métrica | Atual |
|---|---|
| `bg-slate-*` / `text-slate-*` / `border-slate-*` (cor hardcoded) | **1.880** |
| Tokens semânticos (`bg-surface-card`, `text-text-muted`) | 1.224 |
| Hex cru no JSX (`#0f172a`) | **142** |
| Tamanhos de fonte arbitrários | **566** — `[10px]`×309, `[11px]`×114, `[9px]`×104, `[8px]`×33, `[7px]`×4, `[9.5px]`×1 |
| Raios de borda | 759 usos em **6 variantes** (`rounded-lg` 293 vs `rounded-xl` 247) |
| `font-bold` | **702** (contra 154 semibold, 131 medium) |
| `font-extrabold` + `font-black` | 52 |
| Sombras | 215 |
| `backdrop-blur` | 58 |
| `tabular-nums` | **27** em 118 arquivos — `formatMoney` não aplica |
| Features sem skeleton de loading | 6 de 10 (evolution, valuation, header, jarvis, tax, transactions) |

**Consequência:** 564 tamanhos de fonte com passos de 1px. Um app com 702 negritos para 154
semibold não tem hierarquia — tudo grita no mesmo volume. E os números da tabela, que deveriam
alinhar em coluna, usam fonte proporcional.

**Efeito colateral:** as ~200 linhas de `.light-theme ... { !important }` em `globals.css` existem
**porque** 60% das cores são hardcoded. Tokenizar é o que apaga essa pilha.

### Linha de base objetiva (medida com a skill instalada)

```
.\.venv\Scripts\python.exe .agents\skills\unslop-ui\scripts\count_tells.py --surface app
```

| Regra | Contagem |
|---|---|
| U1 eyebrow (label decorativo) | 263 |
| U20 motion (animação decorativa) | 142 |
| U17 gradient or glow | 61 |
| U6 status string | 57 |
| U10 status dot | 56 |
| U19 extra-heavy weight | 52 |
| U11 emoji | 34 |
| em dash | 14 |
| U16 legend (legenda de gráfico) | 9 |
| U2 decorative numbering | 8 |
| U11 icon tile | 6 |
| U18 off-scale spacing | 5 |
| U9 badge word | 2 |
| **TOTAL** | **709** |

**Meta:** reduzir o total a cada fase e registrar o número. Nunca aumentar.

---

## 3. Regras invioláveis

1. **Não altere lógica.** Nada de `useEffect`, hook, chamada de API, cálculo, nome de prop ou tipo.
   Só classe CSS, estrutura visual e texto de interface.
2. **Não troque a stack.** Tailwind 4 puro. Proibido instalar shadcn, Radix, MUI, Chakra, styled-components.
3. **Não crie token novo.** Use só os de `globals.css` e a escala abaixo. Se faltar, **pare e pergunte**.
4. **Não troque a paleta.** Dark e light existem e funcionam; trocar cor quebra os dois.
5. **Não adicione biblioteca.** Nenhuma dependência nova.
6. **Mantenha os dois temas.** Toda mudança tem que ficar boa em dark **e** light.
7. **Uma tela por sessão.** Duas telas = você inventa um terceiro padrão.
8. **Inventário antes de editar.** Primeiro liste, espere aprovação, depois mexa.

---

## 4. O design system (obrigatório)

### Tipografia — piso 11px, sem redefinir o resto

**Um único token novo.** Adicione ao bloco `@theme inline` de `app/globals.css`:

```css
  --text-2xs: 0.6875rem;   /* 11px — piso de leitura para label e metadado */
```

**Não redefina `--text-xs`, `--text-sm` nem `--text-base`.** O Tailwind 4 já entrega
`xs`=12, `sm`=14, `base`=16, `lg`=18, `xl`=20, `2xl`=24. Redefinir a escala mudaria a tipografia de
22 mil linhas de uma vez — um commit, dois temas, sem chance de revisar. Fica para depois, sozinho.

Escala efetiva: **11 · 12 · 14 · 16 · 18 · 20 · 24**

| Uso | Classe |
|---|---|
| label de tabela, metadado, badge | `text-2xs` (11) |
| texto secundário | `text-xs` (12) |
| corpo de tabela | `text-sm` (14) |
| corpo | `text-base` (16) |
| título de card | `text-lg` (18) |
| título de seção | `text-xl` (20) |
| número-herói | `text-2xl` (24) |

**Mapeamento dos arbitrários que existem hoje:**

| Hoje | Vira |
|---|---|
| `text-[7px]`, `[8px]`, `[9px]`, `[9.5px]`, `[10px]`, `[11px]` | `text-2xs` |
| `text-[12px]` | `text-xs` |
| `text-[13px]`, `[14px]` | `text-sm` |
| `text-[16px]` | `text-base` |

> ⚠️ Isso deixa os badges ~2px maiores (9px → 11px). É intencional: é o piso de leitura. Se algum
> badge quebrar linha em célula apertada da tabela, ajuste o `padding`, não o tamanho da fonte.

- **Pesos: só 3.** `400` corpo · `500` label/ênfase · `600` título e número. **Remover `font-extrabold` e `font-black`.**
  > ⚠️ **Trocar `font-bold` por `font-semibold` em tudo NÃO cumpre a regra.** Em 21/11 isso levou o app a
  > **84% do texto em 600** — a métrica zerou e a hierarquia continuou inexistente, só mudou de peso.
  > A regra é **usar** os 3 para criar contraste: 600 em título e número, 500 em label, 400 em corpo.
  > Essa atribuição é trabalho da Fase 2, por tela. O verificador avisa quando passar de 70%.
- **Números:** `tabular-nums` obrigatório em toda célula monetária, percentual e quantidade.
  Criar a utility `.num` e aplicá-la em `formatMoney`/`formatPercent` (ou nas classes de célula).

### Raios — 3, usando a escala que o Tailwind já tem

**Nenhum token novo, nenhuma redefinição.**

| Classe | px | Uso |
|---|---|---|
| `rounded-md` | 6 | badge, pill, chip |
| `rounded-lg` | 8 | input, botão |
| `rounded-xl` | 12 | card, modal, painel |

`rounded-2xl` (16px) e `rounded-3xl` (24px) saem → mapear para `rounded-xl`.
`rounded-full` só para avatar e dot de status. `rounded-sm` não usar (2px, fino demais).

### Cores

- Tokens apenas: `bg-surface`, `bg-surface-card`, `bg-surface-input`, `text-text-primary`,
  `text-text-muted`, `border-border-subtle`, `text-status-success|warning|error`, `bg-accent`.
- **Proibido:** `slate-*`, `zinc-*`, `gray-*`, e qualquer hex no JSX.
- **Proibido `text-*-300` e `text-*-400`** de qualquer matiz (`purple`, `indigo`, `cyan`, `orange`,
  `emerald`, `rose`, `amber`…). Em fundo branco do tema claro dão contraste ~2,4:1 — falha WCAG AA.
  Use `text-status-success` / `text-status-warning` / `text-status-error` / `text-accent`.
  > Isso vale **porque** o bloco `!important` de `.light-theme` foi removido. Antes, esses tons eram
  > corrigidos por override; hoje não há mais rede de segurança. Regra: cor de texto é token ou não é.
- **Permitido:** `bg-*-500` sólido com texto branco (contraste OK nos dois temas).
- Tooltip de gráfico: usar `useChartPalette` (`app/lib/chartPalette.ts`), nunca `#0f172a` fixo.
  Cor de série de gráfico vive em `SEMANTIC_CHART_HEX` (`app/lib/colors.ts`), não no JSX.

### Sombras e movimento

- Sombras: **2**. `shadow-sm` em card, `shadow-lg` em modal. As outras saem.
- `backdrop-blur`: só no header fixo e no backdrop de modal.
- Animação: só transição de estado (hover, open/close). Remover `animate-in`, `fade-in`,
  `pulse` decorativo e delays de entrada. `animate-pulse` de skeleton **fica**.

### Estados — obrigatório em todo painel

Skeleton (não spinner) enquanto carrega · vazio (frase + ação) · erro (frase + retry).

---

## 5. Skill instalada — use sempre

`unslop-ui` está em `.agents/skills/unslop-ui/`. Ela remove "cara de IA" de interface e gráfico:
label decorativo, numeração, legenda redundante, badge e dot sem função, clutter de gráfico,
gradiente, brilho, espaçamento fora de escala, peso pesado e animação decorativa.

**Como invocar (este agente não é Claude Code):**

```powershell
# 1. ler as regras de escrita
.\.venv\Scripts\python.exe .agents\skills\unslop-ui\scripts\load_unslop.py

# 2. medir antes e depois
.\.venv\Scripts\python.exe .agents\skills\unslop-ui\scripts\count_tells.py --surface app
```

Depois leia `.agents/skills/unslop-ui/SKILL.md` e aplique as regras U1–U20, citando o id no relatório.

⚠️ **O contador é heurística de regex** — ele marca casos legítimos. Antes de "corrigir", julgue:

- **U1 (eyebrow): 260 achados, a maioria é falso positivo.** Cabeçalho de tabela, label de KPI e
  legenda de campo **são fragmentos por design** e ficam. Só saem os rótulos decorativos acima de
  um título que já diz a mesma coisa — ex.: `"Minha Carteira:"` e `"Análises & IA:"` antes de cada
  fileira de abas em `NavigationTabs.tsx`.
- **U10 (status dot) e U9 (badge word):** o seu badge de **sinal de estratégia**
  (`🟢 APORTAR`, `🟠 REDUZIR`) carrega decisão — **fica**. Só sai o que decora sem informar.
- **U11 (emoji):** os emojis dentro de `motivos` vêm do **back-end** (`📈 Acima do Teto Bazin`).
  Não mexa no back-end nesta tarefa; só nos emojis literais do JSX.
- **U16 (legend, 9):** legenda de gráfico que poderia ser rótulo direto. Avalie caso a caso — em
  gráfico com 3+ séries a legenda é necessária.
- **U19 (peso pesado, 52):** este **alinha** com o problema dos 702 `font-bold`. É ganho real.

### Patch local no contador (importante)

O `count_tells.py` isenta skeleton de U10 procurando `bg-slate-*`. Quando você tokeniza um skeleton
para `bg-surface-card`, o `animate-pulse` deixa de ser reconhecido como skeleton e passa a contar
como "status dot" — o total **sobe** sem nenhum problema real.

Foi corrigido localmente em `.agents/skills/unslop-ui/scripts/count_tells.py`, no regex `SKELETON`:

```python
SKELETON = re.compile(r"skeleton|\bbg-(?:muted|accent|secondary|surface|(?:gray|slate|zinc|neutral|stone)-\d)", re.I)
```

Com o patch, a linha de base continua **709** (no início os skeletons usavam `bg-slate-*`, já
isentos) e o número passa a ser comparável entre fases.

⚠️ **Se você atualizar a skill, reaplique este patch** — senão o total salta de volta e o gate
perde o sentido.

---

## 6. Fases — execute nesta ordem

### Fase 1 — Tokenizar (mecânico, verificável)

**Não é redesign.** É troca de classe. Ordem das pastas:

1. `app/components/ui/`
2. `app/features/header/`
3. `app/features/dashboard/`
4. `app/components/` (resto)
5. `app/features/*` (um por vez)
6. `app/agenda`, `app/perfil`, `app/tax`, `app/avancado`, `app/login`

**Critérios de aceite — rode o verificador (não há `grep`/`wc` no Windows):**

```powershell
& .\.agents\scripts\verificar-design.ps1
```

Ele mede as 9 métricas, compara com as metas, mede os tells e sai com código 1 se faltar algo.
Rode **antes** de começar e **depois** de cada pasta. Estado atual (todas pendentes, como esperado):

```
text-[Npx] arbitrario      566      meta 0
cor slate-* hardcoded     1880      meta 0
hex cru no JSX             142      meta 0
rounded-2xl/3xl             83      meta 0
font-extrabold/black        52      meta 0
font-bold                  702      (referência; alvo é reduzir para 3 pesos)
tabular-nums (>= 60)        27      meta >= 60
backdrop-blur               58
shadow-*                   215
TOTAL de tells             709
```

Se preferir medir uma pasta isolada, use o contador da skill direto:

```powershell
& .\.venv\Scripts\python.exe .agents\skills\unslop-ui\scripts\count_tells.py --surface app\features\header
```

**No fim da fase:** deletar as ~200 linhas de override `.light-theme` de `globals.css` e conferir
o tema claro. Se algo quebrar, é porque sobrou cor hardcoded — o override é a rede de segurança.

### Fase 2 — Redesenhar por tela (uma por sessão)

Ordem por impacto:

| # | Tela | Arquivos |
|---|---|---|
| 1 | Header + Resumo | `features/header/`, `features/dashboard/components/SummaryDashboard.tsx` |
| 2 | AssetsTable | `components/AssetsTable.tsx`, `features/assets/components/asset-row/*` |
| 3 | Evolução | `features/evolution/` (3 gráficos + 4 KPIs) |
| 4 | Cartões · Renda Fixa | `components/CreditCardsTab.tsx`, `components/FixedIncomeTab.tsx` |
| 5 | Quant · Valuation/Radar | `features/quant/`, `features/valuation/` |
| 6 | Jarvis · Login · agenda · perfil · tax | restantes |

**Protocolo de cada sessão:**

1. **Inventário primeiro, sem editar.** "Liste em 15 linhas os problemas visuais desta tela:
   hierarquia, peso, tamanho, alinhamento de número, densidade, espaçamento, estados."
2. **Screenshot.** Antes de decidir, o humano anexa print em dark e light.
3. **Referência.** 1–2 prints de interface que ele goste.
4. **Só então implementar os 5 itens de maior impacto**, com critério de aceite.

### Fase 3 — Estados

Criar skeleton/empty/error nas 6 features que não têm: evolution, valuation, header, jarvis, tax,
transactions. Reaproveitar `app/components/ui/Skeletons.tsx`.

---

## 7. O que NÃO fazer

- **Não pedir/executar o app inteiro numa sessão.** 22.900 linhas em um contexto = 22.900 decisões
  inconsistentes.
- **Não usar a skill `frontend-design` como está.** O `SKILL.md` dela diz: *"Not dashboards, not
  data tables, not multi-step product UI"*. É exatamente este caso. Se quiser, use só
  `redesign.md` (audit-first) e `style-brutalist.md` (data-heavy).
- **Não adicionar gradiente, brilho, glassmorphism ou micro-animação de entrada.** É o oposto do
  objetivo — o app já tem 61 gradientes e 142 animações a remover.
- **Não aumentar peso de fonte para "dar destaque".** O caminho é o contrário: reduzir de 702
  negritos para 3 pesos.
- **Não mudar densidade da tabela para "respirar".** É dashboard financeiro: densidade é feature.
- **Não usar spinner onde cabe skeleton.**
- **Não tocar em `globals.css` fora da remoção dos overrides de light** (Fase 1) — os tokens ficam.
- **Não alterar texto de dado vindo da API** (ticker, motivo, recomendação). Só copy de interface.

---

## 8. Definição de pronto (por sessão)

- [ ] `npm run build` completa
- [ ] `npx tsc --noEmit` limpo
- [ ] `npm test` verde (56+)
- [ ] `npm run lint` sem erro novo
- [ ] `count_tells --surface` **não aumentou** (idealmente caiu)
- [ ] Dark **e** light conferidos
- [ ] Nenhum `text-[Npx]`, `slate-*` ou hex introduzido
- [ ] Nenhuma lógica alterada (revisar o diff: só className, estrutura e string de UI)
- [ ] Relatório final: arquivos, o que mudou, número de tells antes/depois, o que ficou de fora
