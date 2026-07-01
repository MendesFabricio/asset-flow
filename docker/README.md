# 🐋 Containerização do Ambiente (`docker/`)

Esta pasta e as configurações associadas gerenciam a infraestrutura de contêineres e deploy do ecossistema do **AssetFlow Pro**.

---

## 📂 Serviços Mapeados no `docker-compose.yml`

O projeto roda isolado em 4 serviços principais:

1. **`frontend` (Next.js 16 / Node 20):**
   * Hospeda o servidor web que entrega o HTML/JS otimizado. Roda na porta interna `3000`.
2. **`backend` (Flask / Python 3.11):**
   * Hospeda a API que atende o frontend. Porta exposta: `5328`.
3. **`worker` (Python 3.11):**
   * Executa o agendador em background (`APScheduler`) para processamento silencioso. Compartilha o banco de dados via volume local.
4. **`ollama` (Ollama Engine):**
   * Daemon da IA local que executa o modelo `llama3.2:3b` na porta `11434`.

---

## 💾 Persistência de Dados & Conectividade

* **Volume do SQLite:** O banco de dados SQLite (`assetflow.db`) é montado sob um volume compartilhado entre as pastas `/database` e os containers `/app/database`, permitindo gravação transparente pelo Worker e leitura concorrente pelo Backend.
* **Volume do Model Cache:** Mapeia a pasta do Ollama (`/root/.ollama`) para que os modelos baixados persistam mesmo se o container for deletado.
* **Modo Host/Portas:** O backend mapeia a porta `5328` e o frontend a `3000` na máquina host do investidor.
