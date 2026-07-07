# Plano de Auditoria e Correção do Frontend (`app/`)

**Objetivo:** Corrigir bugs, remover código morto e finalizar/ajustar ferramentas incompletas na pasta `app/` do AssetFlow.

**Contexto:** Aplicativo Next.js 16 + React 19 + TypeScript + Tailwind CSS v4, com roteamento App Router.

---

## 1. BUGS CRÍTICOS / MÉDIOS

### 1.1 `components/RiskMetricsPanel.tsx` — Acesso inseguro a `data.interpretacao.*`
- **Linhas:** 242, 249, 255, 261, 371
- **Problema:** Acesso direto a `data.interpretacao.beta`, `data.interpretacao.alpha`, `data.interpretacao.sharpe`, `data.interpretacao.drawdown` sem verificação de nulidade. Se o backend retornar resposta sem o objeto `interpretacao`, ocorre `TypeError` em runtime.
- **Ação:** Adicionar optional chaining com fallbacks string vazios: `data.interpretacao?.beta ?? ''` e validar estrutura antes de renderizar.

### 1.2 `components/RiskMetricsPanel.tsx` — `apiCall<any>` sem type guards
- **Linhas:** 165-178
- **Problema:** Fetching de `/api/assets` usa `apiCall<any>` e `parseFloat(curr.total_atual || 0)` inline. Dados malformados do backend propagam `NaN` silenciosamente.
- **Ação:** Criar interface tipada para resposta de `/api/assets` e adicionar validação numérica com fallback para `0`.

### 1.3 `components/FixedIncomeTab.tsx` — Divisão por zero em progress bar
- **Linha:** 187
- **Problema:** `Math.round((t.days_elapsed / t.total_days) * 100)` causa `NaN` se `total_days === 0`. O CSS de `width: NaN%` quebra a barra de progresso visualmente.
- **Ação:** Adicionar guarda: `t.total_days > 0 ? Math.round((t.days_elapsed / t.total_days) * 100) : 0`.

### 1.4 `components/JarvisChat.tsx` — Fetch cru ao invés do `apiCall`
- **Linhas:** 113-119
- **Problema:** Usa `fetch(`${API_BASE_URL}/api/ai/chat`)` diretamente, bypassando timeout de 180s, error handling centralizado e convenções de autenticação do `apiClient`.
- **Ação:** Substituir por `apiCall` com streaming manual, ou adicionar wrapper próprio com mesmas features de timeout/error handling.

### 1.5 `components/SmartAllocationModal.tsx` — `<img>` sem atributo `alt`
- **Linha:** 179-183
- **Problema:** Tag `<img>` sem `alt`, ferindo acessibilidade e HTML validity. Também pode causar falha em auditores de Lighthouse/SEO.
- **Ação:** Adicionar `alt={`Ícone ${s.ticker}`}`.

### 1.6 `components/SmartAllocationModal.tsx` — Parser de moeda frágil
- **Linhas:** 54-59
- **Problema:** `v.replace(/\./g, '').replace(',', '.')` falha para valores em formato US como `1,000,000.50`, produzindo `1.000.00050` que `Number()` avalia como `NaN`.
- **Ação:** Usar parser robusto (ex: `Intl.NumberFormat` ou regex que distingue separadores de milhar de decimal).

### 1.7 `ui/Markdown.tsx` — Headers profundos colapsam para `<h3>`
- **Linhas:** 58-82
- **Problema:** Títulos com `####`, `#####`, `######` todos renderizam como `<h3>`, perdendo semântica HTML e acessibilidade.
- **Ação:** Mapear profundidade 3→`h3`, 4→`h4`, 5+→`h5` com tamanhos de fonte decrescentes.

### 1.8 `QuantDashboard.tsx` — Erro DCA exibe status numérico cru
- **Linha:** 219
- **Problema:** `setDcaError(res.status || 'Falha...')` usa `res.status` (HTTP status numérico como `500`) como mensagem de erro para o usuário.
- **Ação:** Mapear status HTTP para mensagens legíveis: `res.status` só deve ser usado como fallback genérico, não exibido diretamente.

### 1.9 `ReceivablesTab.tsx` — Classes Tailwind inválidas
- **Linhas:** 958, 966
- **Problema:** `text-slate-350` e `text-slate-450` não existem no Tailwind CSS. Devem ser `text-slate-400` e `text-slate-500` respectivamente, ou outro tom válido.
- **Ação:** Substituir por classes válidas: `text-slate-400` e `text-slate-500`.

### 1.10 `AssetDetailsModal.tsx` — Mutação direta de DOM (`innerHTML = ''`)
- **Linha:** 148
- **Problema:** `containerRef.current.innerHTML = ''` desynca o React virtual DOM em re-renders subsequentes do widget TradingView.
- **Ação:** Isolar widget em componente separado com `useEffect` que limpa antes de injetar, ou usar `dangerouslySetInnerHTML` de forma controlada.

---

## 2. CÓDIGO MORTO / IMPORTS NÃO UTILIZADOS

### 2.1 `components/CategorySummary.tsx`
- **Remover:** Import `TrendingDown` (linha 6) — não usado no arquivo.

### 2.2 `components/CreditCardsTab.tsx`
- **Remover:** Import `ArrowUpRight` (linha 7) — não usado; Declaração `const [isPending, startTransition] = useTransition()` (linha 56) — `isPending` e `startTransition` não são usados no componente.

### 2.3 `components/FixedIncomeTab.tsx`
- **Remover:** Imports `Wallet`, `AlertCircle`, `DollarSign`, `Clock` (linhas 5-7) — nenhum utilizado.

### 2.4 `components/QuantDashboard.tsx`
- **Remover:** Imports `ReferenceDot` e `TooltipProps` do `recharts` (linhas 24-25) — não usados.

### 2.5 `components/MonteCarloChart.tsx`
- **Remover:** Campo `retorno` do estado `stats` (linha 33, 53) — inicializado mas nunca renderizado.

### 2.6 `components/ReceivablesTab.tsx`
- **Remover:** Imports `Filter`, `History`, `ArrowUpRight` (linhas 5-9) — não usados.

### 2.7 `components/Header/UserMenu.tsx`
- **Remover:** Função `toggleTheme` (linhas 50-52) — atualiza estado local `theme` mas nunca aplica classe/tema no documento ou body. O botão no menu não tem efeito real.

---

## 3. FERRAMENTAS INACABADAS / STUBS

### 3.1 `ToolsMenu.tsx` — Item "Importação OCR" marcado como "Breve"
- **Linha:** 112
- **Problema:** O botão usa `onOpenAddModal()` como fallback para uma funcionalidade que ainda não existe. Usuário pode pensar que a importação OCR foi acionada.
- **Ação:** Decisão: (a) implementar stub com toast explicando que OCR está em desenvolvimento, ou (b) remover o item até a feature estar pronta.

### 3.2 `ui/Markdown.tsx` — Parser minimalista incompleto
- **Problema:** Suporta apenas bold, headers (até h3 colapsado) e listas. Faltam: links, inline code, code blocks, italic, strikethrough, blockquotes, listas aninhadas.
- **Ação:** Decisão: (a) substituir por biblioteca como `react-markdown` ou `marked`, ou (b) completar implementação manual gradualmente. Recomenda-se (a) para evitar trabalho de manutenção infinita.

### 3.3 `Header/UserMenu.tsx` — Menu items sem ação
- **Linhas:** 78-124
- **Problema:** "Meu Perfil", "Logs de Auditoria", "Avançado" tem `onClick={() => setIsOpen(false)}` mas não executam ação. Usuário clica e menu fecha sem feedback.
- **Ação:** Decisão: (a) implementar rotas/modais, ou (b) adicionar toast "Em desenvolvimento", ou (c) remover items temporariamente.

### 3.4 `Header/ToolsMenu.tsx` — "Dev Console Logs" desabilitado permanentemente
- **Linhas:** 224-230
- **Problema:** Item renderizado com `cursor-not-allowed` mas visível, sugerindo funcionalidade que nunca será ativada para usuários comuns.
- **Ação:** Decisão: (a) restringir visibilidade via role/permission check, ou (b) remover da UI pública e mover para admin panel.

### 3.5 `Header/SystemStatus.tsx` — Sincronizador CVM hardcoded
- **Linhas:** 176-181
- **Problema:** O serviço "Sincronizador CVM" sempre aparece como `online` com mensagem fixa, independente do estado real do backend.
- **Ação:** Decisão: integrar com endpoint real de healthcheck ou remover da lista de serviços monitorados.

---

## 4. CHECKLIST DE VALIDAÇÃO

Após as correções, executar:
1. `npm run lint` — verificar ausência de erros ESLint
2. `npm run typecheck` — verificar tipos TypeScript (especialmente `NodeJS.Timeout` removido)
3. `npm run build` — garantir que o bundle compila sem warnings críticos
4. Teste manual: navegar por todas as tabs (Resumo, Ação, FII, Renda Fixa, Cartões, Reembolsos, Agenda, Quant, Jarvis) e verificar consoles sem erros

---

## 5. ORDEM DE IMPLEMENTAÇÃO RECOMENDADA

| # | Prioridade | Tarefa | Arquivo(s) |
|---|-----------|--------|-----------|
| 1 | Alta | Corrigir divisão por zero em FixedIncomeTab | `FixedIncomeTab.tsx` |
| 2 | Alta | Corrigir acesso inseguro a `interpretacao` em RiskMetricsPanel | `RiskMetricsPanel.tsx` |
| 3 | Alta | Corrigir `alt` ausente e parser de moeda em SmartAllocationModal | `SmartAllocationModal.tsx` |
| 4 | Alta | Substituir fetch cru por apiCall em JarvisChat | `JarvisChat.tsx` |
| 5 | Média | Corrigir classes Tailwind inválidas em ReceivablesTab | `ReceivablesTab.tsx` |
| 6 | Média | Corrigir bug DCA error message em QuantDashboard | `QuantDashboard.tsx` |
| 7 | Média | Corrigir headers Markdown e remover type `any` | `ui/Markdown.tsx` |
| 8 | Média | Remover código morto (7 arquivos) | Vários |
| 9 | Baixa | Remover/finalizar tools incompletas (OCR, Perfil, Logs, DevConsole) | `ToolsMenu.tsx`, `UserMenu.tsx` |
| 10 | Baixa | Remover `innerHTML` direto em AssetDetailsModal | `AssetDetailsModal.tsx` |
