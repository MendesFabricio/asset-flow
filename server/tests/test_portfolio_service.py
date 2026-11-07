import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from datetime import datetime

from services import PortfolioService
from db.models import Asset, Position, AssetTransaction, Category

@pytest.fixture
def service():
    srv = PortfolioService()
    # Mock current_user_id
    srv.current_user_id = 1
    return srv

@patch('services_modules.portfolio.Session')
def test_add_new_asset_success(mock_session_cls, service):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session

    # Mock no existing asset
    mock_session.query.return_value.filter_by.return_value.first.side_effect = [
        None,  # Asset not found
        MagicMock(id=1, name='Ação'),  # Category found
        None,  # Position not found
    ]

    res = service.add_new_asset("PETR4", "Ação", 100, 35.50, 5)

    assert "adicionado com sucesso" in res
    assert mock_session.add.call_count == 3  # Asset, Position, Transaction
    mock_session.flush.assert_called()

@patch('services_modules.portfolio.Session')
def test_add_new_asset_already_exists(mock_session_cls, service):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session

    mock_asset = MagicMock(id=1)
    mock_position = MagicMock(id=1, quantity=Decimal("100"), target_percent=Decimal("5"))

    mock_session.query.return_value.filter_by.return_value.first.side_effect = [
        mock_asset,  # Asset found
        mock_position,  # Position found
    ]

    with pytest.raises(ValueError, match="Ativo já existe na sua carteira!"):
        service.add_new_asset("PETR4", "Ação", 100, 35.50, 5)

@patch('services_modules.portfolio.safe_commit')
@patch('services_modules.portfolio.Session')
def test_add_transaction_buy(mock_session_cls, mock_commit, service):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_asset = MagicMock(id=1)
    mock_position = MagicMock(id=1, quantity=Decimal("100"), average_price=Decimal("10.0"))
    
    mock_session.query.return_value.filter_by.return_value.first.side_effect = [
        mock_asset,
        mock_position,
    ]
    mock_session.query.return_value.filter_by.return_value.filter.return_value.first.return_value = None # No duplicate
    
    res = service.add_transaction("PETR4", "BUY", 50, 15.0)
    
    assert "registrada com sucesso" in res
    # new qty = 150. Old total = 1000. New total = 750. Grand total = 1750. New PM = 1750 / 150 = 11.666...
    assert mock_position.quantity == Decimal("150")
    assert round(mock_position.average_price, 2) == Decimal("11.67")
    mock_session.add.assert_called_once() # Adds transaction

@patch('services_modules.portfolio.safe_commit')
@patch('services_modules.portfolio.Session')
def test_add_transaction_sell(mock_session_cls, mock_commit, service):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_asset = MagicMock(id=1)
    mock_position = MagicMock(id=1, quantity=Decimal("100"), average_price=Decimal("10.0"))
    
    mock_session.query.return_value.filter_by.return_value.first.side_effect = [
        mock_asset,
        mock_position,
    ]
    mock_session.query.return_value.filter_by.return_value.filter.return_value.first.return_value = None
    
    res = service.add_transaction("PETR4", "SELL", 50, 15.0)
    
    assert "registrada com sucesso" in res
    assert mock_position.quantity == Decimal("50")
    assert mock_position.average_price == Decimal("10.0") # PM doesn't change on SELL
    
    # Check if transaction was added with cost_basis
    tx_args = mock_session.add.call_args[0][0]
    assert tx_args.type == "SELL"
    assert tx_args.cost_basis == Decimal("10.0")

@patch('services_modules.portfolio.Session')
def test_add_transaction_sell_insufficient_qty(mock_session_cls, service):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_asset = MagicMock(id=1)
    mock_position = MagicMock(id=1, quantity=Decimal("50"), average_price=Decimal("10.0"))
    
    mock_session.query.return_value.filter_by.return_value.first.side_effect = [
        mock_asset,
        mock_position,
    ]
    mock_session.query.return_value.filter_by.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(ValueError, match="Quantidade de venda maior que a posição atual"):
        service.add_transaction("PETR4", "SELL", 100, 15.0)

@patch('services_modules.portfolio.safe_commit')
@patch('services_modules.portfolio.Session')
def test_corporate_action_split(mock_session_cls, mock_commit, service):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session
    
    mock_asset = MagicMock(id=1, category_id=1)
    mock_position = MagicMock(id=1, quantity=Decimal("100"), average_price=Decimal("10.0"))
    
    mock_session.query.return_value.filter_by.return_value.first.side_effect = [
        mock_asset,
        mock_position,
    ]
    
    payload = {"factor": 2, "date": "2026-08-10T00:00:00Z"}
    res = service.add_corporate_action("PETR4", "SPLIT", payload)
    
    assert "sucesso" in res
    assert mock_position.quantity == Decimal("200")
    assert mock_position.average_price == Decimal("5.0")
