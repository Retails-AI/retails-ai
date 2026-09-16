from decimal import Decimal
from datetime import datetime
from database.connection import get_db_connection
from database.query import execute_select

def create_expense(user_id: int, category: str, amount, description: str = None, expense_date: str = None):
    """
    Creates an expense record with Decimal precision for money, validating category and amount.
    """
    if not category or not category.strip():
        raise ValueError("Expense category is required.")

    if amount is None:
        raise ValueError("Expense amount is required.")

    try:
        amount_dec = Decimal(str(amount))
    except (TypeError, ValueError):
        raise ValueError("Invalid amount format. Must be a valid number.")

    if amount_dec <= Decimal('0.00'):
        raise ValueError("Expense amount must be greater than zero.")

    parsed_date = datetime.now().date()
    if expense_date:
        try:
            parsed_date = datetime.fromisoformat(expense_date).date()
        except ValueError:
            try:
                parsed_date = datetime.strptime(expense_date, "%Y-%m-%d").date()
            except ValueError:
                raise ValueError("Invalid expense_date format. Use YYYY-MM-DD or ISO format.")

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        query = """
            INSERT INTO expenses (user_id, category, amount, description, expense_date)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id;
        """
        cursor.execute(query, (user_id, category.strip(), amount_dec, description, parsed_date))
        row = cursor.fetchone()
        if not row:
            raise RuntimeError("Failed to create expense record.")
        
        expense_id = row[0]
        connection.commit()
        return get_expense_by_id(expense_id)

    except ValueError:
        if connection:
            connection.rollback()
        raise
    except Exception as e:
        if connection:
            connection.rollback()
        raise RuntimeError(f"Database operation failed: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def get_expense_by_id(expense_id: int):
    """
    Retrieves a specific expense record by ID along with staff username.
    """
    query = """
        SELECT e.id, e.category, e.amount, e.description, e.expense_date,
               e.user_id, u.username as staff_username
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        WHERE e.id = %s;
    """
    record = execute_select(query, (expense_id,), fetch_one=True)
    return dict(record) if record else None


def get_all_expenses():
    """
    Retrieves all expense records ordered by recent expense date.
    """
    query = """
        SELECT e.id, e.category, e.amount, e.description, e.expense_date,
               e.user_id, u.username as staff_username
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        ORDER BY e.expense_date DESC;
    """
    records = execute_select(query, fetch_one=False)
    return [dict(r) for r in records] if records else []