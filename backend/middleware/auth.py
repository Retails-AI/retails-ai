from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity

def role_required(required_roles):
    """
    Decorator to secure routes and restrict access based on user roles.
    Accepts a single role string or a list/tuple of allowed roles (e.g., 'admin', 'manager', 'cashier', 'staff').
    """
    if isinstance(required_roles, str):
        required_roles = [required_roles]

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                # Verifies that a valid JWT is attached to the request headers
                verify_jwt_in_request()
                
                # Extract claims embedded during login
                claims = get_jwt()
                user_role = claims.get("role")
                
                # Check if user role matches any of the allowed roles
                if not user_role or user_role not in required_roles:
                    return jsonify({
                        "status": "error",
                        "message": "Access denied. Insufficient permissions to perform this action."
                    }), 403
                    
                return fn(*args, **kwargs)
                
            except Exception as e:
                # Triggers if token is missing, expired, or malformed
                return jsonify({
                    "status": "error",
                    "message": f"Authentication required. Token is missing or invalid: {str(e)}"
                }), 401
                
        return wrapper
    return decorator