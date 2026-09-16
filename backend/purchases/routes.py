from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from middleware.auth import role_required
from purchases.service import (
    create_purchase,
    get_purchase_by_id,
    get_all_purchases
)

purchases_bp = Blueprint('purchases', __name__, url_prefix='/api/purchases')

def serialize_purchase(record):
    """
    Helper to safely serialize Decimal values, datetime objects, and nested purchase items for JSON responses.
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


@purchases_bp.route('', methods=['GET'])
@jwt_required()
def list_purchases():
    """
    GET /api/purchases - Retrieve all purchase history records.
    Accessible by any authenticated user.
    """
    try:
        records = get_all_purchases()
        serialized = [serialize_purchase(r) for r in records]
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


@purchases_bp.route('/<int:purchase_id>', methods=['GET'])
@jwt_required()
def get_purchase(purchase_id):
    """
    GET /api/purchases/<purchase_id> - Retrieve a specific purchase order with supplier info, staff, and line items.
    Accessible by any authenticated user.
    """
    try:
        record = get_purchase_by_id(purchase_id)
        if not record:
            return jsonify({
                "status": "error",
                "message": "Purchase record not found."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_purchase(record)
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


@purchases_bp.route('', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def add_purchase():
    """
    POST /api/purchases - Record a new purchase order atomically with line items.
    Restricted to admin and manager roles. Securely extracts staff user_id from JWT.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        supplier_id = data.get('supplier_id')
        items = data.get('items')

        if supplier_id is None or not items:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: supplier_id and items are required."
            }), 400

        # Extract current logged-in user ID securely from JWT identity claim
        current_user_id = get_jwt_identity()

        purchase_record = create_purchase(
            user_id=int(current_user_id),
            supplier_id=int(supplier_id),
            items=items
        )

        return jsonify({
            "status": "success",
            "message": "Purchase order recorded successfully and inventory updated.",
            "data": serialize_purchase(purchase_record)
        }), 201

    except LookupError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 404
    except ValueError as e:
        # Handles inactive suppliers/products, invalid quantities, or missing inventory records
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500