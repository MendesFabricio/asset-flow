# Relatório de Auditoria e Plano de Limpeza de Código Morto — AssetFlow

> Auditoria abrangente de código morto (funções/variáveis/imports não usados e arquivos obsoletos), com grafo de imports rastreado a partir dos pontos de entrada e verificação repo-wide (excluindo `node_modules`/`.next`). Re-verificada por scan automatizado de nomes de arquivo/módulo com regex.

## 1. Metodologia
- **Pontos de entrada:** `app/page.tsx`, `app/layout.tsx`, `middleware.ts` (frontend) e `server/backend.py`, `server/worker.py` (backend).
- Para cada símbolo/arquivo: grep repo-wide + confirmação de ausência de referências externas.
- **Conclusão:** não há módulos/pacotes inteiros órfãos no backend; apenas 1 componente morto no frontend.

## 2. Relatório Categorizado dos Achados

### Categoria A — Arquivo morto (não referenciado em lugar nenhum)
| Arquivo | Evidência |
|---|---|
| `app/components/TradingHoursWidget.tsx` | `TradingHoursWidget` só existe na definição (`:5`); 0 imports/`dynamic(import)`. |

### Categoria B — Exports/imports TS não utilizados (frontend)
| Arquivo | Símbolo | Linha | Evidência |
|---|---|---|---|
| `app/utils.ts` | `COLORS` | 2 | Nunca importado. |
| `app/utils.ts` | `formatMoneyPrivate` | 8–11 | Definido e usado só internamente; não importado. |
| `app/utils.ts` | `getStatusColor` | 13–24 | Importado em `AssetRow.tsx:4` mas nunca chamado. |
| `app/components/AssetRow.tsx` | `getStatusColor` (no import) | 4 | Import morto (`getStatusBg` é usado em `:135`). |
| `app/types.ts` | `interface AssetMetrics` | 3–9 | Não importado. |
| `app/types.ts` | `interface FundamentalistData` | 72–91 | `ReportModal.tsx:14` define cópia local; esta não é importada. |
| `app/utils/apiClient.ts` | `obfuscatedStorage` | 40–67 | Sem import. |
| `app/components/RiskRadar.tsx` | `interface Alerta` | 14 | Type-only, uso apenas interno. |

### Categoria C — Símbolos mortos / imports não usados (backend Python)
| Arquivo | Símbolo | Linha | Evidência |
|---|---|---|---|
| `server/services_modules/cache_helper.py` | `CacheHelperService._fetch_price_history` | 11–12 | Wrapper nunca invocado; call sites usam `fetch_price_history` direto. |
| `server/domain/quant_engine.py` | `_align_prices_to_b3` (no import) | 9 | Símbolo nunca referenciado neste módulo. |

### Categoria D — Scripts de nível raiz obsoletos (sem wiring)
| Arquivo | Motivo |
|---|---|
| `check_db.py` | Backup hardcoded `assetflow_backup_2026-07-01.db`; SQL bruto; 0 referências. |
| `check_backup_05.py` | Backup hardcoded `2026-07-05`; `sqlite3` puro; 0 referências. |
| `restore_data.py` | Restore pontual de `dividends`; backup hardcoded; 0 referências. |
| `restore_from_05.py` | Wipe-and-restore do backup `2026-07-05`; hardcoded; 0 referências. |
| `restore_refunds.py` | **Obsoleto + quebrado**: lê tabela `receivables` já dropada pela migration `c330f6b5d746_add_refund_module.py`; importa `dateutil.relativedelta` ausente em `requirements.txt`. |
| `test_api.py` | Teste manual (`requests`/`json` vs `localhost:5328`); não integrado a pytest/CI. |
| `test_quant_isolation.py` | Teste manual; não integrado a pytest/CI. |

### Categoria E — Testes quebrados (`server/tests/`)
| Arquivo | Motivo |
|---|---|
| `test_fixed_income.py`, `test_quant.py`, `test_routes.py`, `test_ticker_helper.py` | Falham ao importar por falta de ajuste de `sys.path` (rodam da raiz). |
| `test_ai_automation.py`, `test_quant_advanced.py` | Ativos (manter). |

### Checagem de documentação
- Grep em todos os `*.md`: **nenhum** doc do projeto (`README.md`, `ROADMAP.md`, `server/README.md`, `app/README.md`, etc.) referencia os itens mortos — apenas o próprio plano os cita.

## 3. Plano de Limpeza (ação)

**Grupo 1 — Remoções seguras (risco zero)**
- [ ] Excluir `app/components/TradingHoursWidget.tsx`.
- [ ] `app/utils.ts`: remover `COLORS`, `formatMoneyPrivate`, `getStatusColor`.
- [ ] `app/components/AssetRow.tsx:4`: retirar `getStatusColor` do import.
- [ ] `app/types.ts`: remover `AssetMetrics` e `FundamentalistData`.
- [ ] `app/utils/apiClient.ts`: remover bloco `obfuscatedStorage` (`:40-67`).
- [ ] `app/components/RiskRadar.tsx`: remover export de `Alerta` (se não for API pública).
- [ ] `server/services_modules/cache_helper.py`: remover `_fetch_price_history` (`:11-12`).
- [ ] `server/domain/quant_engine.py:9`: remover `_align_prices_to_b3` do import.

**Grupo 2 — Scripts obsoletos de nível raiz**
- [ ] Excluir `check_db.py`, `check_backup_05.py`, `restore_data.py`, `restore_from_05.py`, `restore_refunds.py`, `test_api.py`, `test_quant_isolation.py`.

**Grupo 3 — Testes quebrados**
- [ ] Criar `server/tests/conftest.py` com `sys.path.insert(0, parent_dir)` para que os 4 arquivos rodem via `pytest` (decisão padrão; se preferir excluir, movê-los para o Grupo 2).

**Grupo 4 — Refactor opcional (não é código morto)**
- [ ] Unificar `def _get_current_user_id` duplicado em `domain/quant/{analysis,risk,correlation,monte_carlo,optimization,rebalance,projection}.py` num helper de `domain/quant/helpers.py`.

**Grupo 5 — Alinhamento de documentação**
- [ ] Re-grep em `*.md` por cada símbolo/arquivo removido (esperado: 0 referências).
- [ ] Atualizar `README.md`/`ROADMAP.md` se listarem scripts/estrutura afetada (atualmente não listam).
- [ ] Marcar este plano como concluído após a execução.

## 4. Decisões
- Remoções do Grupo 1 são de **risco zero** (símbolos confirmados sem referência externa).
- Scripts/testes dos Grupos 2–3 são utilitários one-off fora do build — exclusão não afeta runtime.
- **Não remover** `domain/quant/*.py` nem `quant_engine.py` (engine ativo).
- `_get_current_user_id` duplicado **não é código morto** → apenas Grupo 4 (opcional).

## 5. Riscos e Validação
- **Risco baixíssimo.** Remoção acidental seria capturada por `npm run build`/`npm run lint` e por `pytest`.
- Ao editar `app/types.ts`, manter `Asset`, `DashboardData`, `KellyData` e demais interfaces consumidas por `QuantDashboard`/`page.tsx`.
- **Pós-execução:** `npm run build` + `npm run lint` (0 erros); `python -m pytest server/tests` (suíte executa); re-grep repo-wide confirmando 0 referências para os símbolos do Grupo 1; confirmar que `backend.py` ainda registra os 18 blueprints.

## 6. Perguntas em aberto
- (Resolvida por padrão) Tratamento dos 4 testes quebrados = **corrigir via `conftest.py`**; se a preferência for **excluir**, movê-los do Grupo 3 para o Grupo 2.
