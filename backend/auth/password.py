import bcrypt

def hash_password(plain_password: str) -> str:
    """
    Takes a plain-text password, generates a secure cryptographic salt,
    and returns the hashed password string for safe database storage.
    """
    if not plain_password:
        raise ValueError("Password cannot be empty.")
    
    # Generate salt and hash the password
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
    return hashed_bytes.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Compares a plain-text login password against the stored bcrypt hash.
    Returns True if they match, False otherwise.
    """
    if not plain_password or not hashed_password:
        return False
        
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'), 
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False