# 🖥️ Frontend Web App (`app/`)

Esta pasta contém toda a interface do usuário construída sobre a arquitetura de App Router do **Next.js 16**, **React 19** e estilização via **Tailwind CSS v4**.

---

## 📂 Estrutura de Diretórios

* **`agenda/`:** Rota da agenda e calendário unificado de proventos futuros.
* **`api/auth/`:** Endpoint de autenticação servido por Next.js Routes.
* **`features/`:** Componentes, hooks e sub-abas agrupados por domínio:
  * **`assets/`** — `components/` (AddAssetModal, EditModal, AssetDetailsModal, AssetRow), `hooks/` (useAssetData, usePortfolioHandlers, usePortfolioMetrics) e `tabs/receivables/ReceivablesTab.tsx`.
  * **`quant/`** — `components/` (QuantDashboard, RiskMetricsPanel, CorrelationHeatmap, MonteCarloChart, RiskRadar).
  * **`news/`** — `AssetNewsPanel.tsx`, `MorningBriefing.tsx`.
  * **`header/components/`** — `Header.tsx` e sub-componentes (Logo, MarketStatus, MarketTicker, Notifications, PortfolioSummary, SystemStatus, ToolsMenu, UserMenu).
  * **`jarvis/`** — `JarvisChat.tsx`.
* **`lib/`:** Helpers centralizados — `api.ts` (helper `apiCall` + `API_BASE_URL` resolvido dinamicamente) e `format.ts` (`formatMoney`, `getStatusBg`).
* **`types/index.ts`:** Tipos compartilhados centralizados (Asset, DashboardData, interfaces de reembolsos/cartões, etc.).
* **`context/`:** Provedores de contexto globais (como privacidade de valores visíveis).
* **`store/`:** Gerenciador de estados de modais através do **Zustand** (`modalStore.ts`).
* **`components/ui/`:** Design system modular (Badge, Card, Markdown, PrivateValue, Skeleton unificado).

---

## ⚡ Diretrizes de Performance & Contribuição

1. **Imports Dinâmicos:** Todo novo gráfico pesado ou modal de grande volume de código deve ser importado usando `import dynamic` com `{ ssr: false }` para manter o bundle de entrada leve e otimizar o tempo de interatividade (TTI).
2. **Atualizações em Background:** Evite renderizações síncronas que causem input lags. Sempre envolva filtros ou estados secundários pesados no hook `useTransition`.
3. **Comunicação Segura:** Nunca declare constantes de URL de backend locais (`API_BASE`). Utilize exclusivamente a chamada unificada do helper `apiCall` de [apiClient.ts](file:///c:/Users/Fabricio/asset-flow/app/utils/apiClient.ts).
