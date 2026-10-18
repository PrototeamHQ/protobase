// The query tests' tables: 10k rows each, with every field type the filters and sorts handle.
export const queryDdl = `
create table items (
  id integer generated always as identity primary key,
  name text not null, category text not null, qty integer not null,
  price numeric(10,2) not null, big bigint not null, active boolean not null,
  created_at timestamptz not null, born date not null, note text,
  ref uuid not null, deleted_at timestamptz, attrs jsonb
);
insert into items (name, category, qty, price, big, active, created_at, born, note, ref, deleted_at, attrs)
select 'item-' || i, (array['red','green','blue'])[1 + i % 3], (i * 7919) % 100, (i % 500) / 4.0,
  i::bigint * 1000000000, i % 2 = 0,
  timestamptz '2024-01-01 00:00:00+00' + (i % 400) * interval '1 day' + (i % 24) * interval '1 hour',
  date '2024-01-01' + (i % 400),
  case when i % 3 = 0 then 'alpha, beta, gamma' when i % 3 = 1 then 'Quick brown fox' else 'under_score 100%' end,
  md5(i::text)::uuid, case when i % 50 = 0 then timestamptz '2024-06-01+00' end,
  case i % 4 when 0 then '{"tag": "gold"}'::jsonb when 1 then '["x", "y"]'::jsonb when 2 then 'null'::jsonb end
from generate_series(1, 10000) i;

create table big_items (id bigint primary key, grp integer not null, label text not null);
insert into big_items select 5000000000 + i, (i * 31) % 40, 'label, ' || i from generate_series(1, 10000) i;

create table uuid_items (id uuid primary key, grp integer not null, label text not null);
insert into uuid_items select md5('u' || i)::uuid, (i * 31) % 40, 'label ' || i from generate_series(1, 10000) i;

create table order_lines (order_id integer, line_no integer, qty integer not null, note text not null, primary key (order_id, line_no));
insert into order_lines select 1 + (i - 1) / 5, 1 + (i - 1) % 5, (i * 13) % 17, 'a, b, ' || i from generate_series(1, 10000) i;
`
