# Plano de Ajuste — Backend (`server/`) — Status de Verificação

Auditoria + implementação conferida em 2026-07-07. Cada item do plano original foi verificado
na fonte. Legenda: ✅ FEITO · ⚠️ PENDENTE · ✔️ OK (verificado, não é bug/by-design).

> Regra de escopo multiusuário: todo acesso a dados usa `.filter_by(user_id=g.user_id)` (o
> listener de query-time foi removido de `database/models.py`). Omissão = vazamento entre usuários.

---

## P0 — Bugs de runtime / vazamento de dados

| # | Arquivo | Local | Status | Nota |
|---|---------|-------|--------|------|
| 1 | `routes/news.py` | `get_daily_sector_summary` | ✅ FEITO | `from flask import request, g` adicionado (L139). |
| 2 | `services_modules/facades.py` + `domain/quant/exposure.py` + `quant_engine.py` | `calculate_sector_exposure` | ✅ FEITO | Implementado em `domain/quant/exposure.py`, exportado em `quant_engine.py:17`. (Obs: `exposure.py` importa `flask.g` — acoplamento de camada aceitável pois roda em contexto de request.) |
| 3 | `services.py` | `get_usd_rate` | ✅ FEITO | Agora usa `Session()` / `Session.remove()` (L70/117); vazamento de conexão corrigido. |
| 4 | `domain/quant/risk.py` | L135 | ✅ FEITO | `cum = np.exp(p.cumsum())` (corrige drawdown em log-returns). |
| 5 | `infrastructure/market_data.py` | `update_prices` L47–54 | ✅ FEITO | Trata `MultiIndex` e plano; fallback individual adicionado. |
| 6 | `routes/fixed_income.py` | GET/POST/PUT/DELETE | ✅ FEITO | Todas as queries com `user_id=g.user_id` (L95,97,102,104,111,113,131,160,167,182). |
| 7 | `routes/ai.py` | `execute_query_portfolio_metrics`, lookups, chat | ✅ FEITO | `user_id=g.user_id` em todos os lugares (L26,49,86,153,158,272,288,303). |
| 8 | `routes/alerts.py` | `get_alerts` L142 | ✅ FEITO | `CALENDAR_CACHE.get(g.user_id, {})`. |

## P1 — Segredos hardcoded / auth

| # | Arquivo | Local | Status | Nota |
|---|---------|-------|--------|------|
| 9 | `routes/auth.py` | `get_serializer` | ✅ FEITO | Usa `current_app.config["SECRET_KEY"]`; `RuntimeError` se ausente (fail-closed). |
| 10 | `routes/maintenance.py` | `backup_database` | ✅ FEITO | Exige `BACKUP_TOKEN`/`BASIC_AUTH_PASSWORD` (403 se ausente); caminho via `BACKUP_PATH`. |

## P2 — Código morto / imports não usados

| # | Arquivo | Local | Status |
|---|---------|-------|--------|
| 11 | `routes/simulation.py` | 12,13 | ✅ FEITO (imports `MarketData`/`_to_yf_ticker` removidos) |
| 12 | `routes/sync_stream.py` | 10 | ✅ FEITO (`get_sync_state_db` removido) |
| 13 | `services_modules/cache_helper.py` | `_extract_value` | ✅ FEITO (removido) |
| 14 | `services_modules/backup.py` | 5 | ✅ FEITO (só `date`) |
| 15 | `services_modules/facades.py` | 2,3 | ✅ FEITO (`logging`/`session_factory` removidos) |
| 16 | `services_modules/dashboard.py` | 5,8 | ✅ FEITO (`datetime`/`timedelta`/`Dividend` removidos) |
| 17 | `domain/quant/correlation.py` | 43–45,80 | ✅ FEITO (branch morto + import redundante removidos) |
| 18 | `domain/quant/optimization.py` | 255–265 | ✅ FEITO (cache morto `efficient_frontier_` removido) |
| 19 | `utils/name_finder.py` | `NameFinder` | ✅ FEITO (arquivo/classe removidos) |
| 20 | `utils/fii_processor.py` | `process_evolution` | ✅ FEITO (removido) |

## P3 — Robustez / suspicious / não finalizado

| # | Arquivo | Local | Status | Nota |
|---|---------|-------|--------|------|
| 21 | `services_modules/dashboard.py` | L108 | ✔️ OK | "Desconto de 6 Meses" recompensa estar ≤15% acima da mínima — heurística válida, só nomeamento. Não é bug. |
| 22a | `infrastructure/market_data.py` | `joinedload` | ✅ FEITO | Import movido p/ dentro da função (L126), sem morto. |
| 22b | `infrastructure/market_data.py` | L243,246 `raise Exception` | ⚠️ PENDENTE (baixa) | Genéricos abortam o job; aceitável por design, mas pode virar `RuntimeError`/erro específico. |
| 22c | `infrastructure/market_data.py` | L327,351 `k[0]` | ✔️ OK | Abreviação intencional (M/T/A/G de "mensal/trimestral/anual/gerencial"). Não é bug. |
| 23 | `utils/cnpj_finder.py` | L21,23,25 | ⚠️ PENDENTE | Bare `except:` (L23) + `print()` debugging ainda presentes. |
| 24 | `utils/cvm_finder.py` | L46 | ⚠️ PENDENTE | `print()` em vez de `logging`; baixa CSV inteiro da CVM a cada chamada (sem cache de parse). |
| 25 | `utils/fii_processor.py` | L34,117 | ⚠️ PENDENTE | Bare `except Exception: return None` (L34) e bare `except:` (L117) ainda engolem erros. |
| 26 | `crawlers/cvm_enet.py` | L2–3,5–6,119 | ⚠️ PENDENTE | Imports duplicados `requests`/`HTTPAdapter` e `import re` dentro do loop não removidos. |
| 27 | `utils/cvm_processor.py` | geral | ✔️ OK (perf) | O ZIP do ITR já é cacheado em disco (`CVM_CACHE_DIR`); parse por sync é só nuance de performance. |
| 28 | `domain/quant/helpers.py` | L16 | ✅ FEITO | Agora usa calendário `BVMF` (ações B3) em vez de `BMF`. |
| 29 | `domain/quant/projection.py` | L114 | ⚠️ PENDENTE (baixa) | Fallback stub `price * 0.05` (5% DY) quando não há histórico. Placeholder aceitável. |
| 30 | `domain/quant/risk.py` | L293–295 | ✅ FEITO | `resample('ME')` com fallback `resample('M')` p/ pandas <2.2. |
| 31 | `routes/credit_cards.py` | L94 | ✅ FEITO | `name_val = data.get('name')` com guard `if name_val is not None`. |
| 32 | `routes/assets.py` | L32 | ✅ FEITO | `current_price: Optional[float] = Field(default=None)`. |
| 33 | `routes/refunds.py` | L322,689 | ⚠️ PENDENTE (cosmético) | `log_audit(..., "status", "ABERTA", "ABERTA")` é no-op (old==new). Ruído no log de auditoria. |
| 34 | `services_modules/portfolio.py` | L53–54 | ✅ FEITO | `add_new_asset` unificou `ticker` (sem duplicação `raw_ticker`). |

---

## Pendências restantes (não foram ajustadas)

1. **`utils/cnpj_finder.py`** (item 23): trocar bare `except:` por `except Exception` + `logging`; substituir `print()` por `logging`.
2. **`utils/cvm_finder.py`** (item 24): `print()` → `logging`; considerar cache do CSV da CVM.
3. **`utils/fii_processor.py`** (item 25): `except Exception: return None` (L34) e bare `except:` (L117) → logar o erro em vez de engolir.
4. **`crawlers/cvm_enet.py`** (item 26): remover imports duplicados (L5–6); mover `import re` (L119) para o topo.
5. **`routes/refunds.py`** (item 33): remover/condicionar o `log_audit` no-op quando `old==new` (L322, L689).
6. **Baixa prioridade (opcional):** `market_data` `raise Exception` genéricos (22b); stub 5% DY em `projection` (29).

## Validação recomendada (não executada aqui)
- `python -m pytest server/tests` (test_quant*, test_routes, test_ai_automation, test_fixed_income, test_ticker_helper).
- `ruff`/`flake8` em `server/` para confirmar zero imports não usados (itens 11–16).
- Smoke test nos endpoints antes quebrados: `GET /api/news/daily-summary`, `GET /api/quant/*/sector-exposure`, atualização de preços (`update_prices`).
- `grep -rn "filter_by(id=" server/routes` para garantir que nenhum lookup por ID sem `user_id` reste (cobriu 6 e 7).
