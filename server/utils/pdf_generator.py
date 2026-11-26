import logging
import os
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape as _xml_escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from services_modules.report_data import sanitize_pdf_text

try:
    from zoneinfo import ZoneInfo

    _BRT_TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    _BRT_TZ = timezone(timedelta(hours=-3))


# --- Design System: Private Banking Editorial (Modelo 1) ---
FOREST = colors.HexColor("#14362B")
BRONZE = colors.HexColor("#B08D57")
IVORY = colors.HexColor("#F9F8F4")
IVORY_HEADER = colors.HexColor("#F4F2EB")
ZEBRA_IVORY = colors.HexColor("#FCFBFA")
BORDER_WARM = colors.HexColor("#E5E2D9")
GRID_WARM = colors.HexColor("#ECEAE3")
INK_GRAPHITE = colors.HexColor("#1C1F1E")
MUTED_SAGE = colors.HexColor("#5C6662")

SEM_GREEN = colors.HexColor("#1E6B52")
SEM_RED = colors.HexColor("#A63A3A")
SEM_AMBER = colors.HexColor("#9A6B26")
SEM_NEUTRAL = colors.HexColor("#4B5563")


def _esc(val) -> str:
    """Sanitiza para Latin-1/PT-BR e escapa caracteres XML para ReportLab Paragraph."""
    return _xml_escape(sanitize_pdf_text(str(val if val is not None else "")))


def _safe_float(val, default=0.0) -> float:
    try:
        return float(val) if val is not None else default
    except Exception:
        return default


def _fmt_pt_num(val: float, decimals: int = 2) -> str:
    return f"{val:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_brl(val: float | None, signed: bool = False) -> str:
    if val is None:
        return "—"
    sign = "+" if signed and val > 0 else ("-" if val < 0 else "")
    return f"{sign}R$ {_fmt_pt_num(abs(val), 2)}"


def _fmt_currency(val: float | None, currency: str) -> str:
    if val is None:
        return "—"
    prefix = "US$ " if currency == "USD" else "R$ "
    return f"{prefix}{_fmt_pt_num(val, 2)}"


def _fmt_pct(val: float | None, signed: bool = False, decimals: int = 2) -> str:
    if val is None:
        return "—"
    sign = "+" if signed and val > 0 else ""
    return f"{sign}{_fmt_pt_num(val, decimals)}%"


def _fmt_qty(val: float) -> str:
    if abs(val - round(val)) < 1e-4:
        return f"{int(round(val)):,}".replace(",", ".")
    return _fmt_pt_num(val, 2)


class _EditorialCanvas(pdf_canvas.Canvas):
    """Canvas com duas passagens para cabeçalho corrente e rodapé 'Página X de Y'."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_chrome(num_pages)
            super().showPage()
        super().save()

    def _draw_chrome(self, page_count: int):
        page_w, page_h = letter
        self.saveState()

        # Filete institucional no topo
        self.setFillColor(FOREST)
        self.rect(0, page_h - 3, page_w, 3, stroke=0, fill=1)

        # Cabeçalho corrente nas páginas 2+
        if self._pageNumber > 1:
            self.setFont("Times-Bold", 8.5)
            self.setFillColor(FOREST)
            self.drawString(45, page_h - 24, "AssetFlow Pro")
            self.setFont("Helvetica", 7.5)
            self.setFillColor(MUTED_SAGE)
            self.drawRightString(
                page_w - 45,
                page_h - 24,
                "Relatório Patrimonial & Quantitativo",
            )
            self.setStrokeColor(BORDER_WARM)
            self.setLineWidth(0.6)
            self.line(45, page_h - 30, page_w - 45, page_h - 30)

        # Rodapé fixo em todas as páginas
        self.setStrokeColor(BORDER_WARM)
        self.setLineWidth(0.6)
        self.line(45, 34, page_w - 45, 34)
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(FOREST)
        self.drawString(45, 20, "AssetFlow Pro")
        self.setFont("Helvetica", 7.5)
        self.setFillColor(MUTED_SAGE)
        self.drawString(104, 20, "· Horário de Brasília (BRT) · Documento Analítico de Ativos")
        self.drawRightString(page_w - 45, 20, f"Página {self._pageNumber} de {page_count}")

        self.restoreState()


def _section_header(title: str, subtitle: str, styles) -> list:
    """Cabeçalho de seção serifado em Verde-Floresta com filete Dourado-Fosco."""
    return [
        Spacer(1, 9),
        Paragraph(
            f"<b>{_esc(title)}</b>"
            + (f"  <font face='Helvetica' size='8' color='#5C6662'>· {_esc(subtitle)}</font>" if subtitle else ""),
            styles["section_title"],
        ),
        Spacer(1, 2),
        HRFlowable(width="100%", thickness=1.0, color=FOREST, spaceAfter=1),
        HRFlowable(width="100%", thickness=0.45, color=BRONZE, spaceAfter=6),
    ]


def _empty_banner(text: str, styles) -> Table:
    tbl = Table([[Paragraph(text, styles["cell_muted"])]], colWidths=[522])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), IVORY),
                ("LINEBEFORE", (0, 0), (0, -1), 2.5, BRONZE),
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, BORDER_WARM),
                ("LINEBELOW", (0, -1), (-1, -1), 0.5, BORDER_WARM),
                ("LINEAFTER", (-1, 0), (-1, -1), 0.5, BORDER_WARM),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return tbl


def _open_table_style(zebra: bool = False, has_total_row: bool = False) -> TableStyle:
    """Estilo de tabela aberta de gestora: sem grades verticais, apenas filetes horizontais."""
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), IVORY_HEADER),
        ("LINEBELOW", (0, 0), (-1, 0), 1.4, FOREST),
        ("LINEBELOW", (0, 1), (-1, -1), 0.45, BORDER_WARM),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if zebra and has_total_row:
        cmds.append(("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, ZEBRA_IVORY]))
    elif zebra:
        cmds.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ZEBRA_IVORY]))
    if has_total_row:
        cmds.append(("BACKGROUND", (0, -1), (-1, -1), IVORY))
        cmds.append(("LINEABOVE", (0, -1), (-1, -1), 1.1, FOREST))
        cmds.append(("LINEBELOW", (0, -1), (-1, -1), 1.1, FOREST))
    return TableStyle(cmds)


def _build_allocation_chart(allocation: list) -> Drawing | None:
    tactical = [item for item in allocation if not item.get("is_liquidity_reserve")]
    if not tactical:
        return None
    labels = [str(item.get("class") or "-")[:13] for item in tactical]
    actuals = [round(_safe_float(item.get("tactical_pct", item.get("actual_pct"))), 1) for item in tactical]
    targets = [round(_safe_float(item.get("target_pct")), 1) for item in tactical]

    drawing = Drawing(522, 168)
    drawing.add(
        Rect(0, 0, 522, 168, fillColor=IVORY, strokeColor=BORDER_WARM, strokeWidth=0.7, rx=4, ry=4)
    )
    drawing.add(
        String(12, 150, "ALOCAÇÃO TÁTICA ATUAL (%) VS. META (%) — EX-RESERVA", fontName="Helvetica-Bold", fontSize=7.5, fillColor=FOREST)
    )

    chart = VerticalBarChart()
    chart.x = 38
    chart.y = 22
    chart.height = 94
    chart.width = 468
    chart.data = [actuals, targets]
    chart.categoryAxis.categoryNames = labels
    chart.categoryAxis.labels.fontName = "Helvetica-Bold"
    chart.categoryAxis.labels.fontSize = 7.5
    chart.categoryAxis.labels.fillColor = INK_GRAPHITE
    chart.categoryAxis.strokeColor = BORDER_WARM
    chart.valueAxis.valueMin = 0
    max_val = max(actuals + targets + [20.0])
    chart.valueAxis.valueMax = min(100.0, max(25.0, round(max_val * 1.18, 0)))
    chart.valueAxis.valueStep = 20 if chart.valueAxis.valueMax > 50 else 10
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = MUTED_SAGE
    chart.valueAxis.strokeColor = BORDER_WARM
    chart.valueAxis.gridStrokeColor = GRID_WARM
    chart.valueAxis.gridStrokeWidth = 0.5
    chart.valueAxis.visibleGrid = True
    chart.groupSpacing = 16
    chart.barSpacing = 3
    chart.bars[0].fillColor = FOREST
    chart.bars[0].strokeColor = FOREST
    chart.bars[1].fillColor = BRONZE
    chart.bars[1].strokeColor = BRONZE

    legend = Legend()
    legend.x = 368
    legend.y = 148
    legend.dx = 8
    legend.dy = 8
    legend.fontName = "Helvetica-Bold"
    legend.fontSize = 7.2
    legend.columnMaximum = 1
    legend.deltax = 76
    legend.colorNamePairs = [(FOREST, "Atual Tático (%)"), (BRONZE, "Meta (%)")]

    drawing.add(chart)
    drawing.add(legend)
    return drawing


def _build_movers_chart(assets: list) -> Drawing | None:
    """
    Gráfico de barras horizontais divergentes partindo do eixo central 0:
    - Barras positivas (#1E6B52) crescem à direita; ticker à esquerda do 0, % na ponta direita.
    - Barras negativas (#A63A3A) crescem à esquerda; ticker à DIREITA do 0 (fundo branco), % na ponta esquerda.
    """
    if not assets:
        return None
    ordered = sorted(assets, key=lambda x: _safe_float(x.get("gain_pct")), reverse=True)
    top_gains = [a for a in ordered if _safe_float(a.get("gain_pct")) > 0][:4]
    top_losses = [a for a in reversed(ordered) if _safe_float(a.get("gain_pct")) < 0][:4]
    combined = sorted(top_losses + top_gains, key=lambda a: _safe_float(a.get("gain_pct")))
    if not combined:
        return None

    n_rows = len(combined)
    row_h = 16
    chart_h = n_rows * row_h
    drawing_h = chart_h + 36
    drawing = Drawing(522, drawing_h)

    drawing.add(
        Rect(0, 0, 522, drawing_h, fillColor=colors.white, strokeColor=BORDER_WARM, strokeWidth=0.7, rx=4, ry=4)
    )
    drawing.add(
        String(12, drawing_h - 16, "DESTAQUES DE RENTABILIDADE (% SOBRE CUSTO)", fontName="Helvetica-Bold", fontSize=7.5, fillColor=FOREST)
    )

    x_zero = 261.0
    max_bar_w = 162.0
    max_abs = max(max(abs(_safe_float(a.get("gain_pct"))) for a in combined), 10.0)

    # Eixo vertical central 0%
    y_bot = 10.0
    y_top = y_bot + chart_h
    drawing.add(Line(x_zero, y_bot, x_zero, y_top, strokeColor=BORDER_WARM, strokeWidth=1.0))

    for idx, item in enumerate(combined):
        val = _safe_float(item.get("gain_pct"))
        ticker = str(item.get("ticker") or "-")
        y_center = y_bot + (idx + 0.5) * row_h
        bar_h = 10.0
        bar_y = y_center - bar_h / 2.0
        bar_w = max(4.0, (abs(val) / max_abs) * max_bar_w)
        pct_str = _fmt_pct(val, signed=True, decimals=1)

        if val >= 0:
            # Barra verde para a direita; ticker à esquerda do eixo 0; % na ponta direita
            drawing.add(Rect(x_zero, bar_y, bar_w, bar_h, fillColor=SEM_GREEN, strokeColor=SEM_GREEN, strokeWidth=0, rx=1.5, ry=1.5))
            drawing.add(String(x_zero - 6, y_center - 2.5, ticker, fontName="Helvetica-Bold", fontSize=7.5, fillColor=INK_GRAPHITE, textAnchor="end"))
            drawing.add(String(x_zero + bar_w + 5, y_center - 2.5, pct_str, fontName="Helvetica-Bold", fontSize=7.2, fillColor=SEM_GREEN, textAnchor="start"))
        else:
            # Barra coral para a esquerda; ticker à DIREITA do eixo 0 (fundo branco); % na ponta esquerda
            drawing.add(Rect(x_zero - bar_w, bar_y, bar_w, bar_h, fillColor=SEM_RED, strokeColor=SEM_RED, strokeWidth=0, rx=1.5, ry=1.5))
            drawing.add(String(x_zero + 6, y_center - 2.5, ticker, fontName="Helvetica-Bold", fontSize=7.5, fillColor=INK_GRAPHITE, textAnchor="start"))
            drawing.add(String(x_zero - bar_w - 5, y_center - 2.5, pct_str, fontName="Helvetica-Bold", fontSize=7.2, fillColor=SEM_RED, textAnchor="end"))

    return drawing


def generate_monthly_report_pdf(output_path: str, portfolio_data: dict) -> bool:
    """Gera o relatório patrimonial no padrão Private Banking Editorial (ReportLab)."""
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=45,
            leftMargin=45,
            topMargin=45,
            bottomMargin=50,
            title="AssetFlow Pro - Relatório Patrimonial",
        )

        base_styles = getSampleStyleSheet()
        styles = {
            "brand_tag": ParagraphStyle("BrandTag", parent=base_styles["Normal"], fontSize=7.5, leading=10, textColor=BRONZE, fontName="Helvetica-Bold"),
            "hero_title": ParagraphStyle("HeroTitle", parent=base_styles["Heading1"], fontSize=18, leading=21, textColor=FOREST, fontName="Times-Bold"),
            "hero_sub": ParagraphStyle("HeroSub", parent=base_styles["Normal"], fontSize=8.2, leading=11, textColor=MUTED_SAGE),
            "hero_meta": ParagraphStyle("HeroMeta", parent=base_styles["Normal"], fontSize=7.8, leading=11, textColor=INK_GRAPHITE, alignment=2),
            "section_title": ParagraphStyle("SectionTitle", parent=base_styles["Heading2"], fontSize=11.5, leading=14, textColor=FOREST, fontName="Times-Bold"),
            "kpi_label": ParagraphStyle("KpiLabel", parent=base_styles["Normal"], fontSize=6.8, leading=9, textColor=MUTED_SAGE, fontName="Helvetica-Bold"),
            "kpi_value": ParagraphStyle("KpiValue", parent=base_styles["Normal"], fontSize=11.5, leading=14.5, textColor=INK_GRAPHITE, fontName="Helvetica-Bold"),
            "kpi_sub": ParagraphStyle("KpiSub", parent=base_styles["Normal"], fontSize=7, leading=9.5, textColor=MUTED_SAGE),
            "cell": ParagraphStyle("Cell", parent=base_styles["Normal"], fontSize=7.8, leading=10, textColor=INK_GRAPHITE),
            "cell_bold": ParagraphStyle("CellBold", parent=base_styles["Normal"], fontSize=7.8, leading=10, textColor=FOREST, fontName="Helvetica-Bold"),
            "cell_right": ParagraphStyle("CellRight", parent=base_styles["Normal"], fontSize=7.8, leading=10, textColor=INK_GRAPHITE, alignment=2),
            "cell_muted": ParagraphStyle("CellMuted", parent=base_styles["Normal"], fontSize=7.3, leading=9.8, textColor=MUTED_SAGE),
            "hdr_cell": ParagraphStyle("HdrCell", parent=base_styles["Normal"], fontSize=7.2, leading=9.2, textColor=FOREST, fontName="Helvetica-Bold"),
            "hdr_right": ParagraphStyle("HdrRight", parent=base_styles["Normal"], fontSize=7.2, leading=9.2, textColor=FOREST, fontName="Helvetica-Bold", alignment=2),
            "insight_body": ParagraphStyle("InsightBody", parent=base_styles["Normal"], fontSize=8.0, leading=12, textColor=INK_GRAPHITE),
        }

        summary = portfolio_data.get("summary") or {}
        allocation = portfolio_data.get("allocation") or []
        top3_conc = portfolio_data.get("top3_concentration") or []
        assets = portfolio_data.get("assets") or []
        regime = portfolio_data.get("regime") or {}
        risk = portfolio_data.get("risk") or {}
        rebalance_actions = portfolio_data.get("rebalance_actions") or []
        signals_summary = portfolio_data.get("signals_summary") or {}
        signals_v2 = portfolio_data.get("signals_v2") or []
        buy_highlights = portfolio_data.get("buy_highlights") or []
        dividends_30d_total = _safe_float(portfolio_data.get("dividends_30d_total"))
        dividends_30d_items = portfolio_data.get("dividends_30d_items") or []
        tax_summary = portfolio_data.get("tax_summary") or {}
        insights = portfolio_data.get("insights") or []

        total_brl = _safe_float(summary.get("total_brl"))
        total_invested_brl = _safe_float(summary.get("total_invested_brl"))
        total_gain_brl = _safe_float(summary.get("total_gain_brl"))
        total_gain_pct = _safe_float(summary.get("total_gain_pct"))
        dy_proj_pct = _safe_float(summary.get("dy_projetado_pct"))
        renda_mensal_est = _safe_float(summary.get("renda_mensal_est"))
        usd_brl = _safe_float(summary.get("usd_brl"))
        assets_count = int(_safe_float(summary.get("assets_count"), len(assets)))
        brl_pct = _safe_float(summary.get("brl_pct"))
        usd_pct = _safe_float(summary.get("usd_pct"))

        generated_at = str(portfolio_data.get("generated_at") or datetime.now(_BRT_TZ).strftime("%d/%m/%Y %H:%M BRT"))
        period_ref = str(portfolio_data.get("period_ref") or datetime.now(_BRT_TZ).strftime("%m/%Y"))

        regime_code = str(regime.get("regime_label") or regime.get("regime_code") or "Mercado Neutro")
        sharpe_val = risk.get("sharpe")
        beta_val = risk.get("beta")
        dd_val = risk.get("max_drawdown_pct")
        risk_sub_parts = []
        if sharpe_val is not None:
            risk_sub_parts.append(f"Sharpe {_fmt_pt_num(_safe_float(sharpe_val), 2)}")
        if beta_val is not None:
            risk_sub_parts.append(f"Beta {_fmt_pt_num(_safe_float(beta_val), 2)}")
        if dd_val is not None:
            risk_sub_parts.append(f"DD {_fmt_pct(_safe_float(dd_val), decimals=1)}")
        risk_sub = " · ".join(risk_sub_parts) if risk_sub_parts else "Métricas em calibração"

        story = []

        # ================= PÁGINA 1: CABEÇALHO EDITORIAL & ALOCAÇÃO =================
        usd_str = f"R$ {_fmt_pt_num(usd_brl, 2)}" if usd_brl > 0 else "—"
        header_tbl = Table(
            [
                [
                    Paragraph("ASSETFLOW PRO  ·  RELATÓRIO INSTITUCIONAL", styles["brand_tag"]),
                    Paragraph(f"<font color='#5C6662' size='7'>EMISSÃO (BRT)</font><br/><b>{generated_at}</b>", styles["hero_meta"]),
                ],
                [
                    Paragraph("Relatório Patrimonial &amp; Quantitativo", styles["hero_title"]),
                    Paragraph(
                        f"Ref.: <b>{period_ref}</b> · USD/BRL: <b>{usd_str}</b><br/>"
                        f"<font color='#5C6662'>{assets_count} ativos consolidados</font>",
                        styles["hero_meta"],
                    ),
                ],
                [
                    Paragraph("Portfólio de Ativos · Alocação Estratégica · Sinais Estatísticos · Proventos &amp; DARF", styles["hero_sub"]),
                    "",
                ],
            ],
            colWidths=[352, 170],
        )
        header_tbl.setStyle(
            TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, 0), 0),
                    ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("SPAN", (0, 2), (1, 2)),
                ]
            )
        )
        story.append(header_tbl)
        story.append(HRFlowable(width="100%", thickness=1.8, color=FOREST, spaceAfter=1.2))
        story.append(HRFlowable(width="100%", thickness=0.55, color=BRONZE, spaceAfter=10))

        # Faixa de 4 KPI Cards (Marfim #F9F8F4 + filete superior)
        gain_hex = "#1E6B52" if total_gain_brl >= 0 else "#A63A3A"
        gain_accent = SEM_GREEN if total_gain_brl >= 0 else SEM_RED

        def _kpi(label: str, val_html: str, sub_html: str, accent):
            c = Table(
                [
                    [Paragraph(label, styles["kpi_label"])],
                    [Paragraph(val_html, styles["kpi_value"])],
                    [Paragraph(sub_html, styles["kpi_sub"])],
                ],
                colWidths=[126.5],
            )
            c.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), IVORY),
                        ("LINEABOVE", (0, 0), (-1, 0), 2.0, accent),
                        ("LINEBELOW", (0, -1), (-1, -1), 0.6, BORDER_WARM),
                        ("LINEBEFORE", (0, 0), (0, -1), 0.6, BORDER_WARM),
                        ("LINEAFTER", (-1, 0), (-1, -1), 0.6, BORDER_WARM),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, 0), 6),
                        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
                        ("TOPPADDING", (0, 1), (-1, -1), 1.5),
                    ]
                )
            )
            return c

        kpis = Table(
            [
                [
                    _kpi("PATRIMÔNIO EM ATIVOS", _fmt_brl(total_brl), f"Custo: {_fmt_brl(total_invested_brl)}", FOREST),
                    _kpi(
                        "RESULTADO ACUMULADO",
                        f"<font color='{gain_hex}'>{_fmt_brl(total_gain_brl, signed=True)}</font>",
                        f"<font color='{gain_hex}'><b>{_fmt_pct(total_gain_pct, signed=True)}</b></font> s/ custo",
                        gain_accent,
                    ),
                    _kpi(
                        "RENDA PASSIVA (EST.)",
                        f"{_fmt_brl(renda_mensal_est)}/mês",
                        f"DY proj.: <b>{_fmt_pct(dy_proj_pct)}</b> a.a.",
                        BRONZE,
                    ),
                    _kpi("REGIME &amp; RISCO", regime_code[:18], risk_sub, SEM_AMBER),
                ]
            ],
            colWidths=[131.5, 131.5, 131.5, 127.5],
        )
        kpis.setStyle(
            TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (3, 0), (3, 0), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(kpis)

        # Seção 1: Alocação por Classe de Ativo
        alloc_block = _section_header("1. Alocação por Classe de Ativo", "Exposição total vs. tática (ex-Reserva)", styles)
        if allocation:
            alloc_rows = [
                [
                    Paragraph("CLASSE", styles["hdr_cell"]),
                    Paragraph("ATIVOS", styles["hdr_right"]),
                    Paragraph("VALOR (R$)", styles["hdr_right"]),
                    Paragraph("ATUAL %", styles["hdr_right"]),
                    Paragraph("TÁTICO %", styles["hdr_right"]),
                    Paragraph("META %", styles["hdr_right"]),
                    Paragraph("DESVIO", styles["hdr_right"]),
                    Paragraph("GAP APORTE", styles["hdr_right"]),
                ]
            ]
            for item in allocation:
                is_res = bool(item.get("is_liquidity_reserve"))
                diff_pp = _safe_float(item.get("diff_pp"))
                gap_brl = _safe_float(item.get("gap_brl"))
                diff_hex = "#4B5563" if is_res else ("#1E6B52" if abs(diff_pp) <= 3 else ("#9A6B26" if diff_pp > 0 else "#14362B"))
                diff_str = "Liquidez" if is_res else f"{_fmt_pt_num(diff_pp, 1)} p.p."
                gap_str = "Fora da matriz" if is_res else _fmt_brl(gap_brl, signed=True)
                tact_str = "—" if is_res else _fmt_pct(item.get("tactical_pct"))
                alloc_rows.append(
                    [
                        Paragraph(_esc(item.get("class") or "-"), styles["cell_bold"]),
                        Paragraph(str(item.get("count") or 0), styles["cell_right"]),
                        Paragraph(_fmt_brl(_safe_float(item.get("value_brl"))), styles["cell_right"]),
                        Paragraph(_fmt_pct(_safe_float(item.get("actual_pct"))), styles["cell_right"]),
                        Paragraph(tact_str, styles["cell_right"]),
                        Paragraph("— (0%)" if is_res else _fmt_pct(_safe_float(item.get("target_pct"))), styles["cell_right"]),
                        Paragraph(f"<font color='{diff_hex}'><b>{diff_str}</b></font>", styles["cell_right"]),
                        Paragraph(gap_str, styles["cell_right"]),
                    ]
                )
            alloc_tbl = Table(alloc_rows, colWidths=[90, 36, 80, 52, 52, 52, 68, 92])
            alloc_tbl.setStyle(_open_table_style(zebra=False))
            alloc_block.append(alloc_tbl)
            chart_alloc = _build_allocation_chart(allocation)
            if chart_alloc is not None:
                alloc_block.append(Spacer(1, 8))
                alloc_block.append(chart_alloc)
        else:
            alloc_block.append(_empty_banner("Sem posições de alocação cadastradas no momento.", styles))
        story.append(KeepTogether(alloc_block))

        # Seção 2: Diagnóstico de Concentração & Exposição Cambial
        conc_block = _section_header("2. Diagnóstico de Concentração &amp; Exposição Cambial", "Top 3 posições e risco cambial", styles)
        top3_str = " · ".join(
            f"<b>{c['ticker']}</b> ({_fmt_pct(c['weight_pct'], decimals=1)})" for c in top3_conc
        ) or "—"
        diag_lines = [
            f"<b>Top 3 Concentrações:</b> {top3_str}",
            f"<b>Exposição Cambial:</b> BRL {_fmt_pct(brl_pct, decimals=1)}  |  Internacional / USD {_fmt_pct(usd_pct, decimals=1)}",
        ]
        for ins in insights[:3]:
            diag_lines.append(f"• {ins}")
        diag_box = Table([[Paragraph("<br/>".join(diag_lines), styles["insight_body"])]], colWidths=[522])
        diag_box.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), IVORY),
                    ("LINEBEFORE", (0, 0), (0, -1), 3, FOREST),
                    ("LINEABOVE", (0, 0), (-1, 0), 0.6, BORDER_WARM),
                    ("LINEBELOW", (0, -1), (-1, -1), 0.6, BORDER_WARM),
                    ("LINEAFTER", (-1, 0), (-1, -1), 0.6, BORDER_WARM),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            )
        )
        conc_block.append(diag_box)
        story.append(KeepTogether(conc_block))

        # ================= PÁGINA 2: POSIÇÕES DETALHADAS =================
        story.append(PageBreak())
        story.extend(
            _section_header(
                "3. Posições Consolidadas da Carteira",
                f"{len(assets)} ativos ordenados por valor de mercado em BRL",
                styles,
            )
        )
        if assets:
            pos_rows = [
                [
                    Paragraph("ATIVO / CLASSE", styles["hdr_cell"]),
                    Paragraph("QTD.", styles["hdr_right"]),
                    Paragraph("PM", styles["hdr_right"]),
                    Paragraph("COTAÇÃO", styles["hdr_right"]),
                    Paragraph("TOTAL (R$)", styles["hdr_right"]),
                    Paragraph("PESO", styles["hdr_right"]),
                    Paragraph("RESULTADO", styles["hdr_right"]),
                    Paragraph("SINAL", styles["hdr_cell"]),
                ]
            ]
            for p in assets:
                cur = str(p.get("currency") or "BRL")
                g_pct = _safe_float(p.get("gain_pct"))
                g_brl = _safe_float(p.get("gain_brl"))
                g_hex = "#1E6B52" if g_brl >= 0 else "#A63A3A"
                st_label = str(p.get("action_badge") or "NEUTRO").upper()
                st_hex = "#1E6B52" if st_label == "COMPRAR" else ("#A63A3A" if st_label == "REALIZAR" else "#5C6662")
                pos_rows.append(
                    [
                        Paragraph(f"<b>{_esc(p.get('ticker'))}</b> <font size='6.8' color='#5C6662'>{_esc(p.get('asset_class'))}</font>", styles["cell"]),
                        Paragraph(_fmt_qty(_safe_float(p.get("quantity"))), styles["cell_right"]),
                        Paragraph(_fmt_currency(_safe_float(p.get("avg_price")), cur), styles["cell_right"]),
                        Paragraph(_fmt_currency(_safe_float(p.get("current_price")), cur), styles["cell_right"]),
                        Paragraph(_fmt_brl(_safe_float(p.get("current_value_brl"))), styles["cell_right"]),
                        Paragraph(_fmt_pct(_safe_float(p.get("weight_pct")), decimals=1), styles["cell_right"]),
                        Paragraph(
                            f"<font color='{g_hex}'><b>{_fmt_pct(g_pct, signed=True, decimals=1)}</b></font><br/>"
                            f"<font size='6.8' color='{g_hex}'>{_fmt_brl(g_brl, signed=True)}</font>",
                            styles["cell_right"],
                        ),
                        Paragraph(f"<font color='{st_hex}'><b>{st_label}</b></font>", styles["cell"]),
                    ]
                )
            pos_rows.append(
                [
                    Paragraph("<b>TOTAL GERAL</b>", styles["cell_bold"]),
                    Paragraph("—", styles["cell_right"]),
                    Paragraph("—", styles["cell_right"]),
                    Paragraph("—", styles["cell_right"]),
                    Paragraph(f"<b>{_fmt_brl(total_brl)}</b>", styles["cell_right"]),
                    Paragraph("<b>100,0%</b>", styles["cell_right"]),
                    Paragraph(f"<font color='{gain_hex}'><b>{_fmt_brl(total_gain_brl, signed=True)}</b></font>", styles["cell_right"]),
                    Paragraph("", styles["cell"]),
                ]
            )
            pos_tbl = Table(pos_rows, colWidths=[92, 38, 62, 62, 78, 42, 88, 60], repeatRows=1)
            pos_tbl.setStyle(_open_table_style(zebra=True, has_total_row=True))
            story.append(pos_tbl)

            movers_chart = _build_movers_chart(assets)
            if movers_chart is not None:
                story.append(Spacer(1, 10))
                story.append(KeepTogether([movers_chart]))
        else:
            story.append(_empty_banner("Nenhuma posição aberta encontrada na carteira.", styles))

        # ================= PÁGINA 3+: SINAIS QUANTITATIVOS, PROVENTOS & DARF =================
        story.append(PageBreak())

        total_buy_sigs = int(signals_summary.get("total_buy_signals") or len([s for s in signals_v2 if s.get("is_actionable")]))
        shown_sigs = min(8, len(signals_v2))
        sig_sub = (
            f"Top {shown_sigs} de {total_buy_sigs} ativos em Ponto de Compra · Estatísticas históricas do setup"
            if total_buy_sigs > shown_sigs
            else "Setups deduplicados por ativo · Estatísticas históricas do setup"
        )
        sig_block = _section_header("4. Oportunidades &amp; Sinais Quantitativos (v2)", sig_sub, styles)
        sig_strip = Paragraph(
            f"Resumo da carteira: <font color='#1E6B52'><b>{signals_summary.get('compra', 0)} em Ponto de Compra</b></font>  ·  "
            f"<font color='#9A6B26'><b>{signals_summary.get('observar', 0)} em Observação/Neutro</b></font>  ·  "
            f"<font color='#A63A3A'><b>{signals_summary.get('realizar', 0)} para Realizar</b></font>",
            styles["cell"],
        )
        sig_block.append(sig_strip)
        sig_block.append(Spacer(1, 6))

        if rebalance_actions:
            reb_rows = [
                [
                    Paragraph("CLASSE", styles["hdr_cell"]),
                    Paragraph("AÇÃO TÁTICA", styles["hdr_cell"]),
                    Paragraph("DESVIO", styles["hdr_right"]),
                    Paragraph("AJUSTE (R$)", styles["hdr_right"]),
                ]
            ]
            for act in rebalance_actions:
                a_txt = str(act.get("action") or "MANTER").upper()
                a_hex = "#1E6B52" if "APORTAR" in a_txt else ("#4B5563" if "RESERVA" in a_txt else "#9A6B26")
                diff_val = act.get("diff_pct")
                amt_val = act.get("amount_brl")
                reb_rows.append(
                    [
                        Paragraph(str(act.get("class") or "-"), styles["cell_bold"]),
                        Paragraph(f"<font color='{a_hex}'><b>{a_txt}</b></font>", styles["cell"]),
                        Paragraph("—" if diff_val is None else f"{_fmt_pt_num(_safe_float(diff_val), 1)} p.p.", styles["cell_right"]),
                        Paragraph("—" if amt_val is None else _fmt_brl(_safe_float(amt_val)), styles["cell_right"]),
                    ]
                )
            reb_tbl = Table(reb_rows, colWidths=[140, 182, 90, 110])
            reb_tbl.setStyle(_open_table_style())
            sig_block.append(reb_tbl)
            sig_block.append(Spacer(1, 8))

        if signals_v2:
            sig_rows = [
                [
                    Paragraph("ATIVO", styles["hdr_cell"]),
                    Paragraph("SETUP ATIVADO", styles["hdr_cell"]),
                    Paragraph("WIN RATE (N)", styles["hdr_right"]),
                    Paragraph("EXPECT.", styles["hdr_right"]),
                    Paragraph("ENTRADA", styles["hdr_right"]),
                    Paragraph("ALVO / STOP", styles["hdr_right"]),
                    Paragraph("AÇÃO", styles["hdr_cell"]),
                ]
            ]
            for s in signals_v2[:8]:
                n_s = int(s.get("sample_size_n") or 0)
                wr_str = f"{_fmt_pct(s.get('win_rate_pct'), decimals=1)} ({n_s})" if s.get("win_rate_pct") is not None else "—"
                exp_str = _fmt_pct(s.get("expectancy_pct"), signed=True) if s.get("expectancy_pct") is not None else "—"
                ent_str = f"R$ {_fmt_pt_num(s.get('entry_price'), 2)}" if s.get("entry_price") is not None else "—"
                if s.get("target_price") is not None and s.get("risk_price") is not None:
                    alvo_stop = f"{_fmt_pt_num(s.get('target_price'), 2)} / {_fmt_pt_num(s.get('risk_price'), 2)}"
                else:
                    alvo_stop = "—"
                lbl = str(s.get("signal_label") or "OBSERVAR")
                lbl_hex = "#1E6B52" if ("COMPRA" in lbl or "APORTE" in lbl) else ("#A63A3A" if "REALIZAR" in lbl else "#9A6B26")
                sig_rows.append(
                    [
                        Paragraph(_esc(s.get("ticker") or "-"), styles["cell_bold"]),
                        Paragraph(_esc(s.get("setup_name") or "—"), styles["cell"]),
                        Paragraph(wr_str, styles["cell_right"]),
                        Paragraph(exp_str, styles["cell_right"]),
                        Paragraph(ent_str, styles["cell_right"]),
                        Paragraph(alvo_stop, styles["cell_right"]),
                        Paragraph(f"<font color='{lbl_hex}'><b>{lbl}</b></font>", styles["cell"]),
                    ]
                )
            sig_tbl = Table(sig_rows, colWidths=[50, 128, 70, 52, 60, 82, 80])
            sig_tbl.setStyle(_open_table_style())
            sig_block.append(sig_tbl)
        else:
            sig_block.append(_empty_banner("Nenhum sinal estatístico registrado para os ativos da carteira.", styles))

        if buy_highlights:
            sig_block.append(Spacer(1, 7))
            for bh in buy_highlights[:4]:
                falta_txt = f" · Sugestão meta: {_fmt_brl(bh['falta_comprar'])}" if _safe_float(bh.get("falta_comprar")) > 0 else ""
                motivo_clean = str(bh.get("motivo") or "").strip()
                card = Table(
                    [
                        [
                            Paragraph(
                                f"<b>{_esc(bh['ticker'])}</b> <font color='#1E6B52'><b>(Score {bh['score']}/100{falta_txt})</b></font><br/>"
                                f"<font color='#5C6662'>{_esc(motivo_clean)}</font>",
                                styles["cell"],
                            )
                        ]
                    ],
                    colWidths=[522],
                )
                card.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), IVORY),
                            ("LINEBEFORE", (0, 0), (0, -1), 2.8, FOREST),
                            ("LINEABOVE", (0, 0), (-1, 0), 0.5, BORDER_WARM),
                            ("LINEBELOW", (0, -1), (-1, -1), 0.5, BORDER_WARM),
                            ("LINEAFTER", (-1, 0), (-1, -1), 0.5, BORDER_WARM),
                            ("LEFTPADDING", (0, 0), (-1, -1), 9),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                            ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ]
                    )
                )
                sig_block.append(card)
                sig_block.append(Spacer(1, 4))
        story.append(KeepTogether(sig_block))

        # Seção 5: Proventos (30d) & Resumo Fiscal (DARF)
        div_tax_block = _section_header("5. Proventos (Próximos 30 dias) &amp; Resumo Fiscal (DARF)", "Fluxo provisionado e apuração tributária", styles)
        if dividends_30d_items:
            div_rows = [
                [
                    Paragraph("ATIVO", styles["hdr_cell"]),
                    Paragraph("TIPO", styles["hdr_cell"]),
                    Paragraph("DATA-COM", styles["hdr_cell"]),
                    Paragraph("PAGTO", styles["hdr_cell"]),
                    Paragraph("VALOR EST.", styles["hdr_right"]),
                ]
            ]
            shown_divs = dividends_30d_items[:12]
            shown_sum = round(sum(_safe_float(d.get("amount_brl")) for d in shown_divs), 2)
            for d in shown_divs:
                div_rows.append(
                    [
                        Paragraph(_esc(d.get("ticker") or "-"), styles["cell_bold"]),
                        Paragraph(_esc(d.get("event_type") or "Dividendo"), styles["cell_muted"]),
                        Paragraph(str(d.get("date_com") or "—"), styles["cell"]),
                        Paragraph(str(d.get("payment_date") or "—"), styles["cell"]),
                        Paragraph(_fmt_brl(_safe_float(d.get("amount_brl"))), styles["cell_right"]),
                    ]
                )
            remainder = round(dividends_30d_total - shown_sum, 2)
            if len(dividends_30d_items) > len(shown_divs) or abs(remainder) >= 0.01:
                extra_cnt = max(0, len(dividends_30d_items) - len(shown_divs))
                extra_lbl = f"Outros proventos ({extra_cnt} eventos)" if extra_cnt > 0 else "Ajuste de arredondamento"
                div_rows.append(
                    [
                        Paragraph(extra_lbl, styles["cell_muted"]),
                        Paragraph("—", styles["cell_muted"]),
                        Paragraph("—", styles["cell_muted"]),
                        Paragraph("—", styles["cell_muted"]),
                        Paragraph(_fmt_brl(remainder), styles["cell_right"]),
                    ]
                )
            div_rows.append(
                [
                    Paragraph("<b>TOTAL 30D</b>", styles["cell_bold"]),
                    Paragraph("", styles["cell"]),
                    Paragraph("", styles["cell"]),
                    Paragraph("", styles["cell"]),
                    Paragraph(f"<font color='#1E6B52'><b>{_fmt_brl(dividends_30d_total)}</b></font>", styles["cell_right"]),
                ]
            )
            div_tbl = Table(div_rows, colWidths=[76, 120, 96, 96, 134])
            div_tbl.setStyle(_open_table_style(has_total_row=True))
            div_tax_block.append(div_tbl)
        else:
            div_tax_block.append(
                _empty_banner(f"Proventos Provisionados (30d): {_fmt_brl(dividends_30d_total)} · Sem novos pagamentos confirmados nesta janela.", styles)
            )

        div_tax_block.append(Spacer(1, 9))

        comp = str(tax_summary.get("competencia") or period_ref)
        sales_st = _safe_float(tax_summary.get("sales_total_stocks"))
        net_prof = _safe_float(tax_summary.get("net_profit_brl"))
        acc_loss = _safe_float(tax_summary.get("accumulated_loss_brl"))
        darf_due = _safe_float(tax_summary.get("darf_to_pay"))
        tax_status = str(tax_summary.get("status_label") or "Sem vendas tributáveis")
        darf_hex = "#A63A3A" if darf_due > 0 else "#1E6B52"

        tax_tbl = Table(
            [
                [
                    Paragraph("COMPETÊNCIA", styles["hdr_cell"]),
                    Paragraph("VENDAS AÇÕES BR (LIM. R$ 20K)", styles["hdr_right"]),
                    Paragraph("LUCRO LÍQUIDO", styles["hdr_right"]),
                    Paragraph("PREJUÍZO COMP.", styles["hdr_right"]),
                    Paragraph("DARF A PAGAR", styles["hdr_right"]),
                    Paragraph("STATUS FISCAL", styles["hdr_cell"]),
                ],
                [
                    Paragraph(comp, styles["cell_bold"]),
                    Paragraph(f"{_fmt_brl(sales_st)} / R$ 20.000,00", styles["cell_right"]),
                    Paragraph(_fmt_brl(net_prof, signed=True), styles["cell_right"]),
                    Paragraph(_fmt_brl(acc_loss), styles["cell_right"]),
                    Paragraph(f"<font color='{darf_hex}'><b>{_fmt_brl(darf_due)}</b></font>", styles["cell_right"]),
                    Paragraph(f"<font color='{darf_hex}'><b>{_esc(tax_status)}</b></font>", styles["cell"]),
                ],
            ],
            colWidths=[64, 146, 74, 74, 72, 92],
        )
        tax_tbl.setStyle(_open_table_style())
        div_tax_block.append(tax_tbl)
        story.append(KeepTogether(div_tax_block))

        doc.build(story, canvasmaker=_EditorialCanvas)
        return True
    except Exception as e:
        logging.error(f"Erro ao gerar PDF patrimonial: {e}", exc_info=True)
        return False
