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
)
from db.models.financials import (
    RefundConfig,
    Debtor,
    ReceivableLoan,
    LoanInstallment,
    PaymentTransaction,
    CreditCard,
    CardExpense,
    CardInstallment,
    FixedIncome,
)
from db.models.system import (
    MarketData,
    AuditLog,
    PriceAlert,
    SyncState,
    SystemCache,
    AIChatHistory,
    TriggeredAlert,
    ScheduledJob,
    update_sync_state_db,
    get_sync_state_db,
    DatabaseStateProxy,
    init_db,
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
    "RefundConfig",
    "Debtor",
    "ReceivableLoan",
    "LoanInstallment",
    "PaymentTransaction",
    "CreditCard",
    "CardExpense",
    "CardInstallment",
    "FixedIncome",
    "MarketData",
    "AuditLog",
    "PriceAlert",
    "SyncState",
    "SystemCache",
    "AIChatHistory",
    "TriggeredAlert",
    "ScheduledJob",
    "update_sync_state_db",
    "get_sync_state_db",
    "DatabaseStateProxy",
    "init_db",
]
