import pytest
from backend import app

from unittest.mock import patch

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with patch('routes.auth.verify_session_token', return_value={"user_id": 1, "username": "teste"}):
        with app.test_client() as client:
            client.set_cookie('assetflow_session', 'mocked_session_token')
            yield client

def test_health_endpoint(client):
    # O health check verifica o SQLite, o Ollama e o Yahoo
    # Esse teste valida o formato de resposta
    response = client.get('/api/health')
    assert response.status_code in [200, 503]
    
    data = response.get_json()
    assert "status" in data
    assert "services" in data
    assert "database" in data["services"]

def test_sync_status_endpoint(client):
    response = client.get('/api/sync-status')
    assert response.status_code == 200
    
    data = response.get_json()
    assert "status" in data
    assert "message" in data

def test_market_indices_endpoint(client):
    response = client.get('/api/market/indices')
    assert response.status_code == 200
    
    data = response.get_json()
    assert "ibov" in data
    assert "ifix" in data

def test_sector_exposure_endpoint(client):
    response = client.get('/api/simulation/exposure')
    assert response.status_code == 200

def test_daily_summary_endpoint(client):
    from unittest.mock import MagicMock
    with patch('database.models.safe_commit', return_value=None):
        with patch('feedparser.parse') as mock_feed:
            mock_feed.return_value = MagicMock(entries=[])
            response = client.get('/api/news/daily-summary')
            assert response.status_code == 200
