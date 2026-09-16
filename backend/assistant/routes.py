from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from assistant.service import process_user_query

assistant_bp = Blueprint('assistant_bp', __name__, url_prefix='/api/assistant')

@assistant_bp.route('/ask', methods=['POST'])
@jwt_required()
def ask_assistant():
    """
    POST /api/assistant/ask
    Available to all authenticated users (Admin, Manager, Staff/Cashier).
    Supports optional conversation_context for multi-turn chat handling.
    """
    try:
        current_user_identity = get_jwt_identity()
        
        if isinstance(current_user_identity, dict):
            user_id = current_user_identity.get('id')
            user_role = current_user_identity.get('role')
        else:
            user_id = current_user_identity
            user_role = None

        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({
                "status": "error",
                "message": "Missing 'query' field in request body."
            }), 400

        user_query = data['query']
        conversation_context = data.get('conversation_context', None)

        # Pass query and conversation history context to assistant service layer
        result = process_user_query(
            query=user_query, 
            user_id=user_id, 
            user_role=user_role, 
            conversation_context=conversation_context
        )

        return jsonify({
            "status": "success",
            "data": result
        }), 200

    except ValueError as ve:
        return jsonify({
            "status": "error",
            "message": str(ve)
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An internal error occurred: {str(e)}"
        }), 500