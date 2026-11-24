import { describe, expect, it } from 'vitest'
import { contractingSql } from './additive-statements'

describe('whether hand-written SQL only adds', () => {
  it('passes what only adds: new tables and their limits, nullable or defaulted columns, plain indexes, relaxed columns and rows', async () => {
    const sql = `create schema if not exists sales;
create table sales.orders (id int primary key, code text not null unique);
create unique index orders_code on sales.orders (code);
alter table sales.orders add constraint orders_code_check check (code <> '');
alter table sales.lines add column note text, add column qty int not null default 1;
alter table sales.lines alter column sku drop not null;
create index lines_note on sales.lines (note);
create or replace function sales.total() returns int language sql as 'select 1';
insert into sales.orders values (1, 'a');
update sales.lines set note = 'x';
comment on table sales.orders is 'Orders';
grant select on sales.orders to reporting;
revoke select on sales.lines from reporting;`
    expect(await contractingSql(sql)).toEqual([])
  })

  it('names what takes from older code: drops, renames, moves, type changes and new limits on tables there already', async () => {
    const sql = `alter table sales.lines drop column note;
alter table sales.lines rename column sku to code;
alter table sales.lines rename to items;
alter table sales.lines set schema archive;
alter table sales.lines alter column qty type bigint;
alter table sales.lines alter column qty set not null;
alter table sales.lines add column code text not null;
alter table sales.lines add column ref int references sales.orders (id);
alter table sales.lines add constraint qty_positive check (qty > 0);
create unique index lines_sku on sales.lines (sku);
drop table sales.lines;
delete from sales.lines;`
    expect(await contractingSql(sql)).toEqual([
      'drops a column',
      'renames a table, column or other object',
      'renames a table, column or other object',
      'moves an object to another schema',
      "changes a column's type",
      'makes a column not null',
      'adds the required column code without a default',
      "adds the column ref with a constraint older code's rows may break",
      'adds a constraint to a table there already, which rows written by older code may break',
      'adds a unique index to a table there already, which rows written by older code may break',
      'drops table sales.lines',
      'deletes rows',
    ])
  })

  it('takes a function, trigger or view made again by the same SQL as replaced, but not after cascade, and not a do block', async () => {
    const replaced = `drop view sales.open_orders;
create view sales.open_orders as select 1 as id;
drop trigger orders_audit on sales.orders;
create trigger orders_audit after insert on sales.orders for each row execute function sales.audit();`
    expect(await contractingSql(replaced)).toEqual([])
    expect(await contractingSql('drop view sales.open_orders cascade;\ncreate view sales.open_orders as select 1 as id;')).toEqual(['drops view sales.open_orders with cascade'])
    expect(await contractingSql('create view sales.open_orders as select 1 as id;\ndrop view sales.open_orders;')).toEqual(['drops view sales.open_orders without making it again'])
    expect(await contractingSql("do $$ begin perform 1; end $$;")).toEqual(['Do, which the lint cannot tell only adds'])
    expect(await contractingSql('alter tabel x;')).toEqual(['SQL the parser cannot read'])
  })
})
