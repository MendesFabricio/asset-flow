# Task: Importação e Processamento Inteligente de Extratos e Faturas (PDF, Excel, Word)

**Status:** Phase 2 (Planning) & Phase 3 (Solutioning)  
**Assigned Agents:** `@backend-specialist`, `@frontend-specialist` (`@orchestrator`)  
**Skills Active:** `@[brainstorming]`, `@[api-patterns]`, `@[clean-code]`, `@[frontend-design]`

---

## 1. Goal Description
O usuário necessita de uma funcionalidade na seção de **Cartões** (`CreditCardsTab`) que permita o upload de arquivos de extrato/relatório bancário (**PDF, Excel `.xlsx`/`.xls` ou Word `.docx`**), como o extrato da conta/cartão Nubank (`NU_*.pdf`).
O sistema deve compilar o arquivo, extrair as informações estruturadas e apresentar uma pré-visualização completa com:
1. **Resumo do Período:** Total de Entradas (`+ R$ X`), Total de Saídas (`- R$ Y`), Saldo Inicial e Saldo Final.
2. **Consolidação Débito vs. Crédito vs. PIX:** Separação exata do total gasto no Débito (`Compra no débito`), total pago de Fatura (`Pagamento de fatura`) e PIX/Transferências.
3. **Categorização Automática dos Gastos:** Classificação inteligente de itens recorrentes (ex: `DROGARIA` -> Farmácia/Saúde, `COFFEE` -> Alimentação/Café, `Uber`/`99` -> Transporte, `iFood` -> Alimentação).
4. **Tabela Interativa de Revisão:** Para conferência do usuário antes de confirmar a gravação das despesas na carteira/cartão selecionado.

---

## 2. Technical Architecture & Solution Design

### 2.1 Backend (`server/routes/statement_import.py`)
- **Novo Blueprint (`statement_import_bp`):** Rota `POST /api/statements/parse`
- **Suporte a Múltiplos Formatos:**
  - **PDF (`.pdf`):** Processamento com `PyMuPDF` (`fitz`) usando análise de blocos de texto por página (`page.get_text()`).
  - **Excel (`.xlsx`/`.xls`):** Leitura via `pandas` (`read_excel`), localizando colunas padrão de Data, Descrição/Histórico e Valor/Montante.
  - **Word (`.docx`):** Leitura via `python-docx` (parágrafos e tabelas) ou fallback de texto.
- **Motor de Extração Inteligente (Nubank & Padrão Bancário):**
  - **Identificação do Período:** Regex para capturar datas (`01 DE SETEMBRO DE 2025 a 30 DE SETEMBRO DE 2025` ou datas pontuais).
  - **Resumo Geral:** Captura de `Saldo inicial`, `Total de entradas`, `Total de saídas` e `Saldo final`.
  - **Agrupamento por Dia e Linha (`Movimentações`):**
    - Lendo blocos por data (`04 SET 2025`, `05 SET 2025`, etc.).
    - Extração de `Transferência enviada/recebida pelo Pix`, `Compra no débito`, `Pagamento de fatura`, `Resgate de empréstimo`, `Valor adicionado na conta por cartão`.
  - **Regras de Categorização Automática (`categorize_transaction(description)`):**
    - Transporte: `uber`, `99app`, `autopass`, `tmob`, `combustivel`, `posto`
    - Alimentação: `ifood`, `rappi`, `coffee`, `cafe`, `restaurante`, `padaria`, `supermercado`, `mercado`
    - Saúde/Farmácia: `drogaria`, `farma`, `pague menos`, `drogasil`, `hospital`, `clinica`
    - Fatura/Cartão: `pagamento de fatura`, `cartao de credito`
    - Transferência/PIX: `transferencia`, `pix`, `pagamentos - ip`

### 2.2 Frontend (`app/features/cards` ou `app/components`)
- **Componente de Entrada:** Botão com ícone `FileText` e `Upload` dentro de `CreditCardsTab.tsx`:
  - `Importar Extrato / Fatura` (com pílula informativa `PDF, Excel, Word`).
- **Modal de Importação (`StatementImportModal.tsx`):**
  - **Área de Upload (Drag & Drop):** Suporta `.pdf, .xlsx, .xls, .docx`.
  - **Seletor de Cartão de Destino:** Dropdown listando os cartões do usuário (`Nubank`, `XP`, `Itaú`, etc.) para onde os itens marcados como crédito/despesa serão vinculados ao confirmar.
  - **Painel de Análise (Pós-Upload):**
    - Cards de Indicadores do Período: Entradas (`+ R$ 2.683,00`), Saídas (`- R$ 2.676,73`), Gastos no Débito, Pagamento de Fatura.
    - Tabela de Itens Extraídos com filtros por categoria e checkboxes individuais para o usuário aprovar cada item.
  - **Ação de Gravação:** Botão `Confirmar e Gravar Gastos` que envia os itens selecionados para a rota de criação de despesas (`POST /api/credit-cards/{id}/expenses` ou gravação em lote).

---

## 3. Implementation Plan Breakdown
- [ ] **Task 1:** Criar módulo backend `server/utils/statement_parser.py` com suporte robusto a PDF (PyMuPDF), Excel (pandas) e Word (python-docx).
- [ ] **Task 2:** Criar rota `POST /api/statements/parse` em `server/routes/statement_import.py` e registrar em `server/backend.py`.
- [ ] **Task 3:** Criar componente de UI `StatementImportModal.tsx` no frontend com design premium (anti-slop, suporte a modo claro/escuro harmonizado).
- [ ] **Task 4:** Conectar botão em `CreditCardsTab.tsx` para abrir o modal de importação e vincular com a API de gravação.
- [ ] **Task 5:** Validação end-to-end com o arquivo real `NU_469900485_01SET2025_30SET2025.pdf` e testes de precisão.
