"""
db/models/__init__.py
Módulo unificado de modelos ORM do SQLAlchemy.
Re-exporta todas as entidades para manter compatibilidade retroativa total.
"""
from db.session import Session, engine
from db.models.base import Base, safe_commit, get_active_positions, set_sqlite_pragmas
from db.models.auth import User, TaxProfile
from db.models.portfolio import (
    Category,
    Asset,
    Position,
    AssetTransaction,
    CorporateEvent,
    Dividend,
    PortfolioSnapshot,
    MonthlyPortfolioSnapshot,
    SignalSnapshot,
)
from db.models.financials import (
    RefundConfig,
    Debtor,
    ReceivableLoan,
    LoanInstallment,
    PaymentTransaction,
    FixedIncome,
)
from db.models.system import (
    MarketData,
    PriceAlert,
    SyncState,
    SystemCache,
    AIChatHistory,
    TriggeredAlert,
    ScheduledJob,
    update_sync_state_db,
    get_sync_state_db,
    get_sync_states_batch_db,
    DatabaseStateProxy,
    init_db,
)
from db.models.valuation import MarketScreenerItem, WatchlistItem
from db.models.signals import (
    PriceHistoryDaily,
    FundamentalSnapshot,
    MarketRegimeDaily,
    SignalSetupStat,
    SignalLedger,
    SignalOutcome,
)

__all__ = [
    "Session",
    "engine",
    "Base",
    "safe_commit",
    "get_active_positions",
    "set_sqlite_pragmas",
    "User",
    "TaxProfile",
    "Category",
    "Asset",
    "Position",
    "AssetTransaction",
    "CorporateEvent",
    "Dividend",
    "PortfolioSnapshot",
    "MonthlyPortfolioSnapshot",
    "SignalSnapshot",
    "RefundConfig",
    "Debtor",
    "ReceivableLoan",
    "LoanInstallment",
    "PaymentTransaction",
    "FixedIncome",
    "MarketData",
    "PriceAlert",
    "SyncState",
    "SystemCache",
    "AIChatHistory",
    "TriggeredAlert",
    "ScheduledJob",
    "MarketScreenerItem",
    "WatchlistItem",
    "PriceHistoryDaily",
    "FundamentalSnapshot",
    "MarketRegimeDaily",
    "SignalSetupStat",
    "SignalLedger",
    "SignalOutcome",
    "update_sync_state_db",
    "get_sync_state_db",
    "get_sync_states_batch_db",
    "DatabaseStateProxy",
    "init_db",
]
