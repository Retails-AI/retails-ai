from decimal import Decimal
from database.query import execute_select, execute_write

def create_supplier(name: str, phone: str, contact_person: str = None, email: str = None, address: str = None):
    """
    Creates a new supplier. Requires name and phone. Validates phone uniqueness.
    Contact person, email, and address are optional.
    """
    if not name or not str(name).strip():
        raise ValueError("Supplier name is required.")
    
    clean_phone = str(phone).strip() if phone else ""
    if not clean_phone:
        raise ValueError("Supplier phone number is required.")

    # Check phone uniqueness across active/inactive suppliers
    phone_check_query = "SELECT id, is_active FROM suppliers WHERE phone = %s;"
    existing = execute_select(phone_check_query, (clean_phone,), fetch_one=True)
    
    if existing:
        if existing['is_active']:
            raise ValueError("A supplier with this phone number already exists.")
        else:
            raise ValueError("A deactivated supplier with this phone number already exists.")

    insert_query = """
        INSERT INTO suppliers (name, contact_person, phone, email, address, is_active, created_at)
        VALUES (%s, %s, %s, %s, %s, TRUE, CURRENT_TIMESTAMP);
    """
    supp_id = execute_write(
        insert_query, 
        (
            str(name).strip(), 
            str(contact_person).strip() if contact_person else None, 
            clean_phone, 
            str(email).strip() if email else None, 
            str(address).strip() if address else None
        ), 
        fetch_id=True
    )

    if not supp_id:
        raise RuntimeError("Failed to create supplier record.")

    return get_supplier_by_id(supp_id)


def get_supplier_by_id(supplier_id: int):
    """
    Retrieves a specific active supplier by ID with aggregated purchases and outstanding balance.
    """
    query = """
        SELECT s.id, s.name, s.contact_person, s.phone, s.email, s.address, s.is_active, s.created_at,
               COALESCE(SUM(p.total_cost), 0.00) AS total_purchases,
               COALESCE(SUM(p.amount_due), 0.00) AS outstanding_balance
        FROM suppliers s
        LEFT JOIN purchases p ON s.id = p.supplier_id
        WHERE s.id = %s AND s.is_active = TRUE
        GROUP BY s.id;
    """
    supplier = execute_select(query, (supplier_id,), fetch_one=True)
    if not supplier:
        return None
    supp_dict = dict(supplier)
    supp_dict['total_purchases'] = float(supp_dict['total_purchases']) if supp_dict.get('total_purchases') is not None else 0.00
    supp_dict['outstanding_balance'] = float(supp_dict['outstanding_balance']) if supp_dict.get('outstanding_balance') is not None else 0.00
    return supp_dict


def get_all_suppliers():
    """
    Retrieves all active suppliers in the system with aggregated purchases and outstanding balances.
    """
    query = """
        SELECT s.id, s.name, s.contact_person, s.phone, s.email, s.address, s.is_active, s.created_at,
               COALESCE(SUM(p.total_cost), 0.00) AS total_purchases,
               COALESCE(SUM(p.amount_due), 0.00) AS outstanding_balance
        FROM suppliers s
        LEFT JOIN purchases p ON s.id = p.supplier_id
        WHERE s.is_active = TRUE 
        GROUP BY s.id
        ORDER BY s.name ASC;
    """
    records = execute_select(query, fetch_one=False)
    if not records:
        return []
    suppliers_list = []
    for r in records:
        d = dict(r)
        d['total_purchases'] = float(d['total_purchases']) if d.get('total_purchases') is not None else 0.00
        d['outstanding_balance'] = float(d['outstanding_balance']) if d.get('outstanding_balance') is not None else 0.00
        suppliers_list.append(d)
    return suppliers_list


def update_supplier(supplier_id: int, name: str = None, phone: str = None, contact_person: str = None, email: str = None, address: str = None):
    """
    Updates supplier details. Validates phone uniqueness if phone is modified.
    """
    supplier = get_supplier_by_id(supplier_id)
    if not supplier:
        raise ValueError("Supplier not found or is inactive.")

    new_name = str(name).strip() if name is not None else supplier['name']
    new_phone = str(phone).strip() if phone is not None else supplier['phone']
    new_contact = str(contact_person).strip() if contact_person is not None else supplier['contact_person']
    new_email = str(email).strip() if email is not None else supplier['email']
    new_address = str(address).strip() if address is not None else supplier['address']

    if not new_name:
        raise ValueError("Supplier name cannot be empty.")
    if not new_phone:
        raise ValueError("Supplier phone cannot be empty.")

    # Check phone uniqueness if changed
    if new_phone != supplier['phone']:
        phone_check_query = "SELECT id FROM suppliers WHERE phone = %s AND id != %s;"
        existing = execute_select(phone_check_query, (new_phone, supplier_id), fetch_one=True)
        if existing:
            raise ValueError("Another supplier is already registered with this phone number.")

    update_query = """
        UPDATE suppliers 
        SET name = %s, contact_person = %s, phone = %s, email = %s, address = %s 
        WHERE id = %s AND is_active = TRUE;
    """
    rows_affected = execute_write(
        update_query, 
        (new_name, new_contact, new_phone, new_email, new_address, supplier_id)
    )

    if rows_affected == 0:
        raise RuntimeError("Failed to update supplier record.")

    return get_supplier_by_id(supplier_id)


def delete_supplier(supplier_id: int):
    """
    Soft-deletes a supplier by setting is_active = FALSE.
    Preserves historical purchase records and procurement logs intact.
    """
    supplier = get_supplier_by_id(supplier_id)
    if not supplier:
        raise ValueError("Supplier not found or already inactive.")

    delete_query = """
        UPDATE suppliers 
        SET is_active = FALSE 
        WHERE id = %s;
    """
    rows_affected = execute_write(delete_query, (supplier_id,))

    if rows_affected == 0:
        raise RuntimeError("Failed to soft-delete supplier record.")

    return {"message": "Supplier deactivated successfully, historical purchase records preserved.", "supplier_id": supplier_id}