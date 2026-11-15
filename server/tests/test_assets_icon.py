from unittest.mock import patch
from flask import Flask
from infrastructure.assets_icon import assets_icon_bp


def _make_app():
    app = Flask(__name__)
    app.register_blueprint(assets_icon_bp)
    return app


def test_icon_returns_brapi_svg_for_b3_ticker(tmp_path, monkeypatch):
    monkeypatch.setattr("infrastructure.assets_icon.ICONS_DIR", str(tmp_path))
    app = _make_app()
    client = app.test_client()

    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'
    with patch("infrastructure.assets_icon._lookup_asset_meta", return_value=("FII", "BTG Log", "BRL")), \
         patch("infrastructure.assets_icon._fetch_brapi_svg", return_value=(svg_bytes, "image/svg+xml")):
        resp = client.get("/api/assets/icon/BTLG11")

    assert resp.status_code == 200
    assert resp.mimetype == "image/svg+xml"
    assert b"<svg" in resp.data
    assert (tmp_path / "BTLG11.svg").exists()


def test_icon_resolves_caixinha_bank_domain_and_falls_back_to_svg_badge(tmp_path, monkeypatch):
    monkeypatch.setattr("infrastructure.assets_icon.ICONS_DIR", str(tmp_path))
    app = _make_app()
    client = app.test_client()

    with patch("infrastructure.assets_icon._lookup_asset_meta", return_value=("Reserva", "Nubank Caixinha", "BRL")), \
         patch("infrastructure.assets_icon._fetch_google_favicon", return_value=(b"\x89PNG\r\n\x1a\n" + b"0" * 400, "image/png")) as mock_fav:
        resp = client.get("/api/assets/icon/NUBANK%20CAIXINHA")

    assert resp.status_code == 200
    assert resp.mimetype == "image/png"
    mock_fav.assert_called_once_with("nubank.com.br")

    # Fallback when no external icon exists -> crisp category SVG badge
    with patch("infrastructure.assets_icon._lookup_asset_meta", return_value=("FII", "Riza Terrax", "BRL")), \
         patch("infrastructure.assets_icon._resolve_external_icon", return_value=None):
        resp2 = client.get("/api/assets/icon/RZAT11")

    assert resp2.status_code == 200
    assert resp2.mimetype == "image/svg+xml"
    assert b"RZAT" in resp2.data
    assert b"FII" in resp2.data
