from decimal import Decimal, InvalidOperation
from database.query import execute_select, execute_write

def get_product_by_id(product_id: int):
    """
    Retrieves a single active product by its ID with live stock quantity.
    """
    query = """
        SELECT p.id, p.name, p.sku, p.category, p.unit_price, p.cost_price, p.is_active, p.created_at,
               COALESCE(i.stock_quantity, 0) AS stock_quantity 
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        WHERE p.id = %s AND p.is_active = TRUE;
    """
    product = execute_select(query, (product_id,), fetch_one=True)
    return dict(product) if product else None


def get_all_products():
    """
    Retrieves a list of all active inventory products with live stock quantities.
    """
    query = """
        SELECT p.id, p.name, p.sku, p.category, p.unit_price, p.cost_price, p.is_active, p.created_at,
               COALESCE(i.stock_quantity, 0) AS stock_quantity 
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        WHERE p.is_active = TRUE 
        ORDER BY p.id DESC;
    """
    products = execute_select(query, fetch_one=False)
    return [dict(p) for p in products] if products else []


def create_product(name: str, sku: str, category: str, unit_price, cost_price):
    """
    Creates a new product, validates monetary fields via Decimal, ensures SKU uniqueness,
    and automatically initializes its inventory ledger row with 0 initial stock.
    """
    if not name or not sku:
        raise ValueError("Product name and SKU are required fields.")
        
    try:
        u_price = Decimal(str(unit_price))
        c_price = Decimal(str(cost_price))
    except (TypeError, ValueError, InvalidOperation):
        raise ValueError("Unit price and cost price must be valid numeric values.")
        
    if u_price < 0 or c_price < 0:
        raise ValueError("Prices cannot be negative values.")

    sku_check_query = "SELECT id FROM products WHERE sku = %s;"
    existing_sku = execute_select(sku_check_query, (sku.strip().upper(),), fetch_one=True)
    if existing_sku:
        raise ValueError(f"Product with SKU '{sku.strip().upper()}' already exists.")

    # 1. Insert product into products table
    insert_query = """
        INSERT INTO products (name, sku, category, unit_price, cost_price, is_active) 
        VALUES (%s, %s, %s, %s, %s, TRUE);
    """
    new_product_id = execute_write(
        insert_query, 
        (name.strip(), sku.strip().upper(), category.strip() if category else None, u_price, c_price), 
        fetch_id=True
    )

    if not new_product_id:
        raise RuntimeError("Failed to create product in the database.")

    # 2. Automatically initialize inventory row so it never lacks an entry
    init_inventory_query = """
        INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_updated)
        VALUES (%s, 0, 10, CURRENT_TIMESTAMP);
    """
    execute_write(init_inventory_query, (new_product_id,))

    return get_product_by_id(new_product_id)


def update_product(product_id: int, name: str, sku: str, category: str, unit_price, cost_price):
    """
    Updates an existing product's details using Decimal for prices 
    and ensuring SKU uniqueness across other active rows.
    """
    existing_product = get_product_by_id(product_id)
    if not existing_product:
        raise ValueError("Product not found or is deactivated.")

    if not name or not sku:
        raise ValueError("Product name and SKU are required fields.")
        
    try:
        u_price = Decimal(str(unit_price))
        c_price = Decimal(str(cost_price))
    except (TypeError, ValueError, InvalidOperation):
        raise ValueError("Unit price and cost price must be valid numeric values.")
        
    if u_price < 0 or c_price < 0:
        raise ValueError("Prices cannot be negative values.")

    sku_check_query = "SELECT id FROM products WHERE sku = %s AND id != %s;"
    duplicate_sku = execute_select(sku_check_query, (sku.strip().upper(), product_id), fetch_one=True)
    if duplicate_sku:
        raise ValueError(f"Another product with SKU '{sku.strip().upper()}' already exists.")

    update_query = """
        UPDATE products 
        SET name = %s, sku = %s, category = %s, unit_price = %s, cost_price = %s 
        WHERE id = %s;
    """
    rows_affected = execute_write(
        update_query, 
        (name.strip(), sku.strip().upper(), category.strip() if category else None, u_price, c_price, product_id)
    )

    if rows_affected == 0:
        raise RuntimeError("Failed to update product.")

    return get_product_by_id(product_id)


def delete_product(product_id: int):
    """
    Soft-deletes a product by setting is_active = FALSE, 
    preserving historical sales, purchases, and analytics data integrity.
    """
    existing_product = get_product_by_id(product_id)
    if not existing_product:
        raise ValueError("Product not found or already inactive.")

    soft_delete_query = "UPDATE products SET is_active = FALSE WHERE id = %s;"
    rows_affected = execute_write(soft_delete_query, (product_id,))
    
    if rows_affected == 0:
        raise RuntimeError("Failed to deactivate product.")

    return {"message": "Product deactivated successfully.", "id": product_id}