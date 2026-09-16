import os
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from config import config
from database.connection import get_db_connection
from auth.routes import auth_bp
from products.routes import products_bp
from inventory.routes import inventory_bp
from customers.routes import customers_bp
from suppliers.routes import suppliers_bp
from sales.routes import sales_bp
from purchases.routes import purchases_bp
from expenses.routes import expenses_bp
from reports.routes import reports_bp
from ai.routes import ai_bp
from assistant.routes import assistant_bp
from flask_cors import CORS


def create_app(config_name=None):
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')
        
    app = Flask(__name__)
    CORS(app)

    app.config.from_object(config[config_name])
    jwt = JWTManager(app)
    app.register_blueprint(auth_bp)
    app.register_blueprint(products_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(customers_bp)
    app.register_blueprint(suppliers_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(purchases_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(assistant_bp)
    
    @app.route('/health', methods=['GET'])
    def health_check():
        try:
            conn = get_db_connection()
            conn.close()
            return jsonify({
                "status": "success",
                "message": "Flask backend service is alive and running!",
                "database_foundation": "PostgreSQL connection foundation verified successfully via connection.py!"
            }), 200
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": "Flask backend service is running, but database connection failed.",
                "database_foundation": str(e)
            }), 500

    return app

if __name__ == '__main__':
    env_name = os.getenv('FLASK_ENV', 'development')
    app = create_app(env_name)
    app.run(host='0.0.0.0', port=5000, debug=True)