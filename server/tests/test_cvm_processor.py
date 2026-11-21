import io
import os
import time
import zipfile
from datetime import datetime
from unittest.mock import MagicMock, patch

from utils.cvm_processor import CVMProcessor, _format_brl_compact


def _build_itr_zip(path: str, ano: int, files: dict[str, str]) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        for name, csv_content in files.items():
            zf.writestr(name, csv_content.encode("latin1"))


def test_cvm_processor_filters_ultimo_versao_escala_and_deaccumulates_dfc(tmp_path, monkeypatch):
    ano = datetime.now().year
    monkeypatch.setenv("CVM_CACHE_DIR", str(tmp_path))

    # Build 2 quarters (1T and 2T) for a standard company (026620)
    # Include PENULTIMO before ULTIMO, VERSAO 1 & 2, and 6M YTD + 3M standalone in 2T DRE.
    dre_csv = "\n".join([
        "CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;ESCALA_MOEDA;CD_CONTA;DS_CONTA;VL_CONTA",
        # 1T: PENULTIMO comes first (must be ignored)
        f"026620;{ano}-03-31;1;PENÚLTIMO;{ano-1}-01-01;{ano-1}-03-31;MIL;3.01;Receita de Venda;1000",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.01;Receita de Venda;2000",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.03;Resultado Bruto;600",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.05;Resultado Antes do Resultado Financeiro;300",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.06;Resultado Financeiro;-50",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.11;Lucro Consolidado;200",
        # 2T: VERSAO 1 vs VERSAO 2, and YTD vs 3M standalone
        f"026620;{ano}-06-30;1;ÚLTIMO;{ano}-04-01;{ano}-06-30;MIL;3.01;Receita de Venda;9999",
        f"026620;{ano}-06-30;2;ÚLTIMO;{ano}-01-01;{ano}-06-30;MIL;3.01;Receita de Venda;5000",
        f"026620;{ano}-06-30;2;ÚLTIMO;{ano}-04-01;{ano}-06-30;MIL;3.01;Receita de Venda;3000",
        f"026620;{ano}-06-30;2;ÚLTIMO;{ano}-04-01;{ano}-06-30;MIL;3.03;Resultado Bruto;900",
        f"026620;{ano}-06-30;2;ÚLTIMO;{ano}-04-01;{ano}-06-30;MIL;3.05;Resultado Antes do Resultado Financeiro;450",
        f"026620;{ano}-06-30;2;ÚLTIMO;{ano}-04-01;{ano}-06-30;MIL;3.06;Resultado Financeiro;-100",
        f"026620;{ano}-06-30;2;ÚLTIMO;{ano}-04-01;{ano}-06-30;MIL;3.11;Lucro Consolidado;250",
    ])

    bpa_csv = "\n".join([
        "CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;ESCALA_MOEDA;CD_CONTA;DS_CONTA;VL_CONTA",
        f"026620;{ano}-03-31;1;ÚLTIMO;MIL;1;Ativo Total;10000",
        f"026620;{ano}-03-31;1;ÚLTIMO;MIL;1.01.01;Caixa;1000",
        f"026620;{ano}-06-30;1;ÚLTIMO;MIL;1;Ativo Total;12000",
        f"026620;{ano}-06-30;1;ÚLTIMO;MIL;1.01.01;Caixa;1500",
        f"026620;{ano}-06-30;1;ÚLTIMO;MIL;1.01.02;Aplicações Financeiras;500",
    ])

    bpp_csv = "\n".join([
        "CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;ESCALA_MOEDA;CD_CONTA;DS_CONTA;VL_CONTA",
        f"026620;{ano}-03-31;1;ÚLTIMO;MIL;2.01.04;Empréstimos CP;500",
        f"026620;{ano}-03-31;1;ÚLTIMO;MIL;2.02.01;Empréstimos LP;2500",
        f"026620;{ano}-03-31;1;ÚLTIMO;MIL;2.03;Patrimônio Líquido Consolidado;5000",
        f"026620;{ano}-06-30;1;ÚLTIMO;MIL;2.01.04;Empréstimos CP;500",
        f"026620;{ano}-06-30;1;ÚLTIMO;MIL;2.02.01;Empréstimos LP;2500",
        f"026620;{ano}-06-30;1;ÚLTIMO;MIL;2.03;Patrimônio Líquido Consolidado;5500",
    ])

    # DFC is YTD in CVM: 1T FCO=400, 2T YTD FCO=1000 -> standalone 2T FCO = 600
    dfc_csv = "\n".join([
        "CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;ESCALA_MOEDA;CD_CONTA;DS_CONTA;VL_CONTA",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;6.01;Caixa Operacional;400",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;6.02;Investimentos;-100",
        f"026620;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;6.01.01.04;Depreciação;50",
        f"026620;{ano}-06-30;1;ÚLTIMO;{ano}-01-01;{ano}-06-30;MIL;6.01;Caixa Operacional;1000",
        f"026620;{ano}-06-30;1;ÚLTIMO;{ano}-01-01;{ano}-06-30;MIL;6.02;Investimentos;-250",
        f"026620;{ano}-06-30;1;ÚLTIMO;{ano}-01-01;{ano}-06-30;MIL;6.01.01.04;Depreciação;120",
    ])

    zip_path = tmp_path / f"itr_cia_aberta_{ano}.zip"
    _build_itr_zip(str(zip_path), ano, {
        f"itr_cia_aberta_DRE_con_{ano}.csv": dre_csv,
        f"itr_cia_aberta_BPA_con_{ano}.csv": bpa_csv,
        f"itr_cia_aberta_BPP_con_{ano}.csv": bpp_csv,
        f"itr_cia_aberta_DFC_MI_con_{ano}.csv": dfc_csv,
    })

    # Mock 404 for prior years not present in tmp_path
    with patch("utils.cvm_processor.requests.get", return_value=MagicMock(status_code=404)), \
         patch("utils.cvm_processor.requests.head", return_value=MagicMock(status_code=404)):
        dash = CVMProcessor.get_dashboard_data("026620")

    assert dash is not None
    assert dash["ticker_info"]["ultimo_periodo"] == f"2T{ano}"
    cards = {c["titulo"]: c for c in dash["cards_indicadores"]}
    # 3M standalone 2T scaled from MIL -> 3,000,000.0
    assert cards["Receita Líquida"]["valor"] == 3_000_000.0
    assert cards["Receita Líquida"]["qoq"] == 50.0
    assert cards["Margem Bruta"]["valor_formatado"] == "30.0%"
    # EBIT (450k) + standalone 2T Depreciação (120k - 50k = 70k) = 520k
    assert cards["EBITDA"]["valor"] == 520_000.0
    # Dívida Bruta (3M) - Caixa+Aplicações (2M) = 1M
    assert cards["Dívida Líquida"]["valor"] == 1_000_000.0
    # Standalone 2T FCO = 1000k - 400k = 600k; Capex = -250k - (-100k) = -150k; FCL = 450k
    assert cards["Fluxo Operacional (FCO)"]["valor"] == 600_000.0
    assert cards["Fluxo Caixa Livre (FCL)"]["valor"] == 450_000.0


def test_cvm_processor_handles_bank_accounts(tmp_path, monkeypatch):
    ano = datetime.now().year
    monkeypatch.setenv("CVM_CACHE_DIR", str(tmp_path))

    dre_csv = "\n".join([
        "CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;ESCALA_MOEDA;CD_CONTA;DS_CONTA;VL_CONTA",
        f"019348;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.01;Receitas da Intermediação Financeira;100000",
        f"019348;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.03;Resultado Bruto Intermediação Financeira;35000",
        f"019348;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.05;Resultado Antes dos Tributos sobre o Lucro;14000",
        f"019348;{ano}-03-31;1;ÚLTIMO;{ano}-01-01;{ano}-03-31;MIL;3.09;Lucro/Prejuízo Consolidado do Período;12000",
    ])
    bpp_csv = "\n".join([
        "CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;ESCALA_MOEDA;CD_CONTA;DS_CONTA;VL_CONTA",
        f"019348;{ano}-03-31;1;ÚLTIMO;MIL;2.03;Passivos Financeiros ao Custo Amortizado;2500000",
        f"019348;{ano}-03-31;1;ÚLTIMO;MIL;2.08;Patrimônio Líquido Consolidado;240000",
    ])

    zip_path = tmp_path / f"itr_cia_aberta_{ano}.zip"
    _build_itr_zip(str(zip_path), ano, {
        f"itr_cia_aberta_DRE_con_{ano}.csv": dre_csv,
        f"itr_cia_aberta_BPP_con_{ano}.csv": bpp_csv,
    })

    with patch("utils.cvm_processor.requests.get", return_value=MagicMock(status_code=404)), \
         patch("utils.cvm_processor.requests.head", return_value=MagicMock(status_code=404)):
        dash = CVMProcessor.get_dashboard_data("019348")
    assert dash is not None
    cards = {c["titulo"]: c for c in dash["cards_indicadores"]}
    assert "EBITDA" not in cards
    assert cards["Lucro Líquido"]["valor"] == 12_000_000.0
    assert cards["Patrimônio Líquido"]["valor"] == 240_000_000.0
    # Annualized ROE: (12M * 4) / 240M = 20.00%
    assert cards["ROE"]["valor_formatado"] == "20.00%"


def test_ensure_cvm_zip_refreshes_stale_current_year_on_size_change(tmp_path):
    ano = datetime.now().year
    zip_path = tmp_path / f"itr_cia_aberta_{ano}.zip"
    zip_path.write_bytes(b"old-content")
    old_time = time.time() - (7 * 3600)
    os.utime(zip_path, (old_time, old_time))

    head_resp = MagicMock(status_code=200, headers={"Content-Length": "999"})
    get_resp = MagicMock(status_code=200, content=b"new-zip-bytes")

    with patch("utils.cvm_processor.requests.head", return_value=head_resp) as m_head, \
         patch("utils.cvm_processor.requests.get", return_value=get_resp) as m_get:
        result = CVMProcessor._ensure_cvm_zip(str(tmp_path), ano, ano)

    assert result == str(zip_path)
    assert zip_path.read_bytes() == b"new-zip-bytes"
    assert m_head.called
    assert m_get.called


def test_format_brl_compact():
    assert _format_brl_compact(2_952_303_000.0) == "R$ 2,95 bi"
    assert _format_brl_compact(-322_880_000.0) == "-R$ 322,88 mi"


def test_ensure_cvm_zip_prunes_older_than_two_years(tmp_path):
    cur_year = datetime.now().year
    old_zip = tmp_path / f"itr_cia_aberta_{cur_year - 3}.zip"
    recent_zip = tmp_path / f"itr_cia_aberta_{cur_year - 1}.zip"
    old_zip.write_bytes(b"stale")
    recent_zip.write_bytes(b"recent")

    with patch("utils.cvm_processor.requests.head", return_value=MagicMock(status_code=200, headers={"Content-Length": str(len(b'recent'))})):
        res = CVMProcessor._ensure_cvm_zip(str(tmp_path), cur_year - 1, cur_year)

    assert res == str(recent_zip)
    assert recent_zip.exists()
    assert not old_zip.exists()
