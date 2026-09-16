from database.query import execute_select, execute_write

def verify_active_product(product_id: int):
    """
    Helper to check if a product exists and is active (is_active = TRUE).
    Prevents inventory operations on deactivated or non-existent products.
    """
    query = "SELECT id, name, is_active FROM products WHERE id = %s;"
    product = execute_select(query, (product_id,), fetch_one=True)
    if not product:
        raise ValueError("Product not found.")
    if not product['is_active']:
        raise ValueError("Cannot perform inventory operations on an inactive product.")
    return product


def get_inventory_by_product_id(product_id: int):
    """
    Retrieves current inventory record for a specific active product.
    """
    verify_active_product(product_id)
    
    query = """
        SELECT i.id, i.product_id, p.name as product_name, p.sku, 
               i.stock_quantity, i.reorder_level, i.last_updated 
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE i.product_id = %s AND p.is_active = TRUE;
    """
    inventory = execute_select(query, (product_id,), fetch_one=True)
    return dict(inventory) if inventory else None


def get_all_inventory():
    """
    Retrieves inventory records for all active products in the system.
    """
    query = """
        SELECT i.id, i.product_id, p.name as product_name, p.sku, 
               i.stock_quantity, i.reorder_level, i.last_updated 
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE p.is_active = TRUE 
        ORDER BY i.stock_quantity ASC;
    """
    records = execute_select(query, fetch_one=False)
    return [dict(r) for r in records] if records else []


def create_inventory_for_product(product_id: int, initial_stock: int = 0, reorder_level: int = 10):
    """
    Initializes an inventory record for a newly created product.
    """
    verify_active_product(product_id)
    
    if initial_stock < 0 or reorder_level < 0:
        raise ValueError("Inventory stock and reorder levels cannot be negative.")

    existing_check = "SELECT id FROM inventory WHERE product_id = %s;"
    existing = execute_select(existing_check, (product_id,), fetch_one=True)
    if existing:
        raise ValueError("Inventory record for this product already exists.")

    insert_query = """
        INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_updated) 
        VALUES (%s, %s, %s, CURRENT_TIMESTAMP);
    """
    inv_id = execute_write(insert_query, (product_id, initial_stock, reorder_level), fetch_id=True)
    
    if not inv_id:
        raise RuntimeError("Failed to create inventory record.")

    return get_inventory_by_product_id(product_id)


def adjust_stock(product_id: int, quantity_delta: int):
    """
    Controlled stock modification function. 
    Accepts a positive delta (stock-in) or negative delta (stock-out).
    Prevents negative stock levels and updates last_updated timestamp.
    """
    verify_active_product(product_id)
    
    try:
        delta = int(quantity_delta)
    except (TypeError, ValueError):
        raise ValueError("Quantity change (delta) must be a valid integer.")

    current_inv = get_inventory_by_product_id(product_id)
    if not current_inv:
        raise ValueError("Inventory record not found for this product.")

    new_stock = current_inv['stock_quantity'] + delta
    if new_stock < 0:
        raise ValueError(f"Stock level cannot fall below zero. Current stock: {current_inv['stock_quantity']}, Requested change: {delta}")

    update_query = """
        UPDATE inventory 
        SET stock_quantity = %s, last_updated = CURRENT_TIMESTAMP 
        WHERE product_id = %s;
    """
    rows_affected = execute_write(update_query, (new_stock, product_id))
    
    if rows_affected == 0:
        raise RuntimeError("Failed to update stock quantity.")

    return get_inventory_by_product_id(product_id)


def update_reorder_level(product_id: int, new_reorder_level: int):
    """
    Updates the reorder alert threshold for a product's inventory.
    """
    verify_active_product(product_id)
    
    try:
        reorder_level = int(new_reorder_level)
    except (TypeError, ValueError):
        raise ValueError("Reorder level must be a valid integer.")

    if reorder_level < 0:
        raise ValueError("Reorder level cannot be negative.")

    update_query = """
        UPDATE inventory 
        SET reorder_level = %s, last_updated = CURRENT_TIMESTAMP 
        WHERE product_id = %s;
    """
    rows_affected = execute_write(update_query, (reorder_level, product_id))
    
    if rows_affected == 0:
        raise RuntimeError("Failed to update reorder level.")

    return get_inventory_by_product_id(product_id)


def get_low_stock_products():
    """
    Fetches all active products where current inventory stock is at or below the reorder level.
    """
    query = """
        SELECT i.id, i.product_id, p.name as product_name, p.sku, 
               i.stock_quantity, i.reorder_level, i.last_updated 
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE p.is_active = TRUE AND i.stock_quantity <= i.reorder_level
        ORDER BY i.stock_quantity ASC;
    """
    records = execute_select(query, fetch_one=False)
    return [dict(r) for r in records] if records else []