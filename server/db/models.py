"""
server/db/models.py
Arquivo de atalho e compatibilidade para o pacote modular db/models/

Todos os modelos ORM e funções utilitárias foram organizados por domínio em:
  - server/db/models/base.py        (Base, pragmas, listeners, safe_commit)
  - server/db/models/auth.py        (User, TaxProfile)
  - server/db/models/portfolio.py   (Category, Asset, Position, AssetTransaction, CorporateEvent, Dividend, PortfolioSnapshot, MonthlyPortfolioSnapshot)
  - server/db/models/financials.py  (RefundConfig, Debtor, ReceivableLoan, LoanInstallment, PaymentTransaction, CreditCard, CardExpense, CardInstallment, FixedIncome)
  - server/db/models/system.py      (MarketData, AuditLog, PriceAlert, SyncState, SystemCache, AIChatHistory, TriggeredAlert, ScheduledJob, init_db, DatabaseStateProxy)
"""
from db.models import (
    Session,
    engine,
    Base,
    safe_commit,
    get_active_positions,
    set_sqlite_pragmas,
    User,
    TaxProfile,
    Category,
    Asset,
    Position,
    AssetTransaction,
    CorporateEvent,
    Dividend,
    PortfolioSnapshot,
    MonthlyPortfolioSnapshot,
    RefundConfig,
    Debtor,
    ReceivableLoan,
    LoanInstallment,
    PaymentTransaction,
    CreditCard,
    CardExpense,
    CardInstallment,
    FixedIncome,
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
