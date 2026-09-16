from decimal import Decimal
from database.connection import get_db_connection
from database.query import execute_select

def create_purchase(user_id: int, supplier_id: int, items: list, payment_status: str = 'PAID', amount_due = None):
    """
    Creates a purchase record atomically with multiple items using Decimal precision.
    Supports payment tracking (payment_status and amount_due) for pending supplier balances.
    """
    if supplier_id is None:
        raise ValueError("A valid supplier is required for procurement.")
        
    if not items or not isinstance(items, list):
        raise ValueError("A purchase order must contain at least one item.")

    # Pre-aggregate quantities for duplicate product_ids
    aggregated_quantities = {}
    for item in items:
        product_id = item.get('product_id')
        quantity = item.get('quantity')

        if product_id is None or quantity is None:
            raise ValueError("Each purchase item must include product_id and quantity.")

        try:
            qty = int(quantity)
        except (TypeError, ValueError):
            raise ValueError("Item quantity must be a valid integer.")

        if qty <= 0:
            raise ValueError("Item quantity must be greater than zero.")

        aggregated_quantities[product_id] = aggregated_quantities.get(product_id, 0) + qty

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # 1. Validate Supplier Existence and Active Status separately
        supp_query = "SELECT id, is_active FROM suppliers WHERE id = %s;"
        cursor.execute(supp_query, (supplier_id,))
        supp_row = cursor.fetchone()
        
        if not supp_row:
            raise LookupError("Supplier not found.")
        if not supp_row[1]:
            raise ValueError("Supplier is inactive.")

        calculated_total = Decimal('0.00')
        validated_items_data = []

        # 2. Iterate aggregated items to validate active products and lock rows
        for product_id, total_qty in aggregated_quantities.items():
            prod_lock_query = """
                SELECT p.id, p.name, p.cost_price, p.is_active, i.stock_quantity 
                FROM products p
                JOIN inventory i ON p.id = i.product_id
                WHERE p.id = %s
                FOR UPDATE;
            """
            cursor.execute(prod_lock_query, (product_id,))
            row = cursor.fetchone()

            if not row:
                raise ValueError(f"Product with ID {product_id} not found. Ensure inventory is initialized.")

            prod_id, prod_name, cost_price, is_active, stock_qty = row

            if not is_active:
                raise ValueError(f"Cannot procure inactive product: {prod_name}")

            cost_price_dec = Decimal(str(cost_price))
            subtotal = cost_price_dec * Decimal(total_qty)
            calculated_total += subtotal

            validated_items_data.append({
                "product_id": product_id,
                "quantity": total_qty,
                "unit_cost": cost_price_dec,
                "subtotal": subtotal,
                "new_stock": stock_qty + total_qty
            })

        # Determine payment status and amount due
        p_status = str(payment_status).strip().upper()
        if p_status not in {'PAID', 'PENDING', 'PARTIAL'}:
            p_status = 'PAID'

        if amount_due is not None:
            try:
                final_amount_due = Decimal(str(amount_due))
            except (TypeError, ValueError):
                final_amount_due = calculated_total if p_status == 'PENDING' else Decimal('0.00')
        else:
            final_amount_due = calculated_total if p_status == 'PENDING' else Decimal('0.00')

        if final_amount_due > calculated_total:
            final_amount_due = calculated_total

        # 3. Insert Master Purchase Record
        insert_purchase_query = """
            INSERT INTO purchases (supplier_id, user_id, total_cost, payment_status, amount_due, purchase_date)
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING id;
        """
        cursor.execute(insert_purchase_query, (supplier_id, user_id, calculated_total, p_status, final_amount_due))
        purchase_row = cursor.fetchone()
        if not purchase_row:
            raise RuntimeError("Failed to create purchase master record.")
        purchase_id = purchase_row[0]

        # 4. Insert Purchase Items, Increase Inventory Stock, and Log Inventory Movements
        for v_item in validated_items_data:
            prod_id = v_item["product_id"]
            qty = v_item["quantity"]
            u_cost = v_item["unit_cost"]
            subtot = v_item["subtotal"]
            new_stock = v_item["new_stock"]

            insert_item_query = """
                INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal)
                VALUES (%s, %s, %s, %s, %s);
            """
            cursor.execute(insert_item_query, (purchase_id, prod_id, qty, u_cost, subtot))

            update_inv_query = """
                UPDATE inventory 
                SET stock_quantity = %s, last_updated = CURRENT_TIMESTAMP 
                WHERE product_id = %s;
            """
            cursor.execute(update_inv_query, (new_stock, prod_id))

            insert_movement_query = """
                INSERT INTO inventory_movements 
                (product_id, change_quantity, movement_type, reference_id, user_id, created_at)
                VALUES (%s, %s, 'PURCHASE', %s, %s, CURRENT_TIMESTAMP);
            """
            cursor.execute(insert_movement_query, (prod_id, qty, purchase_id, user_id))

        connection.commit()
        return get_purchase_by_id(purchase_id)

    except (ValueError, LookupError):
        if connection:
            connection.rollback()
        raise
    except Exception as e:
        if connection:
            connection.rollback()
        raise RuntimeError(f"Purchase transaction failed and rolled back: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def get_purchase_by_id(purchase_id: int):
    purchase_query = """
        SELECT p.id, p.total_cost, p.payment_status, p.amount_due, p.purchase_date,
               p.supplier_id, s.name as supplier_name, s.phone as supplier_phone,
               p.user_id, u.username as staff_username
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        JOIN users u ON p.user_id = u.id
        WHERE p.id = %s;
    """
    purchase = execute_select(purchase_query, (purchase_id,), fetch_one=True)
    if not purchase:
        return None

    items_query = """
        SELECT pi.id, pi.product_id, pr.name as product_name, pr.sku,
               pi.quantity, pi.unit_cost, pi.subtotal
        FROM purchase_items pi
        JOIN products pr ON pi.product_id = pr.id
        WHERE pi.purchase_id = %s;
    """
    items = execute_select(items_query, (purchase_id,), fetch_one=False)

    result = dict(purchase)
    result["items"] = [dict(item) for item in items] if items else []
    return result


def get_all_purchases():
    query = """
        SELECT p.id, p.total_cost, p.payment_status, p.amount_due, p.purchase_date,
               p.supplier_id, s.name as supplier_name,
               p.user_id, u.username as staff_username
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        JOIN users u ON p.user_id = u.id
        ORDER BY p.purchase_date DESC;
    """
    records = execute_select(query, fetch_one=False)
    if not records:
        return []
        
    purchases_list = []
    for r in records:
        p_dict = dict(r)
        # Fetch items for each purchase record
        items_query = """
            SELECT pi.id, pi.product_id, pr.name as product_name, pr.sku,
                   pi.quantity, pi.unit_cost, pi.subtotal
            FROM purchase_items pi
            JOIN products pr ON pi.product_id = pr.id
            WHERE pi.purchase_id = %s;
        """
        items = execute_select(items_query, (p_dict["id"],), fetch_one=False)
        p_dict["items"] = [dict(item) for item in items] if items else []
        purchases_list.append(p_dict)
        
    return purchases_list