# 🖥️ Frontend Web App (`app/`)

Esta pasta contém toda a interface do usuário construída sobre a arquitetura de App Router do **Next.js 16**, **React 19** e estilização via **Tailwind CSS v4**.

---

## 📂 Estrutura de Diretórios

* **`agenda/`:** Rota da agenda e calendário unificado de proventos futuros.
* **`api/auth/`:** Endpoint de autenticação servido por Next.js Routes.
* **`config/`:** Configuração base da API (ex: `API_BASE_URL` resolvido dinamicamente).
* **`context/`:** Provedores de contexto globais (como privacidade de valores visíveis).
* **`hooks/`:** Custom hooks para gerenciamento de fetches automáticos via **SWR** (`useAssetData.ts`).
* **`store/`:** Gerenciador de estados de modais através do **Zustand** (`modalStore.ts`).
* **`components/`:** Componentes de interface modulares da dashboard:
  * **[ui/Markdown.tsx](file:///c:/Users/Fabricio/asset-flow/app/components/ui/Markdown.tsx):** Renderizador seguro de formatação de IA com tratamento de tipos.
  * **[HealthIndicator.tsx](file:///c:/Users/Fabricio/asset-flow/app/components/HealthIndicator.tsx):** Telemetria em tempo real conectado com a API de healthcheck do backend.
  * **[AssetsTable.tsx](file:///c:/Users/Fabricio/asset-flow/app/components/AssetsTable.tsx):** Tabela principal de ativos virtualizada (`@tanstack/react-virtual`) com filtragem via `useTransition`.

---

## ⚡ Diretrizes de Performance & Contribuição

1. **Imports Dinâmicos:** Todo novo gráfico pesado ou modal de grande volume de código deve ser importado usando `import dynamic` com `{ ssr: false }` para manter o bundle de entrada leve e otimizar o tempo de interatividade (TTI).
2. **Atualizações em Background:** Evite renderizações síncronas que causem input lags. Sempre envolva filtros ou estados secundários pesados no hook `useTransition`.
3. **Comunicação Segura:** Nunca declare constantes de URL de backend locais (`API_BASE`). Utilize exclusivamente a chamada unificada do helper `apiCall` de [apiClient.ts](file:///c:/Users/Fabricio/asset-flow/app/utils/apiClient.ts).
