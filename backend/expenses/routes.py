from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from middleware.auth import role_required
from expenses.service import (
    create_expense,
    get_expense_by_id,
    get_all_expenses
)

expenses_bp = Blueprint('expenses', __name__, url_prefix='/api/expenses')

def serialize_expense(record):
    """
    Helper to safely serialize Decimal values and datetime objects for JSON responses.
    """
    if not record:
        return None
    
    serialized = dict(record)
    for key, value in serialized.items():
        if hasattr(value, 'isoformat'):
            serialized[key] = value.isoformat()
        elif isinstance(value, Decimal):
            serialized[key] = float(value)
    return serialized


@expenses_bp.route('', methods=['GET'])
@jwt_required()
def list_expenses():
    """
    GET /api/expenses - Retrieve all expense records.
    Accessible by any authenticated user.
    """
    try:
        records = get_all_expenses()
        serialized = [serialize_expense(r) for r in records]
        return jsonify({
            "status": "success",
            "count": len(serialized),
            "data": serialized
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500


@expenses_bp.route('/<int:expense_id>', methods=['GET'])
@jwt_required()
def get_expense(expense_id):
    """
    GET /api/expenses/<expense_id> - Retrieve a specific expense record by ID.
    Accessible by any authenticated user.
    """
    try:
        record = get_expense_by_id(expense_id)
        if not record:
            return jsonify({
                "status": "error",
                "message": "Expense record not found."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_expense(record)
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500


@expenses_bp.route('', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def add_expense():
    """
    POST /api/expenses - Record a new business expense.
    Restricted to admin and manager roles. Securely extracts staff user_id from JWT.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        category = data.get('category')
        amount = data.get('amount')
        description = data.get('description')
        expense_date = data.get('expense_date')

        if not category or amount is None:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: category and amount are required."
            }), 400

        current_user_id = get_jwt_identity()

        expense_record = create_expense(
            user_id=int(current_user_id),
            category=category,
            amount=amount,
            description=description,
            expense_date=expense_date
        )

        return jsonify({
            "status": "success",
            "message": "Expense recorded successfully.",
            "data": serialize_expense(expense_record)
        }), 201

    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500