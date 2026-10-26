-- What is still owed on a charge, as a column so it can be filtered, sorted and indexed. Postgres computes it on every
-- write, so it follows paid_amount whether the payment triggers or the seed loader (triggers off) sets it.
alter table billing.rent_charges add column outstanding numeric(10, 2) generated always as (amount - paid_amount) stored;

create or replace view billing.arrears as
select
  c.lease_id,
  c.organization_id,
  count(*)::integer as open_charges,
  sum(c.outstanding) as balance,
  min(c.due_on) as oldest_due_on
from billing.rent_charges c
where c.paid_amount < c.amount
group by c.lease_id, c.organization_id;
