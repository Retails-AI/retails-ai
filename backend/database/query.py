import psycopg2
import psycopg2.extras
from database.connection import get_db_connection

def execute_select(query, params=None, fetch_one=False):
    """
    Executes a SELECT query and returns results as dictionaries.
    fetch_one=True returns a single record, False returns all records.
    """
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(query, params or ())
        
        if fetch_one:
            result = cursor.fetchone()
        else:
            result = cursor.fetchall()
            
        return result
    except Exception as e:
        raise RuntimeError(f"Database SELECT execution error: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def execute_write(query, params=None, fetch_id=False):
    """
    Executes an INSERT, UPDATE, or DELETE query with transaction handling.
    If fetch_id=True (useful for INSERTs), returns the newly generated primary key id.
    """
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        if fetch_id:
            # Safely strip all trailing whitespace and semicolons, then append RETURNING id
            clean_query = query.strip().rstrip(';')
            if "RETURNING" not in clean_query.upper():
                query = f"{clean_query} RETURNING id;"
                
        cursor.execute(query, params or ())
        
        inserted_id = None
        if fetch_id:
            row = cursor.fetchone()
            if row:
                inserted_id = row[0]
                
        connection.commit()
        return inserted_id if fetch_id else cursor.rowcount
        
    except Exception as e:
        if connection:
            connection.rollback()
        raise RuntimeError(f"Database WRITE execution error: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def execute_transaction(operations):
    """
    Executes multiple write operations within a single atomic transaction block.
    'operations' is a list of tuples: (query_string, params_tuple)
    """
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        for query, params in operations:
            cursor.execute(query, params or ())
            
        connection.commit()
        return True
    except Exception as e:
        if connection:
            connection.rollback()
        raise RuntimeError(f"Database transaction failed and rolled back: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()