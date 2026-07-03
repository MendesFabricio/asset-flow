from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from datetime import datetime
import os

def generate_monthly_report_pdf(output_path: str, portfolio_data: dict) -> bool:
    """
    Generates a beautiful monthly portfolio performance PDF report using ReportLab.
    """
    try:
        def safe_float(val):
            try:
                return float(val) if val is not None else 0.0
            except:
                return 0.0

        # Garante a existência do diretório
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Cria o documento
        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        
        styles = getSampleStyleSheet()
        
        # Estilos Customizados
        title_style = ParagraphStyle(
            name='TitleStyle',
            parent=styles['Heading1'],
            fontSize=22,
            textColor=colors.HexColor('#0ea5e9'),  # Cor azul primária do Next
            spaceAfter=15
        )
        
        subtitle_style = ParagraphStyle(
            name='SubtitleStyle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#64748b'),
            spaceAfter=25
        )
        
        section_style = ParagraphStyle(
            name='SectionStyle',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#1e293b'),
            spaceBefore=15,
            spaceAfter=10
        )
        
        body_style = ParagraphStyle(
            name='BodyStyle',
            parent=styles['BodyText'],
            fontSize=9,
            textColor=colors.HexColor('#334155'),
            spaceAfter=6
        )
        
        table_header_style = ParagraphStyle(
            name='TableHeaderStyle',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.white,
            fontName='Helvetica-Bold'
        )
        
        table_body_style = ParagraphStyle(
            name='TableBodyStyle',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#334155')
        )

        story = []
        
        # 1. Título & Cabeçalho
        story.append(Paragraph("AssetFlow Pro", title_style))
        story.append(Paragraph(f"Relatório Patrimonial Mensal Consolidado — Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}", subtitle_style))
        story.append(Spacer(1, 10))
        
        # 2. Resumo Executivo
        story.append(Paragraph("Resumo da Carteira", section_style))
        total_val = safe_float(portfolio_data.get("resumo", {}).get("Total", 0.0))
        fear_greed = portfolio_data.get("fear_greed_score", 50)
        fear_greed_label = portfolio_data.get("fear_greed_label", "Neutro")
        
        resumo_text = (
            f"<b>Patrimônio Total Custodiado:</b> R$ {total_val:,.2f}<br/>"
            f"<b>Índice de Sentimento Local (Fear & Greed):</b> {fear_greed}/100 ({fear_greed_label})<br/>"
            f"<b>Métricas de Risco Gerais:</b> Beta={portfolio_data.get('beta', '1.0')} | Sharpe={portfolio_data.get('sharpe', '0.0')} | VaR 95%={portfolio_data.get('var_95', '0.0')}%<br/>"
        )
        story.append(Paragraph(resumo_text, body_style))
        story.append(Spacer(1, 15))
        
        # 3. Tabela de Posições
        story.append(Paragraph("Detalhamento dos Ativos em Carteira", section_style))
        
        headers = ["Ticker", "Classe", "Moeda", "Qtd", "PM", "Cotação", "Total Posição", "Meta (%)"]
        table_data = [[Paragraph(h, table_header_style) for h in headers]]
        
        for asset in portfolio_data.get("ativos", []):
            ticker = asset.get("ticker", "")
            tipo = asset.get("tipo", "Outros")
            moeda = asset.get("currency", "BRL")
            qtd = safe_float(asset.get("qtd"))
            pm = safe_float(asset.get("pm"))
            preco = safe_float(asset.get("preco_atual"))
            total = safe_float(asset.get("total_atual"))
            meta = safe_float(asset.get("meta"))

            row = [
                Paragraph(ticker, table_body_style),
                Paragraph(tipo, table_body_style),
                Paragraph(moeda, table_body_style),
                Paragraph(f"{qtd:,.2f}", table_body_style),
                Paragraph(f"R$ {pm:,.2f}" if moeda == "BRL" else f"$ {pm:,.2f}", table_body_style),
                Paragraph(f"R$ {preco:,.2f}" if moeda == "BRL" else f"$ {preco:,.2f}", table_body_style),
                Paragraph(f"R$ {total:,.2f}" if moeda == "BRL" else f"$ {total:,.2f}", table_body_style),
                Paragraph(f"{meta:.1f}%", table_body_style)
            ]
            table_data.append(row)
            
        t = Table(table_data, colWidths=[55, 60, 40, 50, 65, 65, 80, 45])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 20))
        
        # 4. Recebíveis e Fluxo de Caixa Futuro
        story.append(Paragraph("Recebíveis e Fluxo de Caixa Ativos", section_style))
        receivables_headers = ["Descrição", "Devedor", "Valor Parcela", "Status", "Parcela", "Vencimento"]
        rec_data = [[Paragraph(h, table_header_style) for h in receivables_headers]]
        
        for rec in portfolio_data.get("recebiveis", []):
            row = [
                Paragraph(rec.get("descricao", ""), table_body_style),
                Paragraph(rec.get("devedor", ""), table_body_style),
                Paragraph(f"R$ {rec.get('valor_parcela', 0.0):,.2f}", table_body_style),
                Paragraph(rec.get("status", "Pendente"), table_body_style),
                Paragraph(f"{rec.get('parcela_atual', 1)}/{rec.get('total_parcelas', 1)}", table_body_style),
                Paragraph(f"Dia {rec.get('vencimento_dia', 1)}", table_body_style)
            ]
            rec_data.append(row)
            
        if len(rec_data) > 1:
            t_rec = Table(rec_data, colWidths=[120, 100, 75, 60, 55, 75])
            t_rec.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#334155')),
                ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
                ('TOPPADDING', (0,0), (-1,-1), 5),
                ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ]))
            story.append(t_rec)
        else:
            story.append(Paragraph("Nenhum recebível ativo registrado.", body_style))
            
        story.append(Spacer(1, 20))
        
        # 5. Destaque Final / Racional
        story.append(Paragraph("Considerações da IA (Jarvis)", section_style))
        comentario_ia = portfolio_data.get(
            "comentario_ia",
            "A alocação da carteira permanece estável. Lembre-se de rebalancear os ativos que desviaram da meta utilizando a aba 'Análise Quant' do painel."
        )
        story.append(Paragraph(comentario_ia, body_style))
        
        # Build PDF
        doc.build(story)
        return True
    except Exception as e:
        import logging
        logging.error(f"❌ Falha ao criar PDF: {e}", exc_info=True)
        return False
