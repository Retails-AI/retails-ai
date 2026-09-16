from decimal import Decimal
from database.connection import get_db_connection
from database.query import execute_select

VALID_PAYMENT_METHODS = {'CASH', 'UPI', 'CARD'}

def create_sale(user_id: int, items: list, customer_id: int = None, payment_method: str = 'CASH'):
    """
    Creates a sale atomically with multiple items using Decimal precision for financial calculations.
    Validates active products, sufficient stock with row-level locking, controlled payment methods,
    server-side subtotals and totals, inventory decrease, and SALE movement logs.
    """
    if not items or not isinstance(items, list):
        raise ValueError("A sale must contain at least one item.")
    
    pay_method = str(payment_method).strip().upper()
    if pay_method not in VALID_PAYMENT_METHODS:
        raise ValueError(f"Invalid payment method. Must be one of: {list(VALID_PAYMENT_METHODS)}")

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # 1. Customer Validation
        if customer_id is not None:
            cust_query = "SELECT id FROM customers WHERE id = %s AND is_active = TRUE;"
            cursor.execute(cust_query, (customer_id,))
            if not cursor.fetchone():
                raise ValueError("Customer not found or is inactive.")

        calculated_total = Decimal('0.00')
        validated_items_data = []

        # 2. Iterate items to validate and calculate with Decimal
        for item in items:
            product_id = item.get('product_id')
            quantity = item.get('quantity')

            if product_id is None or quantity is None:
                raise ValueError("Each sale item must include product_id and quantity.")

            try:
                qty = int(quantity)
            except (TypeError, ValueError):
                raise ValueError("Item quantity must be a valid integer.")

            if qty <= 0:
                raise ValueError("Item quantity must be greater than zero.")

            # Lock product and inventory row to prevent concurrent race conditions
            prod_lock_query = """
                SELECT p.id, p.name, p.unit_price, p.is_active, i.stock_quantity 
                FROM products p
                JOIN inventory i ON p.id = i.product_id
                WHERE p.id = %s
                FOR UPDATE;
            """
            cursor.execute(prod_lock_query, (product_id,))
            row = cursor.fetchone()

            if not row:
                raise ValueError(f"Product with ID {product_id} not found.")

            prod_id, prod_name, unit_price, is_active, stock_qty = row

            if not is_active:
                raise ValueError(f"Cannot sell inactive product: {prod_name}")

            if stock_qty < qty:
                raise ValueError(f"Insufficient stock for product '{prod_name}'. Available: {stock_qty}, Requested: {qty}")

            # Use Decimal precision for financial calculations
            unit_price_dec = Decimal(str(unit_price))
            subtotal = unit_price_dec * Decimal(qty)
            calculated_total += subtotal

            validated_items_data.append({
                "product_id": product_id,
                "quantity": qty,
                "unit_price": unit_price_dec,
                "subtotal": subtotal,
                "new_stock": stock_qty - qty
            })

        # 3. Insert Master Sale Record
        insert_sale_query = """
            INSERT INTO sales (customer_id, user_id, total_amount, payment_method, sale_date)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING id;
        """
        cursor.execute(insert_sale_query, (customer_id, user_id, calculated_total, pay_method))
        sale_row = cursor.fetchone()
        if not sale_row:
            raise RuntimeError("Failed to create sale master record.")
        sale_id = sale_row[0]

        # 4. Insert Items, Update Inventory, and Log Inventory Movements
        for v_item in validated_items_data:
            prod_id = v_item["product_id"]
            qty = v_item["quantity"]
            u_price = v_item["unit_price"]
            subtot = v_item["subtotal"]
            new_stock = v_item["new_stock"]

            insert_item_query = """
                INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
                VALUES (%s, %s, %s, %s, %s);
            """
            cursor.execute(insert_item_query, (sale_id, prod_id, qty, u_price, subtot))

            update_inv_query = """
                UPDATE inventory 
                SET stock_quantity = %s, last_updated = CURRENT_TIMESTAMP 
                WHERE product_id = %s;
            """
            cursor.execute(update_inv_query, (new_stock, prod_id))

            insert_movement_query = """
                INSERT INTO inventory_movements 
                (product_id, change_quantity, movement_type, reference_id, user_id, created_at)
                VALUES (%s, %s, 'SALE', %s, %s, CURRENT_TIMESTAMP);
            """
            cursor.execute(insert_movement_query, (prod_id, -qty, sale_id, user_id))

        connection.commit()
        return get_sale_by_id(sale_id)

    except ValueError:
        if connection:
            connection.rollback()
        raise
    except Exception as e:
        if connection:
            connection.rollback()
        raise RuntimeError(f"Sale transaction failed and rolled back: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def get_sale_by_id(sale_id: int):
    """
    Retrieves a specific sale by ID along with customer, staff, and line items.
    """
    sale_query = """
        SELECT s.id, s.total_amount, s.payment_method, s.sale_date,
               s.customer_id, c.name as customer_name, c.phone as customer_phone,
               s.user_id, u.username as staff_username
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        JOIN users u ON s.user_id = u.id
        WHERE s.id = %s;
    """
    sale = execute_select(sale_query, (sale_id,), fetch_one=True)
    if not sale:
        return None

    items_query = """
        SELECT si.id, si.product_id, p.name as product_name, p.sku,
               si.quantity, si.unit_price, si.subtotal
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = %s;
    """
    items = execute_select(items_query, (sale_id,), fetch_one=False)

    result = dict(sale)
    result["items"] = [dict(item) for item in items] if items else []
    return result


def get_all_sales():
    """
    Retrieves all sales records ordered by recent date along with their corresponding items.
    """
    query = """
        SELECT s.id, s.total_amount, s.payment_method, s.sale_date,
               s.customer_id, c.name as customer_name,
               s.user_id, u.username as staff_username
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        JOIN users u ON s.user_id = u.id
        ORDER BY s.sale_date DESC;
    """
    records = execute_select(query, fetch_one=False)
    if not records:
        return []

    sales_list = []
    for r in records:
        sale_dict = dict(r)
        sale_id = sale_dict["id"]
        
        # Fetch corresponding items for each sale from sale_items table
        items_query = """
            SELECT si.product_id, si.quantity, si.unit_price, si.subtotal
            FROM sale_items si
            WHERE si.sale_id = %s;
        """
        items = execute_select(items_query, (sale_id,), fetch_one=False)
        sale_dict["items"] = [dict(item) for item in items] if items else []
        sales_list.append(sale_dict)

    return sales_list