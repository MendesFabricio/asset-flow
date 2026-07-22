from flask import Blueprint, jsonify, request, g
from db.session import Session
from domain.tax.tax_engine import calculate_monthly_darf, get_or_create_tax_profile

tax_bp = Blueprint('tax', __name__)

@tax_bp.route('/api/tax/monthly', methods=['GET'])
def get_monthly_tax():
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400
        
    try:
        user_id = getattr(g, 'user_id', 1)
        report = calculate_monthly_darf(user_id, month, year)
        return jsonify(report), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@tax_bp.route('/api/tax/profile', methods=['GET'])
def get_tax_profile():
    user_id = getattr(g, 'user_id', 1)
    with Session() as session:
        profile = get_or_create_tax_profile(session, user_id)
        return jsonify({
            "accumulated_loss_stocks_st": float(profile.accumulated_loss_stocks_st),
            "accumulated_loss_stocks_dt": float(profile.accumulated_loss_stocks_dt),
            "accumulated_loss_fiis": float(profile.accumulated_loss_fiis),
            "accumulated_darf_balance": float(profile.accumulated_darf_balance)
        }), 200

@tax_bp.route('/api/tax/profile', methods=['POST'])
def update_tax_profile():
    user_id = getattr(g, 'user_id', 1)
    data = request.json or {}
    with Session() as session:
        profile = get_or_create_tax_profile(session, user_id)
        
        if 'accumulated_loss_stocks_st' in data:
            profile.accumulated_loss_stocks_st = data['accumulated_loss_stocks_st']
        if 'accumulated_loss_stocks_dt' in data:
            profile.accumulated_loss_stocks_dt = data['accumulated_loss_stocks_dt']
        if 'accumulated_loss_fiis' in data:
            profile.accumulated_loss_fiis = data['accumulated_loss_fiis']
        if 'accumulated_darf_balance' in data:
            profile.accumulated_darf_balance = data['accumulated_darf_balance']
            
        session.commit()
        return jsonify({"message": "Tax profile updated successfully"}), 200

@tax_bp.route('/api/tax/annual', methods=['GET'])
def get_annual_tax():
    from domain.tax.annual_irpf import calculate_annual_irpf
    year = request.args.get('year', type=int)
    
    if not year:
        return jsonify({"error": "year is required"}), 400
        
    try:
        user_id = getattr(g, 'user_id', 1)
        report = calculate_annual_irpf(user_id, year)
        return jsonify(report), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
