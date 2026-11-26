"""
server/domain/portfolio/ledger_replay.py
Motor contábil único para reconstrução cronológica de posição (AssetTransaction + CorporateEvent).
Garante invariante único entre compras/vendas, deleção/edição retroativa, IRPF e agenda de dividendos.
"""
from __future__ import annotations

import math
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable


_ZERO = Decimal("0.0")
_EPS = Decimal("0.0001")


def _to_decimal(val: Any) -> Decimal:
    if isinstance(val, Decimal):
        return val
    if val is None:
        return _ZERO
    return Decimal(str(val))


def _to_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val.split(" ")[0][:10])
        except ValueError:
            return None
    return None


def _is_fractional_auction_sell(tx: Any, last_event_tx_by_ce: dict[int, tuple[Any, bool]]) -> bool:
    ce_id = getattr(tx, "corporate_event_id", None)
    if not ce_id or ce_id not in last_event_tx_by_ce:
        return False
    _ev_tx, already_floored = last_event_tx_by_ce[ce_id]
    return bool(already_floored)


def replay_position_transactions(
    transactions: Iterable[Any],
    corp_events_by_id: dict[int, Any] | None = None,
) -> tuple[Decimal, Decimal]:
    """
    Reexecuta em ordem cronológica todas as transações de uma posição.
    - Atualiza `tx.cost_basis` nas vendas (`SELL`).
    - Quando `corp_events_by_id` é informado, recalcula quantidades/PM de eventos downstream
      (`SPLIT`, `INPLIT`, `BONUS`, `AMORTIZATION`, `SPIN_OFF`) a partir da posição corrente.
    - Evita dupla subtração de frações em leilões legados cuja transação `SPLIT`/`INPLIT`/`BONUS`
      já tenha armazenado quantidade arredondada para baixo.
    """
    tx_list = list(transactions or [])
    tx_list.sort(
        key=lambda t: (
            _to_date(getattr(t, "transaction_date", None)) or date.min,
            int(getattr(t, "id", 0) or 0),
        )
    )

    running_qty = _ZERO
    running_pm = _ZERO
    last_event_tx_by_ce: dict[int, tuple[Any, bool]] = {}

    for tx in tx_list:
        t_type = (getattr(tx, "type", None) or "").upper()
        qty = _to_decimal(getattr(tx, "quantity", 0))
        unit_price = _to_decimal(getattr(tx, "unit_price", 0))
        total_val_raw = _to_decimal(getattr(tx, "total_value", 0))
        ce_id = getattr(tx, "corporate_event_id", None)
        ce = corp_events_by_id.get(ce_id) if (corp_events_by_id and ce_id) else None

        if t_type in ("BUY", "TICKER_CHANGE_IN", "SPIN_OFF_RECEIPT"):
            eff_total = total_val_raw if total_val_raw > _ZERO else (qty * unit_price)
            new_qty = running_qty + qty
            if new_qty > _ZERO:
                running_pm = ((running_qty * running_pm) + eff_total) / new_qty
            running_qty = new_qty

        elif t_type == "SELL":
            tx.cost_basis = running_pm
            if _is_fractional_auction_sell(tx, last_event_tx_by_ce):
                # Transação do evento corporativo já gravou a quantidade arredondada (legado):
                # mantém cost_basis correto para DARF sem subtrair a fração uma segunda vez.
                continue
            running_qty -= qty
            if running_qty <= _EPS:
                running_qty = _ZERO
                running_pm = _ZERO

        elif t_type == "DEPOSIT":
            if running_qty <= _ZERO:
                running_qty = qty if qty > _ZERO else Decimal("1.0")
            else:
                running_qty = qty if qty > _ZERO else running_qty
            eff_total = total_val_raw if total_val_raw > _ZERO else unit_price
            running_pm += eff_total

        elif t_type == "WITHDRAW":
            running_qty = qty if qty > _ZERO else running_qty
            eff_total = total_val_raw if total_val_raw > _ZERO else unit_price
            running_pm = max(_ZERO, running_pm - eff_total)

        elif t_type in ("SPLIT", "INPLIT", "BONUS"):
            already_floored = False
            if ce is not None:
                if t_type == "SPLIT":
                    factor = _to_decimal(getattr(ce, "factor", 1) or 1)
                    if factor > _ZERO:
                        raw_new_qty = running_qty * factor
                        new_pm = running_pm / factor
                    else:
                        raw_new_qty, new_pm = running_qty, running_pm
                elif t_type == "INPLIT":
                    factor = _to_decimal(getattr(ce, "factor", 1) or 1)
                    if factor > _ZERO:
                        raw_new_qty = running_qty / factor
                        new_pm = running_pm * factor
                    else:
                        raw_new_qty, new_pm = running_qty, running_pm
                else:  # BONUS
                    pct = _to_decimal(getattr(ce, "percent", 0) or 0)
                    u_cost = _to_decimal(getattr(ce, "unit_cost", 0) or 0)
                    added_qty = running_qty * (pct / Decimal("100"))
                    raw_new_qty = running_qty + added_qty
                    new_pm = (
                        ((running_qty * running_pm) + (added_qty * u_cost)) / raw_new_qty
                        if raw_new_qty > _ZERO
                        else running_pm
                    )

                has_auction_sell = ce_id is not None and any(
                    getattr(o, "corporate_event_id", None) == ce_id
                    and (getattr(o, "type", "") or "").upper() == "SELL"
                    for o in tx_list
                )
                if has_auction_sell:
                    running_qty = raw_new_qty
                    running_pm = new_pm
                    tx.quantity = raw_new_qty
                    tx.unit_price = new_pm
                    already_floored = False
                else:
                    floored_qty = Decimal(math.floor(raw_new_qty)) if (raw_new_qty - Decimal(math.floor(raw_new_qty))) > _ZERO else raw_new_qty
                    if floored_qty > _ZERO and floored_qty != raw_new_qty:
                        # Preserva 100% do custo nas cotas inteiras restantes quando não houve leilão
                        running_pm = (raw_new_qty * new_pm) / floored_qty
                    else:
                        running_pm = new_pm
                    running_qty = floored_qty
                    tx.quantity = floored_qty
                    tx.unit_price = running_pm
                    already_floored = False
            else:
                running_qty = qty
                running_pm = unit_price
                already_floored = (qty == Decimal(math.floor(qty))) if qty > _ZERO else False

            if ce_id is not None:
                last_event_tx_by_ce[ce_id] = (tx, already_floored)

        elif t_type == "AMORTIZATION":
            if ce is not None and getattr(ce, "unit_cost", None) is not None and running_qty > _ZERO:
                amort_ps = _to_decimal(ce.unit_cost)
                running_pm = max(_ZERO, running_pm - amort_ps)
                tx.quantity = running_qty
                tx.unit_price = running_pm
                tx.total_value = running_qty * amort_ps
            else:
                running_qty = qty
                running_pm = unit_price

        elif t_type == "SPIN_OFF":
            if ce is not None and getattr(ce, "cost_percent", None) is not None and running_qty > _ZERO:
                pct = _to_decimal(ce.cost_percent) / Decimal("100")
                running_pm = max(_ZERO, running_pm * (Decimal("1") - pct))
                tx.quantity = running_qty
                tx.unit_price = running_pm
            else:
                running_qty = qty
                running_pm = unit_price

        elif t_type == "ADJUSTMENT":
            running_qty = qty
            running_pm = unit_price

        elif t_type == "TICKER_CHANGE_OUT":
            running_qty = _ZERO
            running_pm = _ZERO

    return running_qty, running_pm


def compute_qty_at_date(
    txs: Iterable[Any],
    target_date: date,
    fallback_qty: float = 0.0,
) -> float:
    """Reconstrói a quantidade exata detida em `target_date` respeitando todos os eventos corporativos."""
    tx_list = list(txs or [])
    if not tx_list:
        return fallback_qty

    tx_list.sort(
        key=lambda t: (
            _to_date(getattr(t, "transaction_date", None)) or date.min,
            int(getattr(t, "id", 0) or 0),
        )
    )

    running = 0.0
    ce_event_floored: dict[int, bool] = {}
    for tx in tx_list:
        tx_dt = _to_date(getattr(tx, "transaction_date", None))
        if tx_dt and tx_dt > target_date:
            break
        t_type = (getattr(tx, "type", None) or "").upper()
        q = float(getattr(tx, "quantity", 0) or 0.0)
        ce_id = getattr(tx, "corporate_event_id", None)

        if t_type in ("BUY", "TICKER_CHANGE_IN", "SPIN_OFF_RECEIPT"):
            running += q
        elif t_type == "SELL":
            if ce_id and ce_event_floored.get(ce_id):
                continue
            running = max(0.0, running - q)
        elif t_type in ("SPLIT", "INPLIT", "BONUS"):
            running = q
            if ce_id:
                ce_event_floored[ce_id] = abs(q - round(q)) < 1e-6
        elif t_type in ("ADJUSTMENT", "SPIN_OFF"):
            running = q
        elif t_type == "TICKER_CHANGE_OUT":
            running = 0.0

    return round(max(0.0, running), 4)
