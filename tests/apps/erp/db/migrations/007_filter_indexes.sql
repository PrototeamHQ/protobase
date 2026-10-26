create index orders_total_idx on sales.orders (organization_id, total);
create index orders_paid_idx on sales.orders (organization_id, paid);
create index invoices_issued_at_idx on sales.invoices (organization_id, issued_at);
create index stock_moves_quantity_idx on inventory.stock_moves (organization_id, quantity);
