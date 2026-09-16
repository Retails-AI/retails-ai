from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from middleware.auth import role_required
from sales.service import (
    create_sale,
    get_sale_by_id,
    get_all_sales
)

sales_bp = Blueprint('sales', __name__, url_prefix='/api/sales')

def serialize_sale(record):
    """
    Helper to safely serialize Decimal values, datetime objects, and nested items for JSON responses.
    """
    if not record:
        return None
    
    serialized = dict(record)
    for key, value in serialized.items():
        if hasattr(value, 'isoformat'):
            serialized[key] = value.isoformat()
        elif isinstance(value, Decimal):
            serialized[key] = float(value)
            
    # Serialize nested line items if present
    if "items" in serialized and isinstance(serialized["items"], list):
        serialized_items = []
        for item in serialized["items"]:
            item_dict = dict(item)
            for k, v in item_dict.items():
                if hasattr(v, 'isoformat'):
                    item_dict[k] = v.isoformat()
                elif isinstance(v, Decimal):
                    item_dict[k] = float(v)
            serialized_items.append(item_dict)
        serialized["items"] = serialized_items
        
    return serialized


@sales_bp.route('', methods=['GET'])
@jwt_required()
def list_sales():
    """
    GET /api/sales - Retrieve all sales history records.
    Accessible by any authenticated user.
    """
    try:
        records = get_all_sales()
        serialized = [serialize_sale(r) for r in records]
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


@sales_bp.route('/<int:sale_id>', methods=['GET'])
@jwt_required()
def get_sale(sale_id):
    """
    GET /api/sales/<sale_id> - Retrieve a specific sale with customer info, staff, and line items.
    Accessible by any authenticated user.
    """
    try:
        record = get_sale_by_id(sale_id)
        if not record:
            return jsonify({
                "status": "error",
                "message": "Sale record not found."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_sale(record)
        }), 200
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 404
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500


@sales_bp.route('', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager', 'cashier'])
def add_sale():
    """
    POST /api/sales - Record a new sale atomically with line items.
    Restricted to admin, manager, and cashier roles. Securely extracts staff user_id from JWT.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        items = data.get('items')
        customer_id = data.get('customer_id') # Optional
        payment_method = data.get('payment_method', 'CASH')

        if not items:
            return jsonify({
                "status": "error",
                "message": "Missing required field: items array is required."
            }), 400

        # Extract current logged-in user ID securely from JWT identity claim
        current_user_id = get_jwt_identity()

        sale_record = create_sale(
            user_id=int(current_user_id),
            items=items,
            customer_id=int(customer_id) if customer_id is not None else None,
            payment_method=payment_method
        )

        return jsonify({
            "status": "success",
            "message": "Sale recorded successfully and inventory updated.",
            "data": serialize_sale(sale_record)
        }), 201

    except ValueError as e:
        # Handles insufficient stock, invalid product/customer, or invalid payment methods
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500