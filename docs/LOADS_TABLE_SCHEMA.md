# Loads Table Schema Reference

## Question: Is there a `custom_id` column in the loads table?

**Answer: NO** - There is no column called `custom_id` in the loads table.

However, there **IS** a column called `customer_id`.

---

## Loads Table Columns

The `loads` table contains the following columns:

### Identification
- `id` (UUID, Primary Key) - Unique load identifier
- `load_number` (VARCHAR(50), UNIQUE) - Human-readable load number
- `bol_number` (VARCHAR(100)) - Bill of Lading number

### Customer & Relationships
- **`customer_id`** (UUID, NULLABLE) - References `customers(id)` table
  - This is the customer who will be invoiced for the load
  - Foreign key constraint with ON DELETE SET NULL
  - Indexed for performance
- `destination_id` (UUID) - Legacy destination reference
- `driver_id` (UUID) - References `drivers(id)` table

### Origin Information
- `origin_city` (VARCHAR(100))
- `origin_state` (VARCHAR(2))
- `origin_address` (TEXT)

### Destination Information
- `dest_city` (VARCHAR(100))
- `dest_state` (VARCHAR(2))
- `dest_address` (TEXT)
- `dest_company` (VARCHAR(255))

### Load Details
- `pickup_date` (DATE)
- `delivery_date` (DATE)
- `cargo_description` (TEXT)
- `weight` (INTEGER)

### Status & Workflow
- `status` (VARCHAR(50)) - One of: UNASSIGNED, DISPATCHED, IN_TRANSIT, DELIVERED, INVOICED, PAID
- `acceptance_token` (VARCHAR(255)) - Token for driver acceptance
- `accepted_at` (TIMESTAMP WITH TIME ZONE)
- `delivered_at` (TIMESTAMP WITH TIME ZONE)

### Financial
- `rate` (DECIMAL(10, 2)) - Base rate for the load
- `extra_stop_fee` (DECIMAL(10, 2))
- `lumper_fee` (DECIMAL(10, 2))

### Additional
- `total_miles` (INTEGER)
- `tracking_enabled` (BOOLEAN)
- `auto_invoice` (BOOLEAN)
- `trip_number` (VARCHAR(50))
- `created_at` (TIMESTAMP WITH TIME ZONE)

---

## Indexes

The following indexes exist on the loads table:
- `idx_loads_load_number` on `load_number`
- `idx_loads_status` on `status`
- `idx_loads_driver_id` on `driver_id`
- `idx_loads_customer_id` on `customer_id` ⭐
- `idx_loads_acceptance_token` on `acceptance_token`

---

## Related Tables

### Customer Relationship
```sql
loads.customer_id → customers.id
```

When you query a load, you can join with the customers table:
```sql
SELECT loads.*, customers.company_name, customers.email
FROM loads
LEFT JOIN customers ON loads.customer_id = customers.id
WHERE loads.id = 'some-uuid';
```

### TypeScript Type Definition

```typescript
export interface Load {
  id: string;
  load_number: string;
  bol_number: string | null;
  customer_id: string | null;  // ⭐ This is the column name
  customer?: Customer;           // Optional joined customer object
  // ... other fields
}
```

---

## Summary

- ❌ There is **NO** column called `custom_id`
- ✅ There **IS** a column called `customer_id`
- 📋 Purpose: Links loads to customers for invoicing
- 🔗 Foreign key to `customers` table
- 💾 Nullable (loads can exist without a customer)
- ⚡ Indexed for fast lookups

If you're looking for the customer associated with a load, use the `customer_id` column.
