# ⚙️ Python Backend (`server/`)

Esta pasta armazena o servidor de dados do **AssetFlow Pro**, rodando em **Python 3.11** com **Flask** sob o servidor de produção **Gunicorn**.

---

## 📂 Estrutura de Diretórios

* **`routes/`:** Mapeamento de endpoints organizados em Flask Blueprints:
  * **`ai.py`:** Rota do chat Jarvis executando a máquina de estado do agente via Function Calling estruturado com Ollama.
  * **`news.py`:** Sentimento de mercado com IA local, gerenciando timeouts de check e tempos de cooldown de erros.
  * **`simulation.py`:** Endpoints do simulador de alocação inteligente e da API de **Morning Briefing** enriquecida.
  * **`health.py`:** Coleta telemetria física do SQLite, Yahoo Finance e daemon Ollama.
* **`domain/`:** Motor de algoritmos matemáticos isolados (`quant_engine.py`) calculando Monte Carlo GBM Merton Jumps, EWMA de volatilidade e VaR/CVaR Cornish-Fisher.
* **`infrastructure/`:** Controladores de baixo nível para requisições de IA (`ollama_service.py`), gerenciador de cacheamento de cotações em disco (`price_cache.py`) e conexão fundamentalista Yahoo.
* **`crawlers/`:** Automações de scrapers de fatos relevantes e proventos da CVM.
* **`alembic/`:** Configurações de migrações estruturais do banco de dados SQLAlchemy.
* **`db/`:** Camada de persistência SQLAlchemy (movida de `database/` na raiz). Contém `models.py` (tabelas + pragmas WAL), `session.py` (ciclo de vida das sessões) e `lock.py` (lock distribuído). As migrations Alembic ficam em `db/migrations/`.

---

## 🔒 Boas Práticas no Backend

1. **Gestão de Sessões do Banco:** Sempre feche ou desaloque sessões do banco de dados explicitamente dentro de blocos `finally` (`Session.remove()`) para evitar vazamentos de conexões em concorrência no pool.
2. **Defesa contra Locks do SQLite:** Use sempre `safe_commit(session)` (importado de `database.models`) para commitar transações de escrita. Ele possui retry automático contra o erro `database is locked`.
3. **Robustez no Ollama:** O tempo limite máximo do Ollama deve ser de 60 segundos nos payloads internos do backend.
