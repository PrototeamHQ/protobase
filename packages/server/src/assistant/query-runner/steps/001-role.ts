import { queryRoleSql, queryRunnerSchema } from '../runner-sql'

// Step 1 of the query role: frozen once released, as every step is.

/**
 * The runner's schema and the role the read-only queries run as. The migrating role becomes a member of the role,
 * which Postgres 16 needs to hand it the runner. The role bypasses row-level security only when the migrating role may
 * give it that: a superuser, or a role with BYPASSRLS on Postgres 16 or later.
 */
export const roleStep = () => `create schema if not exists ${queryRunnerSchema};

do $$
declare
  query_role text := ${queryRoleSql};
begin
  if not exists (select from pg_roles where rolname = query_role) then execute format('create role %I nologin', query_role); end if;
  execute format('grant %I to current_user', query_role);
  if (select rolsuper or (rolbypassrls and current_setting('server_version_num')::int >= 160000) from pg_roles where rolname = current_user) then execute format('alter role %I bypassrls', query_role); end if;
end $$;`
