from sqlalchemy import Column, Integer, String, Float, Numeric, ForeignKey, DateTime, Date, Boolean, Index, text, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from db.models.base import Base

class Category(Base):
    __tablename__ = 'categories'
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    target_percent = Column(Numeric(18, 4), default=0.0)
    assets = relationship("Asset", back_populates="category")

class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    ticker = Column(String, unique=True, nullable=False, index=True)
    name = Column(String)
    cnpj = Column(String, nullable=True)
    cvm_code = Column(String, nullable=True)
    currency = Column(String, default="BRL")
    
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=False, index=True) 
    
    category = relationship("Category", back_populates="assets")
    positions = relationship("Position", back_populates="asset", cascade="all, delete-orphan")
    market_data = relationship("MarketData", back_populates="asset", cascade="all, delete-orphan")
    dividends = relationship("Dividend", back_populates="asset", cascade="all, delete-orphan")
    fixed_incomes = relationship("FixedIncome", back_populates="asset", cascade="all, delete-orphan")

    ai_summary = Column(String, nullable=True)
    ai_sentiment = Column(String, nullable=True)
    ai_status = Column(String, default="idle")
    ai_updated_at = Column(DateTime, nullable=True)
    upcoming_split = Column(String, nullable=True)
    
    credit_rating = Column(String, nullable=True)
    duration_years = Column(Float, nullable=True)
    indexer_cdi_pct = Column(Float, nullable=True)
    indexer_ipca_pct = Column(Float, nullable=True)

class Position(Base):
    __tablename__ = 'positions'
    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    quantity = Column(Numeric(18, 4), default=0.0)
    average_price = Column(Numeric(18, 4), default=0.0)
    target_percent = Column(Numeric(18, 4), default=0.0)
    manual_lpa = Column(Numeric(18, 4), nullable=True)
    manual_vpa = Column(Numeric(18, 4), nullable=True)
    manual_dy = Column(Numeric(18, 4), nullable=True)

    last_report_url = Column(String, nullable=True)
    last_report_at = Column(String, nullable=True) 
    last_report_type = Column(String, nullable=True)
    
    asset = relationship("Asset", back_populates="positions")
    user = relationship("User", back_populates="positions")
    transactions = relationship("AssetTransaction", back_populates="position", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('asset_id', 'user_id', name='_asset_user_uc'),
        Index('idx_positions_user_asset', 'user_id', 'asset_id'),
    )

class AssetTransaction(Base):
    __tablename__ = 'asset_transactions'
    id = Column(Integer, primary_key=True)
    position_id = Column(Integer, ForeignKey('positions.id', ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    ticker = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False) # "BUY" / "SELL"
    quantity = Column(Numeric(18, 4), nullable=False)
    unit_price = Column(Numeric(18, 4), nullable=False)
    total_value = Column(Numeric(18, 4), nullable=False)
    cost_basis = Column(Numeric(18, 4), nullable=True)
    is_day_trade = Column(Boolean, default=False)
    transaction_date = Column(DateTime, default=datetime.now)
    created_at = Column(DateTime, default=datetime.now)
    is_option = Column(Boolean, default=False)
    option_meta = Column(JSON, nullable=True)
    
    corporate_event_id = Column(Integer, ForeignKey('corporate_events.id', ondelete="SET NULL"), nullable=True, index=True)

    position = relationship("Position", back_populates="transactions")
    user = relationship("User")
    corporate_event = relationship("CorporateEvent", back_populates="transactions")

    __table_args__ = (
        Index('idx_txs_user_pos', 'user_id', 'position_id'),
        Index('idx_txs_user_date_desc', 'user_id', text('transaction_date DESC')),
    )

class CorporateEvent(Base):
    __tablename__ = 'corporate_events'
    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    type = Column(String, nullable=False)
    factor = Column(Numeric(18, 4), nullable=True)
    percent = Column(Numeric(18, 4), nullable=True)
    unit_cost = Column(Numeric(18, 4), nullable=True)
    new_ticker = Column(String, nullable=True)
    received_qty = Column(Numeric(18, 4), nullable=True)
    date = Column(Date, default=datetime.now, index=True)
    source = Column(String, default="manual")
    cost_percent = Column(Numeric(18, 4), nullable=True)
    raw_data = Column(JSON, nullable=True)
    
    asset = relationship("Asset")
    user = relationship("User")
    transactions = relationship("AssetTransaction", back_populates="corporate_event")

class Dividend(Base):
    __tablename__ = 'dividends'
    id = Column(Integer, primary_key=True)
    
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    date_com = Column(Date, nullable=False, index=True)
    
    date_payment = Column(Date, nullable=True)
    type = Column(String, default="Dividendo")
    value_per_share = Column(Numeric(18, 4), nullable=False) 
    quantity_at_date = Column(Numeric(18, 4), nullable=False) 
    total_value = Column(Numeric(18, 4), nullable=False) 
    status = Column(String, default="GARANTIDO") 
    
    asset = relationship("Asset", back_populates="dividends")
    user = relationship("User", back_populates="dividends")

    __table_args__ = (
        Index('idx_dividends_asset_date_com', 'asset_id', 'date_com'),
        Index('idx_dividends_asset_date_com_desc', 'asset_id', text('date_com DESC')),
        UniqueConstraint('user_id', 'asset_id', 'date_payment', 'type', 'total_value', name='_dividend_unique_uc'),
    )

class PortfolioSnapshot(Base):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    date = Column(Date, default=datetime.now, index=True)
    
    total_equity = Column(Numeric(18, 4))      
    total_invested = Column(Numeric(18, 4))    
    profit = Column(Numeric(18, 4))   
    
    breakdown = Column(String, nullable=True)

    user = relationship("User", back_populates="portfolio_snapshots")

class MonthlyPortfolioSnapshot(Base):
    __tablename__ = 'monthly_portfolio_snapshot'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    
    total_invested_cost = Column(Numeric(18, 4), nullable=False)
    total_market_value = Column(Numeric(18, 4), nullable=False)
    realized_pnl = Column(Numeric(18, 4), default=0.00)
    unrealized_pnl = Column(Numeric(18, 4), default=0.00)
    
    asset_performance = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint('user_id', 'year', 'month', name='_user_year_month_uc'),
    )
