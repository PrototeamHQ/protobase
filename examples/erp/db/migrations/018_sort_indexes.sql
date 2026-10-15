-- Each sortable column is served alone too, as a list sorted by it is; the tenant is pinned, so it leads.
create index categories_position_idx on catalog.categories (organization_id, position);
create index invoice_lines_position_idx on sales.invoice_lines (organization_id, position);
create index order_lines_line_no_idx on sales.order_lines (organization_id, line_no);
