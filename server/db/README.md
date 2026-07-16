# 💾 Camada de Persistência de Dados (`database/`)

Esta pasta centraliza os modelos relacionais e sessões do banco de dados SQLAlchemy da aplicação. 

O banco de dados utilizado é o **SQLite**, operando sob configurações otimizadas de concorrência e velocidade.

---

## 📂 Estrutura de Diretórios

* **`models.py`:** Definição de tabelas (Assets, Positions, Categories, Snapshots, Dividends) e pragmas de conexão do motor SQLAlchemy.
* **`session.py`:** Gerenciador do ciclo de vida das sessões (`Session` e `engine`).

---

## ⚡ Pragmas e Performance no SQLite (Produção)

Para permitir a operação estável de múltiplos processos concorrentes (Gunicorn Web Server + APScheduler Background Worker), configuramos Pragmas de nível de produção no evento de conexão do SQLAlchemy:

1. **`PRAGMA foreign_keys = ON;`**
   * Garante a integridade referencial física em nível de banco de dados.
2. **`PRAGMA journal_mode = WAL;`**
   * Ativa o modo **Write-Ahead Logging**. Permite que o container de Backend leia dados do cache de forma concorrente sem que o container do Worker bloqueie as conexões durante atualizações de cotações.
3. **`PRAGMA synchronous = NORMAL;`**
   * Reduz a quantidade de sincronizações de disco síncronas a cada gravação física, aumentando a velocidade de gravação mantendo a integridade do WAL.
4. **`PRAGMA busy_timeout = 30000;`**
   * Define um tempo de espera (timeout) de até 30 segundos se uma tabela estiver momentaneamente bloqueada para escrita, evitando exceções imediatas de travamento.
5. **`PRAGMA cache_size = -32000;`**
   * Reserva 32MB de cache em memória RAM para reter índices e consultas mais utilizadas, aliviando o estresse de leitura no disco.
