-- Add factory_id to orders table (link to factories instead of hardcoded enum)
ALTER TABLE orders ADD COLUMN factory_id UUID REFERENCES factories(id) ON DELETE SET NULL;

-- Backfill existing orders: try to match supplier name to factory name
UPDATE orders o
SET factory_id = f.id
FROM factories f
WHERE UPPER(f.name) = o.supplier
  AND o.factory_id IS NULL;
