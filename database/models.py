from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Date, event
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.engine import Engine # Importante para o evento
from datetime import datetime

Base = declarative_base()

# 👇 1. O SEGREDO: Isso liga o "Fiscal" do SQLite
# Toda vez que conectar no banco, ele ativa a regra de Cascata.
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
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=False) # Categoria é obrigatória
    
    category = relationship("Category", back_populates="assets")
    
    # O Cascade aqui instrui o SQLAlchemy (Python)
    position = relationship("Position", uselist=False, back_populates="asset", cascade="all, delete-orphan")
    market_data = relationship("MarketData", back_populates="asset", cascade="all, delete-orphan")
    dividends = relationship("Dividend", back_populates="asset", cascade="all, delete-orphan")

class Position(Base):
    __tablename__ = 'positions'
    id = Column(Integer, primary_key=True)
    
    # 👇 2. PROIBIR ORFÃOS: nullable=False obriga a ter um pai.
    # ondelete="CASCADE" instrui o Banco de Dados (SQL)
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
    
    # 👇 Mesma proteção aqui: Se o ativo sumir, o histórico deleta junto
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False)
    
    date = Column(Date, default=datetime.now)
    price = Column(Float)
    min_6m = Column(Float)
    change_percent = Column(Float, default=0.0)
    rsi_14 = Column(Float, nullable=True)
    sma_20 = Column(Float, nullable=True)
    
    asset = relationship("Asset", back_populates="market_data")

class Dividend(Base):
    __tablename__ = 'dividends'
    id = Column(Integer, primary_key=True)
    
    # Proteção: Se o ativo sumir, o registro de dividendo é deletado (ondelete="CASCADE")
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False)
    
    date_com = Column(Date, nullable=False)  # Data-Com (Ex-date)
    date_payment = Column(Date, nullable=True)
    value_per_share = Column(Float, nullable=False) # Valor bruto por cota
    quantity_at_date = Column(Float, nullable=False) # Quantas cotas você tinha na data
    total_value = Column(Float, nullable=False) # Valor total bruto (valor * qtd)
    status = Column(String, default="GARANTIDO") # Status do registro
    
    asset = relationship("Asset", back_populates="dividends")

class PortfolioSnapshot(Base):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    date = Column(Date, default=datetime.now)
    total_equity = Column(Float)      
    total_invested = Column(Float)    
    profit = Column(Float)   

class Receivable(Base):
    __tablename__ = "receivables"

    id = Column(Integer, primary_key=True, index=True)
    descricao = Column(String)      # Ex: TV Sala
    devedor = Column(String)        # Ex: Pai
    valor_parcela = Column(Float)   # Ex: 100.00
    parcela_atual = Column(Integer) # Ex: 3
    total_parcelas = Column(Integer)# Ex: 10
    vencimento_dia = Column(Integer)# Ex: 10 (todo dia 10)
    status = Column(String)         # 'Pendente', 'Pago'         

# Configuração do Banco
engine = create_engine('sqlite:///assetflow.db', echo=False)
Session = sessionmaker(bind=engine)

def init_db():
    Base.metadata.create_all(engine)
