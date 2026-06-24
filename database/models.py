from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Date, event, Index
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.engine import Engine 
from datetime import datetime

Base = declarative_base()

# 🛡️ Preservado: Ativa a checagem física de chaves estrangeiras no SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

class Category(Base):
    __tablename__ = 'categories'
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    target_percent = Column(Float, default=0.0)
    assets = relationship("Asset", back_populates="category")

class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    ticker = Column(String, unique=True, nullable=False)
    name = Column(String)
    cnpj = Column(String, nullable=True)
    cvm_code = Column(String, nullable=True)
    currency = Column(String, default="BRL")
    
    # ⚡ ÍNDICE: Acelera o filtro de ativos pertencentes a uma mesma categoria na tabela
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=False, index=True) 
    
    category = relationship("Category", back_populates="assets")
    position = relationship("Position", uselist=False, back_populates="asset", cascade="all, delete-orphan")
    market_data = relationship("MarketData", back_populates="asset", cascade="all, delete-orphan")
    dividends = relationship("Dividend", back_populates="asset", cascade="all, delete-orphan")

class Position(Base):
    __tablename__ = 'positions'
    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), unique=True, nullable=False)
    
    quantity = Column(Float, default=0.0)
    average_price = Column(Float, default=0.0)
    target_percent = Column(Float, default=0.0)
    manual_lpa = Column(Float, nullable=True)
    manual_vpa = Column(Float, nullable=True)
    manual_dy = Column(Float, nullable=True)

    last_report_url = Column(String, nullable=True)
    last_report_at = Column(String, nullable=True) 
    last_report_type = Column(String, nullable=True)
    
    asset = relationship("Asset", back_populates="position")

class MarketData(Base):
    __tablename__ = 'market_data'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Proteção para buscas isoladas
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=datetime.now, index=True)
    
    price = Column(Float)
    min_6m = Column(Float)
    change_percent = Column(Float, default=0.0)
    rsi_14 = Column(Float, nullable=True)
    sma_20 = Column(Float, nullable=True)
    
    asset = relationship("Asset", back_populates="market_data")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Multiplica a velocidade de geração do gráfico de cotações temporais
    __table_args__ = (
        Index('idx_market_data_asset_date', 'asset_id', 'date'),
    )

class Dividend(Base):
    __tablename__ = 'dividends'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Acelera o cálculo acumulado de proventos recebidos por ativo
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date_com = Column(Date, nullable=False, index=True)
    
    date_payment = Column(Date, nullable=True)
    value_per_share = Column(Float, nullable=False) 
    quantity_at_date = Column(Float, nullable=False) 
    total_value = Column(Float, nullable=False) 
    status = Column(String, default="GARANTIDO") 
    
    asset = relationship("Asset", back_populates="dividends")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Acelera a timeline do calendário de proventos/agenda do usuário
    __table_args__ = (
        Index('idx_dividends_asset_date_com', 'asset_id', 'date_com'),
    )

class PortfolioSnapshot(Base):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICE CRÍTICO: Executa a query do gráfico principal de evolução histórica instantaneamente
    date = Column(Date, default=datetime.now, index=True)
    
    total_equity = Column(Float)      
    total_invested = Column(Float)    
    profit = Column(Float)   

class Receivable(Base):
    __tablename__ = "receivables"

    id = Column(Integer, primary_key=True, index=True)
    descricao = Column(String)      
    devedor = Column(String)        
    valor_parcela = Column(Float)   
    parcela_atual = Column(Integer) 
    total_parcelas = Column(Integer)
    vencimento_dia = Column(Integer)
    status = Column(String)         

# Configuração do Banco
engine = create_engine('sqlite:///assetflow.db', echo=False)
Session = sessionmaker(bind=engine)

def init_db():
    Base.metadata.create_all(engine)
