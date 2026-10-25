-- Each person's choice of notification emails, one row per person, keyed by their Better Auth id. Someone who never
-- saved a choice has no row: read the default for them.
create table core.notification_settings (
  user_id text primary key references auth."user" (id) on delete cascade,
  overdue_invoices text not null default 'each' check (overdue_invoices in ('each', 'daily', 'never'))
);
