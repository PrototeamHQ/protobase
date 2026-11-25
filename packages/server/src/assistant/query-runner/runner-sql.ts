/** The schema the read-only query runner lives in. */
export const queryRunnerSchema = 'query'

/** The function every read-only query runs through, as the query role. */
export const queryRunnerFunction = `${queryRunnerSchema}.run_read_only`

/** Its signature, as `to_regprocedure` and `revoke` name it. */
export const queryRunnerSignature = `${queryRunnerFunction}(text, integer)`

/**
 * The query role's name, computed by Postgres when the SQL runs, so one migration file serves every environment's
 * database. Roles belong to the whole cluster, so the name carries the database's, cut to leave room for the suffix.
 */
export const queryRoleSql = "left(current_database(), 57) || '_query'"

/**
 * The runner's plpgsql body. A cursor runs the statement, which Postgres refuses when the text holds more than one
 * query. Each row comes back as JSON, a number that is not a plain integer of at most 15 digits as its exact text,
 * which `JSON.parse` would otherwise round or reformat. The newlines keep a trailing `--` comment from swallowing the
 * wrapper.
 */
export const runnerBody = `
declare
  rows refcursor;
  row json;
begin
  open rows no scroll for execute 'select (select json_object_agg(e.key, case when json_typeof(e.value) = ''number'' and e.value::text !~ ''^-?[0-9]{1,15}$'' then to_json(e.value::text) else e.value end order by e.n) from json_each(to_json(r)) with ordinality as e(key, value, n)) from (' || E'\\n' || statement || E'\\n' || ') r limit ' || (row_limit + 1);
  loop
    fetch rows into row;
    exit when not found;
    return next row;
  end loop;
  close rows;
end
`

/**
 * The runner, made again and handed to the query role, which it runs every statement as; the migrating role, a member
 * of the role, may execute it, PUBLIC may not.
 */
export const runnerSql = () =>
  [
    `create or replace function ${queryRunnerFunction}(statement text, row_limit integer) returns setof json language plpgsql security definer as $f$${runnerBody}$f$;`,
    [
      'do $$',
      'declare',
      `  query_role text := ${queryRoleSql};`,
      'begin',
      `  execute format('grant create on schema ${queryRunnerSchema} to %I', query_role);`,
      `  execute format('alter function ${queryRunnerSignature} owner to %I', query_role);`,
      `  execute format('revoke create on schema ${queryRunnerSchema} from %I', query_role);`,
      'end $$;',
    ].join('\n'),
    `revoke execute on function ${queryRunnerSignature} from public;`,
  ].join('\n\n')
