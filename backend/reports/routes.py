from decimal import Decimal
from datetime import date, datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from middleware.auth import role_required
from reports.service import (
    get_financial_summary,
    get_transaction_counts,
    get_inventory_summary,
    get_trends,
    get_performance_metrics
)

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')

def serialize_metrics(data):
    """
    Recursive helper to convert Decimals, dates, and datetimes into JSON-serializable formats.
    """
    if isinstance(data, dict):
        return {k: serialize_metrics(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [serialize_metrics(item) for item in data]
    elif isinstance(data, Decimal):
        return float(data)
    elif isinstance(data, (date, datetime)):
        return data.isoformat()
    return data


@reports_bp.route('/summary', methods=['GET'])
@jwt_required()
@role_required(['admin', 'manager','cashier'])
def get_summary_report():
    """
    GET /api/reports/summary - Comprehensive business analytics overview with period filtering.
    Restricted to admin and manager roles.
    """
    try:
        # Optional query parameters
        threshold = request.args.get('low_stock_threshold', 10, type=int)
        period = request.args.get('period', '7d').lower()
        
        # Map timeframe periods to day limits
        limit_map = {
            '7d': 7,
            '1m': 30,
            '1y': 365
        }
        days = limit_map.get(period, 7)
        
        # Pass days to all relevant service functions for true time-range filtering
        financials = get_financial_summary(days=days)
        counts = get_transaction_counts(days=days)
        inventory = get_inventory_summary(threshold=threshold)
        trends = get_trends(days=days)
        performance = get_performance_metrics(days=days)

        report_data = {
            "financial_summary": financials,
            "transaction_counts": counts,
            "inventory_summary": inventory,
            "trends": trends,
            "performance_metrics": performance
        }

        return jsonify({
            "status": "success",
            "data": serialize_metrics(report_data)
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500