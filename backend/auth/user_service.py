from database.query import execute_select, execute_write
from auth.password import hash_password

def get_user_by_id(user_id: int):
    """
    Retrieves a user by ID and returns safe user data (excluding password_hash).
    """
    query = """
        SELECT id, username, email, role, created_at 
        FROM users 
        WHERE id = %s;
    """
    user = execute_select(query, (user_id,), fetch_one=True)
    return dict(user) if user else None


def get_user_by_username_or_email(identifier: str, include_password: bool = False):
    """
    Retrieves a user by either username or email. 
    By default, excludes password_hash unless include_password=True (for authentication login).
    """
    columns = "id, username, email, role, created_at"
    if include_password:
        columns = "id, username, email, password_hash, role, created_at"
        
    query = f"""
        SELECT {columns} 
        FROM users 
        WHERE username = %s OR email = %s;
    """
    user = execute_select(query, (identifier, identifier), fetch_one=True)
    return dict(user) if user else None


def create_user(username: str, email: str, plain_password: str, role: str = 'staff'):
    """
    Creates a new user after verifying unique constraints, 
    hashing the password, and returning safe user data.
    """
    # 1. Check for duplicate username or email
    existing_user_query = """
        SELECT id FROM users 
        WHERE username = %s OR email = %s;
    """
    existing_user = execute_select(existing_user_query, (username, email), fetch_one=True)
    if existing_user:
        raise ValueError("A user with this username or email already exists.")

    # 2. Hash the password securely
    password_hash = hash_password(plain_password)

    # 3. Insert into the users table and retrieve the generated id
    insert_query = """
        INSERT INTO users (username, email, password_hash, role) 
        VALUES (%s, %s, %s, %s);
    """
    new_user_id = execute_write(insert_query, (username, email, password_hash, role), fetch_id=True)

    if not new_user_id:
        raise RuntimeError("Failed to create user in the database.")

    # 4. Return safe user data (without password_hash)
    return get_user_by_id(new_user_id)