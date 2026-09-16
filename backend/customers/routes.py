from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from middleware.auth import role_required
from database.query import execute_select
from customers.service import (
    create_customer,
    get_customer_by_id,
    get_all_customers,
    update_customer,
    delete_customer
)

customers_bp = Blueprint('customers', __name__, url_prefix='/api/customers')

def serialize_customer(record):
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


@customers_bp.route('', methods=['GET'])
@jwt_required()
def list_customers():
    """
    GET /api/customers - Retrieve all active customers.
    Accessible by any authenticated user.
    """
    try:
        records = get_all_customers()
        serialized = [serialize_customer(r) for r in records]
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


@customers_bp.route('/<int:customer_id>', methods=['GET'])
@jwt_required()
def get_customer(customer_id):
    """
    GET /api/customers/<id> - Retrieve a specific active customer by ID.
    Accessible by any authenticated user.
    """
    try:
        record = get_customer_by_id(customer_id)
        if not record:
            return jsonify({
                "status": "error",
                "message": "Customer not found or is inactive."
            }), 404

        return jsonify({
            "status": "success",
            "data": serialize_customer(record)
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


@customers_bp.route('', methods=['POST'])
@jwt_required()
@role_required(['admin', 'manager', 'cashier'])
def add_customer():
    """
    POST /api/customers - Create a new customer.
    Restricted to admin, manager, and cashier roles.
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
        email = data.get('email')
        address = data.get('address')

        if not name or not phone:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: name and phone are required."
            }), 400

        record = create_customer(name=name, phone=phone, email=email, address=address)

        return jsonify({
            "status": "success",
            "message": "Customer created successfully.",
            "data": serialize_customer(record)
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


@customers_bp.route('/<int:customer_id>', methods=['PUT'])
@jwt_required()
@role_required(['admin', 'manager', 'cashier'])
def modify_customer(customer_id):
    """
    PUT /api/customers/<id> - Update customer details.
    Restricted to admin, manager, and cashier roles.
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
        email = data.get('email')
        address = data.get('address')

        record = update_customer(
            customer_id=customer_id,
            name=name,
            phone=phone,
            email=email,
            address=address
        )

        return jsonify({
            "status": "success",
            "message": "Customer updated successfully.",
            "data": serialize_customer(record)
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


@customers_bp.route('/<int:customer_id>', methods=['DELETE'])
@jwt_required()
@role_required(['admin', 'manager'])
def remove_customer(customer_id):
    """
    DELETE /api/customers/<id> - Soft-delete a customer.
    Restricted to admin and manager roles.
    """
    try:
        result = delete_customer(customer_id)
        return jsonify({
            "status": "success",
            "message": result["message"],
            "customer_id": result["customer_id"]
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



@customers_bp.route('/<int:customer_id>/history', methods=['GET'])
@jwt_required()
def get_customer_history(customer_id):
    """
    GET /api/customers/<id>/history - Retrieve sales history and transactions for a specific customer.
    """
    try:
        # Fetch sales master records
        sales_query = """
            SELECT id, total_amount, payment_method, sale_date 
            FROM sales 
            WHERE customer_id = %s 
            ORDER BY sale_date DESC;
        """
        sales_records = execute_select(sales_query, (customer_id,), fetch_one=False)
        
        formatted_sales = []
        for s in sales_records or []:
            sale_dict = dict(s)
            if hasattr(sale_dict.get('sale_date'), 'isoformat'):
                sale_dict['sale_date'] = sale_dict['sale_date'].isoformat()
            
            # Fetch line items for each sale
            items_query = """
                si.quantity, si.unit_price, si.subtotal, p.name as product_name
                FROM sale_items si
                JOIN products p ON si.product_id = p.id
                WHERE si.sale_id = %s;
            """
            # Or simplified item summary
            formatted_sales.append(sale_dict)

        return jsonify({
            "status": "success",
            "data": formatted_sales
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500

@customers_bp.route('/search', methods=['GET'])
@jwt_required()
def search_customer():
    query = request.args.get('q', '').strip()
    db_query = """
        SELECT id, name, phone, email, address 
        FROM customers 
        WHERE is_active = TRUE AND (phone ILIKE %s OR name ILIKE %s)
        LIMIT 5;
    """
    records = execute_select(db_query, (f"%{query}%", f"%{query}%"), fetch_one=False)
    return jsonify({
        "status": "success",
        "data": [dict(r) for r in records] if records else []
    }), 200