from database.connection import get_db_connection
from inventory.service import verify_active_product

VALID_MOVEMENT_TYPES = {'PURCHASE', 'SALE', 'MANUAL_ADJUSTMENT'}

def record_inventory_movement(product_id: int, change_quantity: int, movement_type: str, user_id: int, reference_id: int = None):
    """
    Records an inventory movement (Purchase, Sale, or Manual Adjustment) under a single
    atomic transaction using PostgreSQL FOR UPDATE row locking to prevent race conditions.
    """
    # 1. Pre-validation (Product existence & Active check, movement type, delta)
    verify_active_product(product_id)
    
    m_type = str(movement_type).strip().upper()
    if m_type not in VALID_MOVEMENT_TYPES:
        raise ValueError(f"Invalid movement type. Must be one of: {list(VALID_MOVEMENT_TYPES)}")
        
    try:
        delta = int(change_quantity)
    except (TypeError, ValueError):
        raise ValueError("Change quantity must be a valid integer.")
        
    if delta == 0:
        raise ValueError("Movement quantity change cannot be zero.")

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Begin atomic transaction block (psycopg2 auto-begins transactions)
        
        # 2. Fetch current inventory stock with row-level lock (FOR UPDATE)
        lock_query = """
            SELECT id, product_id, stock_quantity, reorder_level 
            FROM inventory 
            WHERE product_id = %s 
            FOR UPDATE;
        """
        cursor.execute(lock_query, (product_id,))
        current_inv = cursor.fetchone()

        if not current_inv:
            raise ValueError("Inventory record not found for this product.")
            
        # Unpack record columns (id, product_id, stock_quantity, reorder_level)
        inv_id, _, current_stock, _ = current_inv

        # 3. Calculate and validate new stock bounds
        new_stock = current_stock + delta
        if new_stock < 0:
            raise ValueError(f"Stock level cannot fall below zero. Current stock: {current_stock}, Requested change: {delta}")

        # 4. Update inventory stock quantity
        update_inventory_query = """
            UPDATE inventory 
            SET stock_quantity = %s, last_updated = CURRENT_TIMESTAMP 
            WHERE product_id = %s;
        """
        cursor.execute(update_inventory_query, (new_stock, product_id))

        # 5. Insert movement log record
        insert_movement_query = """
            INSERT INTO inventory_movements 
            (product_id, change_quantity, movement_type, reference_id, user_id, created_at) 
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
        """
        cursor.execute(insert_movement_query, (product_id, delta, m_type, reference_id, user_id))

        # 6. Commit transaction atomically
        connection.commit()

        return {
            "product_id": product_id,
            "previous_stock": current_stock,
            "change_quantity": delta,
            "new_stock": new_stock,
            "movement_type": m_type,
            "reference_id": reference_id,
            "user_id": user_id
        }

    except Exception as e:
        if connection:
            connection.rollback()
        raise RuntimeError(f"Inventory movement transaction failed and rolled back: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()