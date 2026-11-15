from datetime import datetime
import logging
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _safe_float(val, default=0.0) -> float:
    try:
        return float(val) if val is not None else default
    except Exception:
        return default


def _fmt_brl(val: float) -> str:
    s = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def _fmt_currency(val: float, currency: str) -> str:
    prefix = "$ " if currency == "USD" else "R$ "
    s = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{prefix}{s}"


def _fmt_pct(val: float, signed: bool = False) -> str:
    sign = "+" if signed and val > 0 else ""
    return f"{sign}{val:.2f}%".replace(".", ",")


def _fmt_qty(val: float) -> str:
    if abs(val - round(val)) < 1e-4:
        return f"{int(round(val)):,}".replace(",", ".")
    return f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def generate_monthly_report_pdf(output_path: str, portfolio_data: dict) -> bool:
    """Gera o relatório patrimonial consolidado em PDF (ReportLab)."""
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=32,
            leftMargin=32,
            topMargin=32,
            bottomMargin=32,
        )

        styles = getSampleStyleSheet()
        header_title = ParagraphStyle(
            name='HeaderTitle', parent=styles['Heading1'],
            fontSize=18, textColor=colors.white, fontName='Helvetica-Bold', spaceAfter=2,
        )
        header_sub = ParagraphStyle(
            name='HeaderSub', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor('#cbd5e1'),
        )
        section_style = ParagraphStyle(
            name='SectionStyle', parent=styles['Heading2'],
            fontSize=12, textColor=colors.HexColor('#0f172a'),
            fontName='Helvetica-Bold', spaceBefore=12, spaceAfter=6,
        )
        body_style = ParagraphStyle(
            name='BodyStyle', parent=styles['BodyText'],
            fontSize=8.5, leading=12, textColor=colors.HexColor('#334155'), spaceAfter=4,
        )
        kpi_label_style = ParagraphStyle(
            name='KpiLabel', parent=styles['Normal'],
            fontSize=7.5, textColor=colors.HexColor('#64748b'), fontName='Helvetica-Bold',
        )
        kpi_value_style = ParagraphStyle(
            name='KpiValue', parent=styles['Normal'],
            fontSize=11, textColor=colors.HexColor('#0f172a'), fontName='Helvetica-Bold',
        )
        th_style = ParagraphStyle(
            name='ThStyle', parent=styles['Normal'],
            fontSize=8, textColor=colors.white, fontName='Helvetica-Bold',
        )
        td_style = ParagraphStyle(
            name='TdStyle', parent=styles['Normal'],
            fontSize=7.8, textColor=colors.HexColor('#1e293b'),
        )
        td_bold_style = ParagraphStyle(
            name='TdBoldStyle', parent=styles['Normal'],
            fontSize=7.8, textColor=colors.HexColor('#0f172a'), fontName='Helvetica-Bold',
        )

        ativos_raw = portfolio_data.get("ativos", []) or []
        dolar_rate = _safe_float(portfolio_data.get("dolar_rate"), 5.80) or 5.80

        enriched_assets = []
        classes_agg: dict[str, dict] = {}
        total_atual_brl = 0.0
        total_investido_brl = 0.0

        for asset in ativos_raw:
            moeda = asset.get("currency", "BRL") or "BRL"
            fator = _safe_float(asset.get("fator"), dolar_rate if moeda == "USD" else 1.0)
            qtd = _safe_float(asset.get("qtd"))
            pm = _safe_float(asset.get("pm"))
            preco = _safe_float(asset.get("preco_atual"))
            atual_brl = _safe_float(asset.get("total_atual"), qtd * preco * fator)
            investido_brl = _safe_float(asset.get("total_investido"), qtd * pm * fator)
            lucro_brl = atual_brl - investido_brl
            lucro_pct = (lucro_brl / investido_brl * 100.0) if investido_brl > 0 else 0.0
            classe = asset.get("tipo") or asset.get("categoria") or "Outros"

            total_atual_brl += atual_brl
            total_investido_brl += investido_brl

            cls_entry = classes_agg.setdefault(classe, {"count": 0, "investido": 0.0, "atual": 0.0})
            cls_entry["count"] += 1
            cls_entry["investido"] += investido_brl
            cls_entry["atual"] += atual_brl

            enriched_assets.append({
                "ticker": asset.get("ticker", ""),
                "classe": classe,
                "moeda": moeda,
                "qtd": qtd,
                "pm": pm,
                "preco": preco,
                "atual_brl": atual_brl,
                "investido_brl": investido_brl,
                "lucro_brl": lucro_brl,
                "lucro_pct": lucro_pct,
            })

        if total_atual_brl <= 0:
            total_atual_brl = _safe_float(portfolio_data.get("resumo", {}).get("Total", 0.0))

        lucro_total_brl = total_atual_brl - total_investido_brl
        lucro_total_pct = (lucro_total_brl / total_investido_brl * 100.0) if total_investido_brl > 0 else 0.0

        story = []

        # 1. Cabeçalho Executivo
        generated_at = portfolio_data.get("generated_at") or datetime.now().strftime("%d/%m/%Y %H:%M")
        banner = Table(
            [[
                Paragraph("AssetFlow · Relatório Patrimonial", header_title),
                Paragraph(f"Gerado em {generated_at}", header_sub),
            ]],
            colWidths=[370, 178],
        )
        banner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#0f172a')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 14),
            ('RIGHTPADDING', (0, 0), (-1, -1), 14),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ]))
        story.append(banner)
        story.append(Spacer(1, 12))

        # 2. KPIs Principais
        fear_greed = _safe_float(portfolio_data.get("fear_greed_score"), 50.0)
        fear_greed_label = portfolio_data.get("fear_greed_label", "Neutro")
        beta = portfolio_data.get("beta")
        sharpe = portfolio_data.get("sharpe")
        var_95 = portfolio_data.get("var_95")
        risk_bits = []
        if beta is not None:
            risk_bits.append(f"Beta {_safe_float(beta):.2f}".replace(".", ","))
        if sharpe is not None:
            risk_bits.append(f"Sharpe {_safe_float(sharpe):.2f}".replace(".", ","))
        if var_95 is not None:
            risk_bits.append(f"VaR 95% {_safe_float(var_95):.2f}%".replace(".", ","))
        risk_str = " · ".join(risk_bits) if risk_bits else f"Termômetro {fear_greed:.0f}/100 ({fear_greed_label})"

        kpi_table = Table(
            [[
                [Paragraph("PATRIMÔNIO TOTAL", kpi_label_style), Paragraph(_fmt_brl(total_atual_brl), kpi_value_style)],
                [Paragraph("TOTAL INVESTIDO", kpi_label_style), Paragraph(_fmt_brl(total_investido_brl), kpi_value_style)],
                [
                    Paragraph("RESULTADO ACUMULADO", kpi_label_style),
                    Paragraph(
                        f"{'+' if lucro_total_brl >= 0 else ''}{_fmt_brl(lucro_total_brl)} ({_fmt_pct(lucro_total_pct, signed=True)})",
                        kpi_value_style,
                    ),
                ],
                [Paragraph("RISCO / SENTIMENTO", kpi_label_style), Paragraph(risk_str, body_style)],
            ]],
            colWidths=[130, 130, 158, 130],
        )
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
            ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#cbd5e1')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 10))

        # 3. Alocação por Classe
        if classes_agg:
            story.append(Paragraph("Alocação por Classe de Ativo", section_style))
            cls_headers = ["Classe", "Ativos", "Investido", "Saldo Atual", "% Carteira", "Lucro / Prejuízo"]
            cls_rows = [[Paragraph(h, th_style) for h in cls_headers]]
            for cls_name, info in sorted(classes_agg.items(), key=lambda kv: kv[1]["atual"], reverse=True):
                pct_cart = (info["atual"] / total_atual_brl * 100.0) if total_atual_brl > 0 else 0.0
                cls_lucro = info["atual"] - info["investido"]
                cls_lucro_pct = (cls_lucro / info["investido"] * 100.0) if info["investido"] > 0 else 0.0
                cls_rows.append([
                    Paragraph(cls_name, td_bold_style),
                    Paragraph(str(info["count"]), td_style),
                    Paragraph(_fmt_brl(info["investido"]), td_style),
                    Paragraph(_fmt_brl(info["atual"]), td_bold_style),
                    Paragraph(_fmt_pct(pct_cart), td_style),
                    Paragraph(f"{'+' if cls_lucro >= 0 else ''}{_fmt_brl(cls_lucro)} ({_fmt_pct(cls_lucro_pct, signed=True)})", td_style),
                ])

            t_cls = Table(cls_rows, colWidths=[95, 45, 95, 95, 68, 150])
            t_cls.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(t_cls)
            story.append(Spacer(1, 10))

        # 4. Posições Detalhadas (ordenadas por maior valor em BRL)
        story.append(Paragraph("Posições Detalhadas (ordenadas por valor em BRL)", section_style))
        pos_headers = ["Ticker", "Classe", "Qtd", "PM", "Cotação", "Total (BRL)", "% Cart.", "Resultado"]
        pos_rows = [[Paragraph(h, th_style) for h in pos_headers]]

        for item in sorted(enriched_assets, key=lambda x: x["atual_brl"], reverse=True):
            pct_cart = (item["atual_brl"] / total_atual_brl * 100.0) if total_atual_brl > 0 else 0.0
            res_str = f"{'+' if item['lucro_brl'] >= 0 else ''}{_fmt_brl(item['lucro_brl'])} ({_fmt_pct(item['lucro_pct'], signed=True)})"
            pos_rows.append([
                Paragraph(item["ticker"], td_bold_style),
                Paragraph(item["classe"], td_style),
                Paragraph(_fmt_qty(item["qtd"]), td_style),
                Paragraph(_fmt_currency(item["pm"], item["moeda"]), td_style),
                Paragraph(_fmt_currency(item["preco"], item["moeda"]), td_style),
                Paragraph(_fmt_brl(item["atual_brl"]), td_bold_style),
                Paragraph(_fmt_pct(pct_cart), td_style),
                Paragraph(res_str, td_style),
            ])

        t_pos = Table(pos_rows, colWidths=[72, 62, 42, 66, 66, 76, 46, 118], repeatRows=1)
        t_pos.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
            ('TOPPADDING', (0, 0), (-1, -1), 4.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(t_pos)
        story.append(Spacer(1, 10))

        # 5. Recebíveis Ativos (apenas quando existirem)
        recebiveis = portfolio_data.get("recebiveis", []) or []
        if recebiveis:
            story.append(Paragraph("Recebíveis e Fluxo de Caixa Ativos", section_style))
            rec_headers = ["Descrição", "Devedor", "Valor Parcela", "Status", "Parcela", "Vencimento"]
            rec_rows = [[Paragraph(h, th_style) for h in rec_headers]]
            for rec in recebiveis:
                rec_rows.append([
                    Paragraph(rec.get("descricao", ""), td_style),
                    Paragraph(rec.get("devedor", ""), td_style),
                    Paragraph(_fmt_brl(_safe_float(rec.get("valor_parcela"))), td_style),
                    Paragraph(rec.get("status", "ABERTA"), td_style),
                    Paragraph(f"{rec.get('parcela_atual', 1)}/{rec.get('total_parcelas', 1)}", td_style),
                    Paragraph(f"Dia {rec.get('vencimento_dia', 1)}", td_style),
                ])
            t_rec = Table(rec_rows, colWidths=[140, 110, 82, 68, 60, 88], repeatRows=1)
            t_rec.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
                ('TOPPADDING', (0, 0), (-1, -1), 4.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
            ]))
            story.append(t_rec)
            story.append(Spacer(1, 10))

        # 6. Destaques Objetivos
        story.append(Paragraph("Destaques da Carteira", section_style))
        highlights = portfolio_data.get("comentario_ia")
        if not highlights and enriched_assets:
            top_gainers = sorted(enriched_assets, key=lambda x: x["lucro_brl"], reverse=True)[:3]
            top_losers = sorted(enriched_assets, key=lambda x: x["lucro_brl"])[:3]
            gainers_str = ", ".join(f"{x['ticker']} (+{_fmt_brl(x['lucro_brl'])})" for x in top_gainers if x["lucro_brl"] > 0) or "Nenhum"
            losers_str = ", ".join(f"{x['ticker']} ({_fmt_brl(x['lucro_brl'])})" for x in top_losers if x["lucro_brl"] < 0) or "Nenhum"
            highlights = (
                f"<b>Maiores ganhos acumulados:</b> {gainers_str}.<br/>"
                f"<b>Maiores pressões negativas:</b> {losers_str}.<br/>"
                f"<b>Termômetro Local:</b> {fear_greed:.1f}/100 ({fear_greed_label})."
            )
        story.append(Paragraph(highlights or "Carteira consolidada com sucesso.", body_style))

        doc.build(story)
        return True
    except Exception as e:
        logging.error(f"❌ Falha ao criar PDF: {e}", exc_info=True)
        return False
