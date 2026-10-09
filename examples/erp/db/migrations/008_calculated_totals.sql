alter table sales.invoices
  alter column subtotal set default 0,
  alter column vat set default 0,
  alter column total set default 0;
alter table sales.orders alter column total set default 0;

-- Invoice totals: subtotal from the lines, VAT from the invoice rate.
create function sales.refresh_invoice_totals(ids bigint[]) returns void language sql as $$
  update sales.invoices i
  set subtotal = s.subtotal,
      vat = round(s.subtotal * i.vat_rate / 100, 2),
      total = s.subtotal + round(s.subtotal * i.vat_rate / 100, 2)
  from (
    select inv.id, coalesce((select sum(l.line_total) from sales.invoice_lines l where l.invoice_id = inv.id), 0) as subtotal
    from sales.invoices inv
    where inv.id = any (ids)
  ) s
  where i.id = s.id
    and (i.subtotal, i.vat, i.total) is distinct from (s.subtotal, round(s.subtotal * i.vat_rate / 100, 2), s.subtotal + round(s.subtotal * i.vat_rate / 100, 2))
$$;

create function sales.invoice_lines_inserted() returns trigger language plpgsql as $$
begin
  perform sales.refresh_invoice_totals(array(select distinct invoice_id from new_rows));
  return null;
end $$;

create function sales.invoice_lines_updated() returns trigger language plpgsql as $$
begin
  perform sales.refresh_invoice_totals(array(select invoice_id from old_rows union select invoice_id from new_rows));
  return null;
end $$;

create function sales.invoice_lines_deleted() returns trigger language plpgsql as $$
begin
  perform sales.refresh_invoice_totals(array(select distinct invoice_id from old_rows));
  return null;
end $$;

-- Transition tables cannot be combined with several events, so one trigger per event.
create trigger invoice_lines_inserted after insert on sales.invoice_lines
  referencing new table as new_rows for each statement execute function sales.invoice_lines_inserted();
create trigger invoice_lines_updated after update on sales.invoice_lines
  referencing old table as old_rows new table as new_rows for each statement execute function sales.invoice_lines_updated();
create trigger invoice_lines_deleted after delete on sales.invoice_lines
  referencing old table as old_rows for each statement execute function sales.invoice_lines_deleted();

-- A new or re-rated invoice recomputes VAT and total from its current subtotal.
create function sales.invoice_apply_vat() returns trigger language plpgsql as $$
begin
  new.vat := round(new.subtotal * new.vat_rate / 100, 2);
  new.total := new.subtotal + new.vat;
  return new;
end $$;

create trigger invoice_apply_vat before insert or update of vat_rate on sales.invoices
  for each row execute function sales.invoice_apply_vat();

-- Order totals: sum of the lines.
create function sales.refresh_order_totals(ids uuid[]) returns void language sql as $$
  update sales.orders o
  set total = s.total
  from (
    select ord.id, coalesce((select sum(l.quantity * l.unit_price) from sales.order_lines l where l.order_id = ord.id), 0) as total
    from sales.orders ord
    where ord.id = any (ids)
  ) s
  where o.id = s.id and o.total is distinct from s.total
$$;

create function sales.order_lines_inserted() returns trigger language plpgsql as $$
begin
  perform sales.refresh_order_totals(array(select distinct order_id from new_rows));
  return null;
end $$;

create function sales.order_lines_updated() returns trigger language plpgsql as $$
begin
  perform sales.refresh_order_totals(array(select order_id from old_rows union select order_id from new_rows));
  return null;
end $$;

create function sales.order_lines_deleted() returns trigger language plpgsql as $$
begin
  perform sales.refresh_order_totals(array(select distinct order_id from old_rows));
  return null;
end $$;

create trigger order_lines_inserted after insert on sales.order_lines
  referencing new table as new_rows for each statement execute function sales.order_lines_inserted();
create trigger order_lines_updated after update on sales.order_lines
  referencing old table as old_rows new table as new_rows for each statement execute function sales.order_lines_updated();
create trigger order_lines_deleted after delete on sales.order_lines
  referencing old table as old_rows for each statement execute function sales.order_lines_deleted();

-- Recalculate existing rows once.
select sales.refresh_invoice_totals(array(select id from sales.invoices));
select sales.refresh_order_totals(array(select id from sales.orders));
