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
    with patch('db.models.safe_commit', return_value=None):
        with patch('feedparser.parse') as mock_feed:
            mock_feed.return_value = MagicMock(entries=[])
            response = client.get('/api/news/daily-summary')
            assert response.status_code == 200

def test_delete_transaction_endpoint(client):
    with patch('routes.assets.service.delete_transaction', return_value=True):
        response = client.delete('/api/asset-transactions/999')
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "Sucesso"


def test_scheduler_jobs_list_and_validation(client):
    from db.models import ScheduledJob, safe_commit
    from db.session import Session

    with Session() as s:
        job = s.query(ScheduledJob).first()
        if not job:
            job = ScheduledJob(
                name="scheduled_test_job",
                description="Test job",
                job_type="interval",
                interval_minutes=15,
                is_active=True,
            )
            s.add(job)
            safe_commit(s)
        job_id = job.id

    res = client.get('/api/scheduler/jobs')
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["status"] == "Sucesso"
    assert "worker" in payload
    assert any("next_run_at" in j for j in payload["data"])

    bad_cron = client.put(f'/api/scheduler/jobs/{job_id}', json={
        "job_type": "cron",
        "cron_expression": "invalid cron",
    })
    assert bad_cron.status_code == 400

    bad_int = client.put(f'/api/scheduler/jobs/{job_id}', json={
        "job_type": "interval",
        "interval_minutes": 0,
    })
    assert bad_int.status_code == 400
