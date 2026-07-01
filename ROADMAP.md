# 🗺️ Roadmap de Desenvolvimento & Diagnóstico - AssetFlow Pro

Este documento reúne o status de telemetria, bugs resolvidos/conhecidos, backlog de melhorias futuras e o cronograma de releases.

---

## 🐛 Bugs Conhecidos & Mitigações

### 1. Latência no Aquecimento Inicial da IA (Ollama Cold Start)
* **Descrição:** Se o container do Ollama for reiniciado ou ficar inativo por muito tempo, a primeira chamada de IA (no chat Jarvis ou no Morning Briefing) sofre latência de carregamento do arquivo do modelo (`llama3.2:3b`) na RAM/VRAM.
* **Mitigação:** Expandimos os timeouts de requisições críticas de IA de 15s para **60s** e implementamos feedbacks de progresso visual em tempo real no Jarvis Chat (`💡 *Ação: Consultando ativos...*`) para melhorar a experiência do usuário.

### 2. Bloqueio Temporário do Yahoo Finance (Rate Limiting)
* **Descrição:** Chamadas sequenciais em massa para o Yahoo Finance podem gerar bloqueios temporários de IP (Status 429 ou 403).
* **Mitigação:** Implementamos uma camada robusta de cacheamento de preços em arquivos temporários (`infrastructure/price_cache.py`) com validade curta de 10 minutos, além do uso de User-Agents simulando navegadores legítimos nos crawlers.

### 3. Concorrência Concorrente no SQLite
* **Descrição:** Tentativas de gravações simultâneas pelo Worker e pelo Backend podem causar exceções de banco travado (`database is locked`).
* **Mitigação:** Ativamos o modo **WAL (Write-Ahead Logging)** com pragma de timeout de 30s (`PRAGMA busy_timeout=30000`) e criamos o decorador `@retry` de transação automática via `tenacity` em `safe_commit`.

---

## 🚀 Melhorias Futuras (Backlog)

### FASE 1: Inteligência Artificial & Automação (Q3 2026)
* **Novas Ferramentas para o Jarvis:** Criar ferramenta de execução de simulações de aporte diretamente via comandos do chat (ex: *"Jarvis, simule uma compra de R$ 5.000,00 nos melhores ativos"*).
* **Agendamento de Notícias de Impacto:** Envio automático de alertas no Telegram/E-mail quando a IA identificar sentimentos `"fortemente baixistas"` em fatos relevantes da CVM dos ativos da carteira.

### FASE 2: Modelagem Quantitativa Avançada (Q4 2026)
* **Stress Testing Macroeconômico:** Painel interativo para simular o comportamento da carteira frente a choques econômicos fictícios (ex: inflação a 10%, Selic a 18%, ou queda de 25% no Ibovespa).
* **Otimização de Portfólio de Markowitz:** Gerador de fronteira eficiente para recalcular pesos ótimos visando a maior relação Sharpe possível dentro do portfólio de renda variável.

### FASE 3: Experiência Multi-Portfólio (Q1 2027)
* **Suporte Multi-Carteiras:** Permitir que o investidor crie sub-carteiras distintas (ex: carteira de dividendos, carteira internacional, caixa de reserva) dentro da mesma conta de usuário.

---

## 📅 Histórico de Releases Recentes

* **v1.2.0 (Atual):** Refatoração da camada de chamadas de API do frontend para `apiCall`, implementação de `useTransition` na tabela de busca para mitigar input lag, e implantação de detecção automática de travamento no sentiment checking.
* **v1.1.0:** Lançamento do Agente Jarvis com Function Calling ativo (integração fundamentalista CVM + métricas quantitativas de risco).
* **v1.0.0:** Lançamento da Dashboard do AssetFlow Pro com simulações de Monte Carlo e rebalanceamento de pesos patrimoniais.
