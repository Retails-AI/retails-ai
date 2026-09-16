from decimal import Decimal
from database.query import execute_select

def get_financial_summary(days: int = 7):
    sales_query = """
        SELECT COALESCE(SUM(total_amount), 0.00) AS total_sales 
        FROM sales 
        WHERE sale_date >= CURRENT_DATE - INTERVAL '1 day' * %s;
    """
    sales_res = execute_select(sales_query, (days,), fetch_one=True)
    total_sales = Decimal(str(sales_res['total_sales'])) if sales_res and sales_res['total_sales'] is not None else Decimal('0.00')

    purchase_query = """
        SELECT COALESCE(SUM(total_cost), 0.00) AS total_purchases 
        FROM purchases 
        WHERE purchase_date >= CURRENT_DATE - INTERVAL '1 day' * %s;
    """
    purchase_res = execute_select(purchase_query, (days,), fetch_one=True)
    total_purchases = Decimal(str(purchase_res['total_purchases'])) if purchase_res and purchase_res['total_purchases'] is not None else Decimal('0.00')

    expense_query = """
        SELECT COALESCE(SUM(amount), 0.00) AS total_expenses 
        FROM expenses 
        WHERE expense_date >= CURRENT_DATE - INTERVAL '1 day' * %s;
    """
    expense_res = execute_select(expense_query, (days,), fetch_one=True)
    total_expenses = Decimal(str(expense_res['total_expenses'])) if expense_res and expense_res['total_expenses'] is not None else Decimal('0.00')

    cogs_query = """
        WITH product_purchases AS (
            SELECT pi.product_id, SUM(pi.quantity) as total_purchased_qty, SUM(pi.subtotal) as total_purchased_cost
            FROM purchase_items pi
            JOIN purchases p ON pi.purchase_id = p.id
            WHERE p.purchase_date >= CURRENT_DATE - INTERVAL '1 day' * %s
            GROUP BY pi.product_id
        ),
        product_sales AS (
            SELECT si.product_id, SUM(si.quantity) as total_sold_qty
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * %s
            GROUP BY si.product_id
        ),
        product_avg_cost AS (
            SELECT 
                pp.product_id,
                pp.total_purchased_qty,
                pp.total_purchased_cost,
                COALESCE(ps.total_sold_qty, 0) as total_sold_qty,
                CASE 
                    WHEN pp.total_purchased_qty > 0 THEN pp.total_purchased_cost / pp.total_purchased_qty
                    ELSE 0.00
                END as avg_unit_cost
            FROM product_purchases pp
            LEFT JOIN product_sales ps ON pp.product_id = ps.product_id
        )
        SELECT COALESCE(SUM(total_sold_qty * avg_unit_cost), 0.00) AS total_cogs
        FROM product_avg_cost;
    """
    cogs_res = execute_select(cogs_query, (days, days), fetch_one=True)
    total_cogs = Decimal(str(cogs_res['total_cogs'])) if cogs_res and cogs_res['total_cogs'] is not None else Decimal('0.00')

    gross_profit = total_sales - total_cogs
    net_profit = gross_profit - total_expenses

    return {
        "total_sales_revenue": total_sales,
        "total_purchase_cost": total_purchases,
        "total_cogs": total_cogs,
        "gross_profit": gross_profit,
        "total_expenses": total_expenses,
        "net_profit": net_profit
    }


def get_transaction_counts(days: int = 7):
    sales_count_q = "SELECT COUNT(*) AS count FROM sales WHERE sale_date >= CURRENT_DATE - INTERVAL '1 day' * %s;"
    s_res = execute_select(sales_count_q, (days,), fetch_one=True)
    sales_count = s_res['count'] if s_res else 0

    purchase_count_q = "SELECT COUNT(*) AS count FROM purchases WHERE purchase_date >= CURRENT_DATE - INTERVAL '1 day' * %s;"
    p_res = execute_select(purchase_count_q, (days,), fetch_one=True)
    purchase_count = p_res['count'] if p_res else 0

    expense_count_q = "SELECT COUNT(*) AS count FROM expenses WHERE expense_date >= CURRENT_DATE - INTERVAL '1 day' * %s;"
    e_res = execute_select(expense_count_q, (days,), fetch_one=True)
    expense_count = e_res['count'] if e_res else 0

    return {
        "sales_count": sales_count,
        "purchase_count": purchase_count,
        "expense_count": expense_count
    }


def get_inventory_summary(threshold: int = 10):
    summary_query = """
        SELECT 
            COUNT(id) AS total_products_tracked,
            COALESCE(SUM(stock_quantity), 0) AS total_units_in_stock,
            COUNT(CASE WHEN stock_quantity <= %s THEN 1 END) AS low_stock_count
        FROM inventory;
    """
    summary = execute_select(summary_query, (threshold,), fetch_one=True)

    low_stock_query = """
        SELECT i.product_id, p.name AS product_name, i.stock_quantity, i.last_updated
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE i.stock_quantity <= %s
        ORDER BY i.stock_quantity ASC;
    """
    low_stock_items = execute_select(low_stock_query, (threshold,), fetch_one=False)

    return {
        "total_products_tracked": summary['total_products_tracked'] if summary else 0,
        "total_units_in_stock": summary['total_units_in_stock'] if summary else 0,
        "low_stock_count": summary['low_stock_count'] if summary else 0,
        "low_stock_threshold": threshold,
        "low_stock_items": [dict(item) for item in low_stock_items] if low_stock_items else []
    }


def get_trends(days: int = 7, limit: int = None):
    if limit is not None:
        days = limit

    sales_trend_query = """
        SELECT DATE(sale_date) AS date, COUNT(*) AS transaction_count, COALESCE(SUM(total_amount), 0.00) AS total_amount
        FROM sales
        WHERE sale_date >= CURRENT_DATE - INTERVAL '1 day' * %s
        GROUP BY DATE(sale_date)
        ORDER BY date ASC;
    """
    sales_trends = execute_select(sales_trend_query, (days,), fetch_one=False)

    # Fixed alias to 'total_amount' and changed sorting to ASC
    purchase_trend_query = """
        SELECT DATE(purchase_date) AS date, COUNT(*) AS transaction_count, COALESCE(SUM(total_cost), 0.00) AS total_amount
        FROM purchases
        WHERE purchase_date >= CURRENT_DATE - INTERVAL '1 day' * %s
        GROUP BY DATE(purchase_date)
        ORDER BY date ASC;
    """
    purchase_trends = execute_select(purchase_trend_query, (days,), fetch_one=False)

    expense_trend_query = """
        SELECT DATE(expense_date) AS date, COUNT(*) AS transaction_count, COALESCE(SUM(amount), 0.00) AS total_amount
        FROM expenses
        WHERE expense_date >= CURRENT_DATE - INTERVAL '1 day' * %s
        GROUP BY DATE(expense_date)
        ORDER BY date ASC;
    """
    expense_trends = execute_select(expense_trend_query, (days,), fetch_one=False)

    return {
        "sales_trends": [dict(r) for r in sales_trends] if sales_trends else [],
        "purchase_trends": [dict(r) for r in purchase_trends] if purchase_trends else [],
        "expense_trends": [dict(r) for r in expense_trends] if expense_trends else []
    }


def get_performance_metrics(days: int = 7):
    top_products_query = """
        SELECT si.product_id, p.name AS product_name, SUM(si.quantity) AS total_quantity_sold, SUM(si.subtotal) AS total_revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * %s
        GROUP BY si.product_id, p.name
        ORDER BY total_quantity_sold DESC
        LIMIT 5;
    """
    top_products = execute_select(top_products_query, (days,), fetch_one=False)

    category_expenses_query = """
        SELECT category, COUNT(*) AS expense_count, SUM(amount) AS total_amount
        FROM expenses
        WHERE expense_date >= CURRENT_DATE - INTERVAL '1 day' * %s
        GROUP BY category
        ORDER BY total_amount DESC;
    """
    category_expenses = execute_select(category_expenses_query, (days,), fetch_one=False)

    category_revenue_query = """
        SELECT p.category, SUM(si.subtotal) AS total_revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * %s
        GROUP BY p.category
        ORDER BY total_revenue DESC;
    """
    category_revenue = execute_select(category_revenue_query, (days,), fetch_one=False)

    return {
        "top_selling_products": [dict(p) for p in top_products] if top_products else [],
        "category_expenses": [dict(c) for c in category_expenses] if category_expenses else [],
        "category_revenue": [dict(r) for r in category_revenue] if category_revenue else []
    }