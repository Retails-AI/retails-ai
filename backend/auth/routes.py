from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from auth.user_service import create_user, get_user_by_username_or_email, get_user_by_id
from auth.password import verify_password

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/register', methods=['POST'])
def register_user():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role', 'staff')

        if not username or not email or not password:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: username, email, and password are required."
            }), 400

        new_user = create_user(
            username=username.strip(),
            email=email.strip().lower(),
            plain_password=password,
            role=role.strip().lower()
        )

        return jsonify({
            "status": "success",
            "message": "User registered successfully.",
            "data": new_user
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


@auth_bp.route('/login', methods=['POST'])
def login_user():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "status": "error",
                "message": "Invalid or missing JSON payload."
            }), 400

        identifier = data.get('identifier')
        password = data.get('password')

        if not identifier or not password:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: identifier (username/email) and password are required."
            }), 400

        user = get_user_by_username_or_email(identifier.strip(), include_password=True)

        if not user or not verify_password(password, user['password_hash']):
            return jsonify({
                "status": "error",
                "message": "Invalid credentials provided."
            }), 401

        safe_user_data = {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "role": user['role'],
            "created_at": user['created_at'].isoformat() if user.get('created_at') else None
        }

        access_token = create_access_token(identity=str(user['id']), additional_claims={"role": user['role']})

        return jsonify({
            "status": "success",
            "message": "Login successful.",
            "access_token": access_token,
            "data": safe_user_data
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user_profile():
    """
    Protected endpoint to fetch the profile of the currently logged-in user 
    using the JWT identity token. Returns safe user details without password data.
    """
    try:
        # Extract user ID stored as identity inside the JWT
        current_user_id = get_jwt_identity()
        
        # Retrieve user record using the service layer function
        user = get_user_by_id(int(current_user_id))
        
        if not user:
            return jsonify({
                "status": "error",
                "message": "User associated with this token no longer exists."
            }), 404

        # Format datetime object to ISO string safely if present
        if user.get('created_at'):
            user['created_at'] = user['created_at'].isoformat()

        return jsonify({
            "status": "success",
            "data": user
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500