from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from middleware.auth import role_required
from database.connection import get_db_connection
from inventory.service import (
    get_all_inventory,
    get_inventory_by_product_id,
    create_inventory_for_product,
    adjust_stock,
    update_reorder_level,
    get_low_stock_products
)
from inventory.movement_service import record_inventory_movement

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')

def serialize_inventory(record):
    """
    Helper to safely serialize datetime objects for JSON responses.
    """
    if not record:
        return None
    
    serialized = dict(record)
    for key, value in serialized.items():
        if hasattr(value, 'isoformat'):
            serialized[key] = value.isoformat()
    return serialized


@inventory_bp.route('', methods=['GET'])
@jwt_required()
def list_inventory():
    """
    GET /api/inventory - Retrieve inventory for all active products.
    """
    try:
        records = get_all_inventory()
        serialized = [serialize_inventory(r) for r in records]
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


@inventory_bp.route('/low-stock', methods=['GET'])
@jwt_required()
def list_low_stock_inventory():
    """
    GET /api/inventory/low-stock - Retrieve low stock items at or below reorder level.
    """
    try:
        records = get_low_stock_products()
        serialized = [serialize_inventory(r) for r in records]
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


@inventory_bp.route('/<int:product_id>', methods=['GET'])
@jwt_required()
def get_inventory_item(product_id):
    """
    GET /api/inventory/<product_id> - Retrieve inventory for a specific product.
    """
    try:
        record = get_inventory_by_product_id(product_id)
        if not record:
            return jsonify({
                "status": "error",
                "message": "Inventory record not found or product is inactive."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_inventory(record)
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


@inventory_bp.route('/<int:product_id>/initialize', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def initialize_product_inventory(product_id):
    """
    POST /api/inventory/<product_id>/initialize - Initialize inventory for a product.
    """
    try:
        data = request.get_json() or {}
        initial_stock = data.get('initial_stock', 0)
        reorder_level = data.get('reorder_level', 10)

        record = create_inventory_for_product(
            product_id=product_id,
            initial_stock=initial_stock,
            reorder_level=reorder_level
        )

        return jsonify({
            "status": "success",
            "message": "Inventory initialized successfully.",
            "data": serialize_inventory(record)
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


@inventory_bp.route('/<int:product_id>/stock', methods=['PATCH'])
@jwt_required()
@role_required(['admin', 'manager'])
def modify_stock(product_id):
    """
    PATCH /api/inventory/<product_id>/stock - Controlled adjustment of stock quantity (delta).
    """
    try:
        data = request.get_json()
        if not data or 'quantity_delta' not in data:
            return jsonify({
                "status": "error",
                "message": "Missing required field: quantity_delta is required."
            }), 400

        delta = data.get('quantity_delta')
        record = adjust_stock(product_id=product_id, quantity_delta=delta)

        return jsonify({
            "status": "success",
            "message": "Stock adjusted successfully.",
            "data": serialize_inventory(record)
        }), 200

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


@inventory_bp.route('/<int:product_id>/reorder-level', methods=['PATCH'])
@jwt_required()
@role_required(['admin', 'manager'])
def modify_reorder_level(product_id):
    """
    PATCH /api/inventory/<product_id>/reorder-level - Update reorder alert threshold.
    """
    try:
        data = request.get_json()
        if not data or 'reorder_level' not in data:
            return jsonify({
                "status": "error",
                "message": "Missing required field: reorder_level is required."
            }), 400

        new_level = data.get('reorder_level')
        record = update_reorder_level(product_id=product_id, new_reorder_level=new_level)

        return jsonify({
            "status": "success",
            "message": "Reorder level updated successfully.",
            "data": serialize_inventory(record)
        }), 200

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


@inventory_bp.route('/movements', methods=['GET'])
@jwt_required()
def list_inventory_movements():
    """
    GET /api/inventory/movements - Retrieve inventory movements, optionally filtered by product_id query param.
    """
    try:
        product_id = request.args.get('product_id')
        connection = get_db_connection()
        cursor = connection.cursor()
        
        if product_id:
            query = "SELECT * FROM inventory_movements WHERE product_id = %s ORDER BY created_at DESC;"
            cursor.execute(query, (int(product_id),))
        else:
            query = "SELECT * FROM inventory_movements ORDER BY created_at DESC;"
            cursor.execute(query)
            
        columns = [desc[0] for desc in cursor.description]
        records = [dict(zip(columns, row)) for row in cursor.fetchall()]
        cursor.close()
        connection.close()
        
        serialized = [serialize_inventory(r) for r in records]
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


@inventory_bp.route('/movements', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def add_inventory_movement():
    """
    POST /api/inventory/movements - Record an inventory movement (Purchase, Sale, Manual Adjustment).
    Restricted to admin and manager roles. Extracts user_id securely from the JWT token.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        product_id = data.get('product_id')
        change_quantity = data.get('change_quantity')
        movement_type = data.get('movement_type')
        reference_id = data.get('reference_id') # Optional

        if product_id is None or change_quantity is None or not movement_type:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: product_id, change_quantity, and movement_type are required."
            }), 400

        # Extract current logged-in user ID securely from JWT identity claim
        current_user_id = get_jwt_identity()

        movement_result = record_inventory_movement(
            product_id=int(product_id),
            change_quantity=int(change_quantity),
            movement_type=str(movement_type),
            user_id=int(current_user_id),
            reference_id=int(reference_id) if reference_id is not None else None
        )

        return jsonify({
            "status": "success",
            "message": "Inventory movement recorded successfully.",
            "data": movement_result
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