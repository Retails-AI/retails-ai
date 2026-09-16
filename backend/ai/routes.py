from decimal import Decimal
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from middleware.auth import role_required
from ai.service import generate_business_insights

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')

def serialize_data(data):
    """
    Helper to serialize Decimals for JSON responses.
    """
    if isinstance(data, dict):
        return {k: serialize_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [serialize_data(item) for item in data]
    elif isinstance(data, Decimal):
        return float(data)
    return data


@ai_bp.route('/insights', methods=['GET', 'POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def get_ai_insights():
    """
    GET /api/ai/insights - Generates structured AI insights and recommendations 
    based on aggregated business analytics. Restricted to admin and manager roles.
    """
    try:
        insights = generate_business_insights()
        return jsonify({
            "status": "success",
            "data": serialize_data(insights)
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500