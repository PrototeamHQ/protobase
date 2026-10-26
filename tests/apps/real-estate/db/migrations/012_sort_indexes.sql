-- Each sortable column is served alone too, as a list sorted by it is; the tenant is pinned, so it leads.
create index tenants_last_name_idx on leasing.tenants (organization_id, last_name);
