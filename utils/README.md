# 🛠️ Utilitários Gerais (`utils/`)

Esta pasta contém utilitários comuns do projeto, centralizando funções auxiliares e regras de modelagem.

---

## 📂 Organização

* **`README.md`:** Guia geral de utilitários.

---

## 💡 Diretrizes

* **Reusabilidade:** Centralizar funções de formatação numérica e validação comuns que possam ser compartilhadas em futuros scripts auxiliares.
* **Isolamento de Negócio:** Evite injetar regras de negócio complexas ou conexões a bancos de dados nesta pasta. Para isso, utilize as classes de serviços do `server/services.py` ou os modelos em `database/models.py`.
