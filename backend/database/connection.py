import psycopg2
from flask import current_app
from config import Config

def get_db_connection():
    """
    Creates and returns a raw PostgreSQL database connection 
    using configuration settings with proper error handling.
    """
    try:
        # Use Flask application context config if available, otherwise fallback to Config class
        if current_app:
            db_name = current_app.config['DB_NAME']
            db_user = current_app.config['DB_USER']
            db_password = current_app.config['DB_PASSWORD']
            db_host = current_app.config['DB_HOST']
            db_port = current_app.config['DB_PORT']
        else:
            db_name = Config.DB_NAME
            db_user = Config.DB_USER
            db_password = Config.DB_PASSWORD
            db_host = Config.DB_HOST
            db_port = Config.DB_PORT

        connection = psycopg2.connect(
            dbname=db_name,
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port
        )
        return connection
        
    except psycopg2.OperationalError as e:
        raise ConnectionError(f"PostgreSQL operational failure: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Unexpected database connection error: {str(e)}")