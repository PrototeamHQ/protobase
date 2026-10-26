-- A filter, sort or search reads only columns an index serves: search reads these through pg_trgm.
create index companies_city_trgm_idx on crm.companies using gin (city gin_trgm_ops);
create index orders_number_trgm_idx on sales.orders using gin (number gin_trgm_ops);
create index invoices_number_trgm_idx on sales.invoices using gin (number gin_trgm_ops);
create index locations_path_btree_idx on inventory.locations (organization_id, path);
