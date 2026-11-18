# Valuation & Radar Suite (Adapta Valuer Inspiration)

Branch: `feature/valuation-radar-suite`

## Objetivo
Implementar no AssetFlow as funcionalidades de valuation fundamentalista, triagem de mercado B3, comparação e planejamento de renda passiva inspiradas no Adapta Valuer, reutilizando `CVMProcessor`, `tickers_cache.json`, `SystemCache`, `ModalShell` e os tokens semânticos de tema.

## Arquitetura & Entregas

1. **Domínio Puro de Valuation, Checklist & Fórmula Mágica (`server/domain/valuation/`)**
   - `calculator.py`: funções puras determinísticas para **Preço Teto Bazin** (`DY >= 6%` configurável), **Modelo de Gordon** (`P = D1 / (k - g)`), **DCF / FCD Simplificado** (projeção de FCL por 5–10 anos + perpetuidade via WACC/crescimento ajustáveis), **Checklist Fundamentalista** (Ação & FII com 6–7 critérios `pass | warn | fail` e **Score de Qualidade 0–100** separado do score de alocação), **Fórmula Mágica Greenblatt** (Earnings Yield + ROIC/ROE rank) e **Comparação com Média do Setor**.
   - Reaproveitar `calculate_fundamental_metrics` em `server/services_modules/dashboard_metrics.py` para expor `bazin_price`, `mg_bazin`, `gordon_price` e `quality_score` diretamente no dashboard e na tabela (`AssetIndicatorsCell`).

2. **Banco de Dados & Cache de Screener B3**
   - `server/db/models/valuation.py` (re-exportado em `server/db/models/__init__.py`) + migração Alembic (`down_revision = 'f1a2b3c4d5e6'`):
     - `MarketScreenerItem`: cache em SQLite dos ~107 papéis líquidos de `tickers_cache.json` (`Ação` + `FII`) + buscas avulsas (preço, DY, P/L, P/VP, ROE, ROIC, EV/EBITDA, margens, Dív.Líq/EBITDA, Bazin, Graham, Gordon, DCF, `quality_score`, `magic_score`, `sector`, `checklist_json`).
     - `WatchlistItem`: lista de observação por `user_id` (`ticker`, `target_dy`, `target_price`, `notes`).
   - `server/infrastructure/screener_service.py`: varredura em lote via `yfinance` + `CVMProcessor` (para `cvm_code` mapeados) com cálculo de médias setoriais e job opcional no `worker_jobs.py`.

3. **Simulador de Renda Passiva (Bola de Neve)**
   - `server/domain/quant/passive_income.py`: projeção mês a mês / ano a ano considerando patrimônio gerador atual, aporte mensal, DY médio esperado, crescimento real de dividendos/cotas e meta mensal (ex.: R$ 5.000/mês) com cálculo do prazo até independência.

4. **Rotas Backend (`server/routes/valuation.py`, registrada em `backend.py`)**
   - `GET /api/valuation/asset/<ticker>` (+ params `bazin_dy`, `discount_rate`, `growth_rate`, `terminal_growth` para recálculo interativo de Bazin/Gordon/DCF + Checklist + Média do Setor).
   - `GET /api/valuation/radar` & `POST /api/valuation/radar/refresh` (filtros: Dividendos, Barganha, Fórmula Mágica, FIIs, Setor, Busca avulsa via Yahoo para qualquer ticker da B3).
   - `GET /api/valuation/compare?tickers=A,B,C` (comparação lado a lado + correlação/setor).
   - `GET/POST/DELETE /api/valuation/watchlist`.
   - `POST /api/valuation/passive-income` (simulação da meta de dividendos).

5. **Frontend (`Análises & IA` + Tabela/Modal de Ativos)**
   - `NavigationTabs` / `useDashboardState` / `page.tsx` / `DashboardTabContent`: 3 novas abas em `Análises & IA`: **`Radar B3`** (`RadarTab.tsx` — Screener + Estratégias + Watchlist), **`Comparador`** (`ComparatorTab.tsx` — até 4 ativos lado a lado), **`Renda Passiva`** (`PassiveIncomeTab.tsx` — simulador Bola de Neve com `PrivacyContext`).
   - `AssetDetailsModal.tsx` & `AssetIndicatorsCell.tsx` & `AssetsTable.tsx`: adicionar **Preço Teto Bazin** + **Score de Qualidade** na tabela e painel interativo de **Preço Teto / DCF (sliders) + Checklist de Saúde + Média do Setor** dentro do modal de detalhes.

## Verificação
- `docker exec assetflow_backend_dev alembic upgrade head`
- `docker exec assetflow_backend_dev pytest -q` (incluindo novos testes em `server/tests/test_valuation.py` e `server/tests/test_valuation_routes.py`)
- `npx tsc --noEmit` & `npx vitest run`
- `graphify update .`
