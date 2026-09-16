from database.query import execute_select, execute_write

def create_customer(name: str, phone: str, email: str = None, address: str = None):
    """
    Creates a new customer. Requires name and phone. Validates phone uniqueness.
    Email and address are optional.
    """
    if not name or not str(name).strip():
        raise ValueError("Customer name is required.")
    
    clean_phone = str(phone).strip() if phone else ""
    if not clean_phone:
        raise ValueError("Customer phone number is required.")

    # Check phone uniqueness
    phone_check_query = "SELECT id, is_active FROM customers WHERE phone = %s;"
    existing = execute_select(phone_check_query, (clean_phone,), fetch_one=True)
    
    if existing:
        if existing['is_active']:
            raise ValueError("A customer with this phone number already exists.")
        else:
            raise ValueError("A deactivated customer with this phone number already exists.")

    insert_query = """
        INSERT INTO customers (name, phone, email, address, is_active, created_at)
        VALUES (%s, %s, %s, %s, TRUE, CURRENT_TIMESTAMP);
    """
    cust_id = execute_write(
        insert_query, 
        (str(name).strip(), clean_phone, str(email).strip() if email else None, str(address).strip() if address else None), 
        fetch_id=True
    )

    if not cust_id:
        raise RuntimeError("Failed to create customer record.")

    return get_customer_by_id(cust_id)


def get_customer_by_id(customer_id: int):
    """
    Retrieves a specific active customer by ID along with their total purchases.
    """
    query = """
        SELECT 
            c.id, c.name, c.phone, c.email, c.address, c.is_active, c.created_at,
            COALESCE(SUM(s.total_amount), 0.00) AS total_purchases
        FROM customers c
        LEFT JOIN sales s ON c.id = s.customer_id
        WHERE c.id = %s AND c.is_active = TRUE
        GROUP BY c.id;
    """
    customer = execute_select(query, (customer_id,), fetch_one=True)
    return dict(customer) if customer else None


def get_all_customers():
    """
    Retrieves all active customers in the system along with their calculated total purchases.
    """
    query = """
        SELECT 
            c.id, c.name, c.phone, c.email, c.address, c.is_active, c.created_at,
            COALESCE(SUM(s.total_amount), 0.00) AS total_purchases
        FROM customers c
        LEFT JOIN sales s ON c.id = s.customer_id
        WHERE c.is_active = TRUE 
        GROUP BY c.id
        ORDER BY c.name ASC;
    """
    records = execute_select(query, fetch_one=False)
    return [dict(r) for r in records] if records else []


def update_customer(customer_id: int, name: str = None, phone: str = None, email: str = None, address: str = None):
    """
    Updates customer details. Validates phone uniqueness if phone is modified.
    """
    customer = get_customer_by_id(customer_id)
    if not customer:
        raise ValueError("Customer not found or is inactive.")

    new_name = str(name).strip() if name is not None else customer['name']
    new_phone = str(phone).strip() if phone is not None else customer['phone']
    new_email = str(email).strip() if email is not None else customer['email']
    new_address = str(address).strip() if address is not None else customer['address']

    if not new_name:
        raise ValueError("Customer name cannot be empty.")
    if not new_phone:
        raise ValueError("Customer phone cannot be empty.")

    # Check phone uniqueness if changed
    if new_phone != customer['phone']:
        phone_check_query = "SELECT id FROM customers WHERE phone = %s AND id != %s;"
        existing = execute_select(phone_check_query, (new_phone, customer_id), fetch_one=True)
        if existing:
            raise ValueError("Another customer is already registered with this phone number.")

    update_query = """
        UPDATE customers 
        SET name = %s, phone = %s, email = %s, address = %s 
        WHERE id = %s AND is_active = TRUE;
    """
    rows_affected = execute_write(update_query, (new_name, new_phone, new_email, new_address, customer_id))

    if rows_affected == 0:
        raise RuntimeError("Failed to update customer record.")

    return get_customer_by_id(customer_id)


def delete_customer(customer_id: int):
    """
    Soft-deletes a customer by setting is_active = FALSE.
    Preserves historical sales records intact for future AI analytics.
    """
    customer = get_customer_by_id(customer_id)
    if not customer:
        raise ValueError("Customer not found or already inactive.")

    delete_query = """
        UPDATE customers 
        SET is_active = FALSE 
        WHERE id = %s;
    """
    rows_affected = execute_write(delete_query, (customer_id,))

    if rows_affected == 0:
        raise RuntimeError("Failed to soft-delete customer record.")

    return {"message": "Customer deactivated successfully, historical sales records preserved.", "customer_id": customer_id}