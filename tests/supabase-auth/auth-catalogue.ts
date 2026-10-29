import type { Sql } from 'postgres'

// Every object of Supabase's `auth` schema as the catalogue describes it: the schema, its relations, columns,
// constraints, indexes, triggers, policies and functions, with their owners and privileges. A foreign key from
// another schema adds Postgres's internal triggers to the table it references, as every app table that references
// auth.users does, so those are left out.
export const authCatalogue = async (sql: Sql) =>
  (
    await sql<{ line: string }[]>`
      select format('schema %s owner %s acl %s', n.nspname, pg_get_userbyid(n.nspowner), n.nspacl) as line from pg_namespace n where n.nspname = 'auth'
      union all
      select format('relation %s kind %s owner %s acl %s options %s', c.relname, c.relkind, pg_get_userbyid(c.relowner), c.relacl, c.reloptions)
      from pg_class c where c.relnamespace = 'auth'::regnamespace
      union all
      select format('column %s.%s %s not null %s default %s acl %s', c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attacl)
      from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where c.relnamespace = 'auth'::regnamespace and a.attnum > 0 and not a.attisdropped
      union all
      select format('constraint %s.%s %s', c.relname, k.conname, pg_get_constraintdef(k.oid))
      from pg_constraint k join pg_class c on c.oid = k.conrelid where c.relnamespace = 'auth'::regnamespace
      union all
      select format('index %s', pg_get_indexdef(i.indexrelid)) from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'auth'::regnamespace
      union all
      select format('trigger %s.%s %s', c.relname, t.tgname, pg_get_triggerdef(t.oid))
      from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'auth'::regnamespace and not t.tgisinternal
      union all
      select format('policy %s.%s %s %s', c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))
      from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'auth'::regnamespace
      union all
      select format('function %s(%s) owner %s acl %s body %s', p.proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner), p.proacl, md5(p.prosrc))
      from pg_proc p where p.pronamespace = 'auth'::regnamespace
      order by 1`
  ).map(({ line }) => line)
