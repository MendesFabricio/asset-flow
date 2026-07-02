import pytest
from backend import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
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
    response = client.get('/indices')
    assert response.status_code == 200
    
    data = response.get_json()
    assert "ibov" in data
    assert "ifix" in data
