// The server tests' database: two organizations, 3.5k companies, labels, line items and 30k events.
export const serverDdl = `
create table organizations (id integer generated always as identity primary key, name text not null);
insert into organizations (name) values ('Acme'), ('Globex');

create table companies (
  id integer generated always as identity primary key,
  organization_id integer not null references organizations (id),
  name text not null, status text not null default 'open', revenue numeric(10,2) not null default 0,
  notes text, meta jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index on companies (organization_id, id);
create index on companies (organization_id, name);
create index on companies (organization_id, status);
create index on companies (organization_id, revenue);
create index on companies (organization_id, created_at);
-- Fixed times, before the snapshot tests' clock (test-support/sql-snapshot/clock.ts), so no row holds the time it was made.
insert into companies (organization_id, name, status, revenue, created_at, updated_at)
select case when i <= 3000 then 1 else 2 end, 'Company ' || i, (array['open','won','lost'])[1 + i % 3], i % 1000,
  timestamptz '2026-01-01 00:00:00+00' + (i % 200) * interval '1 day', timestamptz '2026-07-25 00:00:00+00'
from generate_series(1, 3500) i;
update companies set deleted_at = timestamptz '2026-07-26 00:00:00+00' where id % 100 = 0;

-- A database default that is the same on every recording: an md5 of a counter, not of random().
create sequence label_codes;
create table labels (id integer generated always as identity primary key, organization_id integer not null, name text not null, color text, code text not null default md5(nextval('label_codes')::text));
insert into labels (organization_id, name, color) values (1, 'urgent', 'red'), (1, 'later', null), (2, 'other-org', 'blue');

create table line_items (
  label_id integer not null, line_no integer not null, organization_id integer not null, quantity integer not null,
  primary key (label_id, line_no)
);
insert into line_items values (1, 1, 1, 5), (1, 2, 1, 7), (3, 1, 2, 9);

create table events (id integer generated always as identity primary key, kind text not null, at timestamptz not null);
insert into events (kind, at) select 'k' || (i % 50), timestamptz '2026-01-01+00' + i * interval '1 minute' from generate_series(1, 30000) i;
analyze;
`
