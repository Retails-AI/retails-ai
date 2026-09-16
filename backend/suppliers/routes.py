from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from middleware.auth import role_required
from suppliers.service import (
    create_supplier,
    get_supplier_by_id,
    get_all_suppliers,
    update_supplier,
    delete_supplier
)

suppliers_bp = Blueprint('suppliers', __name__, url_prefix='/api/suppliers')

def serialize_supplier(record):
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


@suppliers_bp.route('', methods=['GET'])
@jwt_required()
def list_suppliers():
    """
    GET /api/suppliers - Retrieve all active suppliers.
    Accessible by any authenticated user.
    """
    try:
        records = get_all_suppliers()
        serialized = [serialize_supplier(r) for r in records]
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


@suppliers_bp.route('/<int:supplier_id>', methods=['GET'])
@jwt_required()
def get_supplier(supplier_id):
    """
    GET /api/suppliers/<id> - Retrieve a specific active supplier by ID.
    Accessible by any authenticated user.
    """
    try:
        record = get_supplier_by_id(supplier_id)
        if not record:
            return jsonify({
                "status": "error",
                "message": "Supplier not found or is inactive."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_supplier(record)
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


@suppliers_bp.route('', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager'])
def add_supplier():
    """
    POST /api/suppliers - Create a new supplier.
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
        phone = data.get('phone')
        contact_person = data.get('contact_person')
        email = data.get('email')
        address = data.get('address')

        if not name or not phone:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: name and phone are required."
            }), 400

        record = create_supplier(
            name=name,
            phone=phone,
            contact_person=contact_person,
            email=email,
            address=address
        )

        return jsonify({
            "status": "success",
            "message": "Supplier created successfully.",
            "data": serialize_supplier(record)
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


@suppliers_bp.route('/<int:supplier_id>', methods=['PUT'])
@jwt_required()
@role_required(['admin', 'manager'])
def modify_supplier(supplier_id):
    """
    PUT /api/suppliers/<id> - Update supplier details.
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
        phone = data.get('phone')
        contact_person = data.get('contact_person')
        email = data.get('email')
        address = data.get('address')

        record = update_supplier(
            supplier_id=supplier_id,
            name=name,
            phone=phone,
            contact_person=contact_person,
            email=email,
            address=address
        )

        return jsonify({
            "status": "success",
            "message": "Supplier updated successfully.",
            "data": serialize_supplier(record)
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


@suppliers_bp.route('/<int:supplier_id>', methods=['DELETE'])
@jwt_required()
@role_required(['admin'])
def remove_supplier(supplier_id):
    """
    DELETE /api/suppliers/<id> - Soft-delete a supplier.
    Restricted strictly to the admin role.
    """
    try:
        result = delete_supplier(supplier_id)
        return jsonify({
            "status": "success",
            "message": result["message"],
            "supplier_id": result["supplier_id"]
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