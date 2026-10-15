-- A filter, sort or search reads only columns an index serves.
create index inspections_condition_idx on maintenance.inspections (organization_id, condition);
create index lease_tenants_role_idx on leasing.lease_tenants (organization_id, role);
create index leases_term_idx on leasing.leases (organization_id, term);
create index rent_charges_outstanding_idx on billing.rent_charges (outstanding);
create index tenants_first_name_trgm_idx on leasing.tenants using gin (first_name gin_trgm_ops);
create index tenants_phone_digits_idx on leasing.tenants using gin ((regexp_replace(phone, '[^0-9]', '', 'g')) gin_trgm_ops);
create index tickets_number_trgm_idx on maintenance.tickets using gin (number gin_trgm_ops);
