create schema if not exists query;

do $$
declare
  query_role text := left(current_database(), 57) || '_query';
begin
  if not exists (select from pg_roles where rolname = query_role) then execute format('create role %I nologin', query_role); end if;
  execute format('grant %I to current_user', query_role);
  if (select rolsuper or (rolbypassrls and current_setting('server_version_num')::int >= 160000) from pg_roles where rolname = current_user) then execute format('alter role %I bypassrls', query_role); end if;
end $$;

create or replace function query.run_read_only(statement text, row_limit integer) returns setof json language plpgsql security definer as $f$
declare
  rows refcursor;
  row json;
begin
  open rows no scroll for execute 'select (select json_object_agg(e.key, case when json_typeof(e.value) = ''number'' and e.value::text !~ ''^-?[0-9]{1,15}$'' then to_json(e.value::text) else e.value end order by e.n) from json_each(to_json(r)) with ordinality as e(key, value, n)) from (' || E'\n' || statement || E'\n' || ') r limit ' || (row_limit + 1);
  loop
    fetch rows into row;
    exit when not found;
    return next row;
  end loop;
  close rows;
end
$f$;

do $$
declare
  query_role text := left(current_database(), 57) || '_query';
begin
  execute format('grant create on schema query to %I', query_role);
  execute format('alter function query.run_read_only(text, integer) owner to %I', query_role);
  execute format('revoke create on schema query from %I', query_role);
end $$;

revoke execute on function query.run_read_only(text, integer) from public;
