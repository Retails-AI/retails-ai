from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from middleware.auth import role_required
from products.service import (
    get_all_products,
    get_product_by_id,
    create_product,
    update_product,
    delete_product
)

products_bp = Blueprint('products', __name__, url_prefix='/api/products')

def serialize_product(product):
    """
    Helper to safely serialize product dictionaries containing 
    Decimal values and datetime objects for JSON responses.
    """
    if not product:
        return None
    
    serialized = dict(product)
    for key, value in serialized.items():
        if isinstance(value, Decimal):
            serialized[key] = float(value)
        elif hasattr(value, 'isoformat'):
            serialized[key] = value.isoformat()
    return serialized


@products_bp.route('', methods=['GET'])
@jwt_required()
def list_products():
    """
    GET /api/products - Retrieve all active products.
    Accessible by any authenticated user.
    """
    try:
        products = get_all_products()
        serialized_products = [serialize_product(p) for p in products]
        return jsonify({
            "status": "success",
            "count": len(serialized_products),
            "data": serialized_products
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500


@products_bp.route('/<int:product_id>', methods=['GET'])
@jwt_required()
def get_product(product_id):
    """
    GET /api/products/<id> - Retrieve a single product by ID.
    Accessible by any authenticated user.
    """
    try:
        product = get_product_by_id(product_id)
        if not product:
            return jsonify({
                "status": "error",
                "message": "Product not found or inactive."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_product(product)
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500


@products_bp.route('', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def add_product():
    """
    POST /api/products - Create a new product.
    Restricted to admin and manager roles.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        name = data.get('name')
        sku = data.get('sku')
        category = data.get('category')
        unit_price = data.get('unit_price')
        cost_price = data.get('cost_price')

        if not name or not sku or unit_price is None or cost_price is None:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: name, sku, unit_price, and cost_price are required."
            }), 400

        new_product = create_product(
            name=name,
            sku=sku,
            category=category,
            unit_price=unit_price,
            cost_price=cost_price
        )

        return jsonify({
            "status": "success",
            "message": "Product created successfully.",
            "data": serialize_product(new_product)
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


@products_bp.route('/<int:product_id>', methods=['PUT'])
@jwt_required()
@role_required(['admin', 'manager'])
def edit_product(product_id):
    """
    PUT /api/products/<id> - Update an existing product.
    Restricted to admin and manager roles.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        name = data.get('name')
        sku = data.get('sku')
        category = data.get('category')
        unit_price = data.get('unit_price')
        cost_price = data.get('cost_price')

        if not name or not sku or unit_price is None or cost_price is None:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: name, sku, unit_price, and cost_price are required."
            }), 400

        updated_product = update_product(
            product_id=product_id,
            name=name,
            sku=sku,
            category=category,
            unit_price=unit_price,
            cost_price=cost_price
        )

        return jsonify({
            "status": "success",
            "message": "Product updated successfully.",
            "data": serialize_product(updated_product)
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


@products_bp.route('/<int:product_id>', methods=['DELETE'])
@jwt_required()
@role_required(['admin'])
def remove_product(product_id):
    """
    DELETE /api/products/<id> - Soft-deletes/deactivates a product.
    Restricted strictly to admin role to protect historical transaction dependencies.
    """
    try:
        result = delete_product(product_id)
        return jsonify({
            "status": "success",
            "message": result["message"],
            "id": result["id"]
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