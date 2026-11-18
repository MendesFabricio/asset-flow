from datetime import datetime
from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from db.models.base import Base


class MarketScreenerItem(Base):
    """Snapshot em cache de fundamentos, preços-teto e checklist de ativos da B3."""

    __tablename__ = "market_screener_items"

    ticker = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    asset_type = Column(String, nullable=False, default="Ação", index=True)
    sector = Column(String, nullable=True, index=True)

    price = Column(Float, default=0.0)
    change_percent = Column(Float, nullable=True)
    dy_12m = Column(Float, nullable=True)
    dy_avg_5y = Column(Float, nullable=True)
    dividend_per_share = Column(Float, nullable=True)

    lpa = Column(Float, nullable=True)
    vpa = Column(Float, nullable=True)
    pl = Column(Float, nullable=True)
    pvp = Column(Float, nullable=True)
    roe = Column(Float, nullable=True)
    roic = Column(Float, nullable=True)
    net_margin = Column(Float, nullable=True)
    ebitda_margin = Column(Float, nullable=True)
    ev_ebitda = Column(Float, nullable=True)
    debt_to_ebitda = Column(Float, nullable=True)
    payout = Column(Float, nullable=True)
    fcf_per_share = Column(Float, nullable=True)

    bazin_price = Column(Float, nullable=True)
    graham_price = Column(Float, nullable=True)
    gordon_price = Column(Float, nullable=True)
    dcf_price = Column(Float, nullable=True)

    quality_score = Column(Integer, default=0)
    magic_score = Column(Float, nullable=True)
    checklist_json = Column(JSON, nullable=True)
    raw_metrics_json = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.now, index=True)

    def to_dict(self) -> dict:
        """Converte o registro do screener em dicionário pronto para serialização JSON."""
        margin_bazin = (
            round(((self.bazin_price - self.price) / self.price) * 100.0, 2)
            if self.bazin_price and self.price and self.price > 0
            else None
        )
        margin_graham = (
            round(((self.graham_price - self.price) / self.price) * 100.0, 2)
            if self.graham_price and self.price and self.price > 0
            else None
        )
        return {
            "ticker": self.ticker,
            "name": self.name or self.ticker,
            "asset_type": self.asset_type,
            "sector": self.sector or "Outros",
            "price": round(self.price or 0.0, 2),
            "change_percent": round(self.change_percent, 2) if self.change_percent is not None else None,
            "dy_12m": round(self.dy_12m, 2) if self.dy_12m is not None else None,
            "dy_avg_5y": round(self.dy_avg_5y, 2) if self.dy_avg_5y is not None else None,
            "dividend_per_share": round(self.dividend_per_share, 4) if self.dividend_per_share is not None else None,
            "lpa": round(self.lpa, 4) if self.lpa is not None else None,
            "vpa": round(self.vpa, 4) if self.vpa is not None else None,
            "pl": round(self.pl, 2) if self.pl is not None else None,
            "pvp": round(self.pvp, 2) if self.pvp is not None else None,
            "roe": round(self.roe, 2) if self.roe is not None else None,
            "roic": round(self.roic, 2) if self.roic is not None else None,
            "net_margin": round(self.net_margin, 2) if self.net_margin is not None else None,
            "ebitda_margin": round(self.ebitda_margin, 2) if self.ebitda_margin is not None else None,
            "ev_ebitda": round(self.ev_ebitda, 2) if self.ev_ebitda is not None else None,
            "debt_to_ebitda": round(self.debt_to_ebitda, 2) if self.debt_to_ebitda is not None else None,
            "payout": round(self.payout, 2) if self.payout is not None else None,
            "fcf_per_share": round(self.fcf_per_share, 4) if self.fcf_per_share is not None else None,
            "bazin_price": round(self.bazin_price, 2) if self.bazin_price is not None else None,
            "graham_price": round(self.graham_price, 2) if self.graham_price is not None else None,
            "gordon_price": round(self.gordon_price, 2) if self.gordon_price is not None else None,
            "dcf_price": round(self.dcf_price, 2) if self.dcf_price is not None else None,
            "margin_bazin_pct": margin_bazin,
            "margin_graham_pct": margin_graham,
            "quality_score": int(self.quality_score or 0),
            "magic_score": round(self.magic_score, 2) if self.magic_score is not None else None,
            "checklist": self.checklist_json or [],
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class WatchlistItem(Base):
    """Lista de observação (radar pessoal) de ativos fora ou dentro da carteira."""

    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker = Column(String, nullable=False, index=True)
    desired_bazin_dy = Column(Float, default=6.0)
    target_price = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "ticker", name="_user_watchlist_ticker_uc"),
    )
