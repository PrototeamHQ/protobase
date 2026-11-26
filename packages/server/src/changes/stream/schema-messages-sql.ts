import { quoteIdent } from '../capture-sql'
import { ddlPrefix, dropPrefix, emitMessageSql } from '../logical-message'

/** The function the schema change event triggers call, in the changes schema. */
export const schemaMessagesFunction = 'emit_schema_messages'

/** The event triggers' names, one per event; they are the database's own, so the changes schema prefixes them. */
export const schemaMessagesTriggers = (schema: string) => ({ ddl: `${schema}_ddl_messages`, drop: `${schema}_drop_messages` })

/**
 * The function and the event triggers that write each schema change into the WAL as logical messages, in its
 * transaction, so a reader of the change stream meets them in order with the rows: a `protobase_ddl` message for each
 * command a statement such as ALTER TABLE ran (`ddl_command_end`), a `protobase_drop` message for each object a
 * statement dropped (`sql_drop`), each a JSON object of Postgres's own fields. Creating an event trigger takes a
 * superuser, so applying it as another role fails with Postgres's own error.
 */
export const schemaMessagesSql = (schema: string) => {
  const fn = `${quoteIdent(schema)}.${quoteIdent(schemaMessagesFunction)}`
  const { ddl, drop } = schemaMessagesTriggers(schema)
  const ddlContent = "json_build_object('command_tag', command.command_tag, 'object_type', command.object_type, 'schema_name', command.schema_name, 'object_identity', command.object_identity)::text"
  const dropContent = "json_build_object('object_type', command.object_type, 'schema_name', command.schema_name, 'object_identity', command.object_identity)::text"
  return `create or replace function ${fn}() returns event_trigger language plpgsql as $$
declare
  command record;
begin
  if tg_event = 'sql_drop' then
    for command in select object_type, schema_name, object_identity from pg_event_trigger_dropped_objects() loop
      perform ${emitMessageSql(dropPrefix, dropContent)};
    end loop;
    return;
  end if;
  for command in select command_tag, object_type, schema_name, object_identity from pg_event_trigger_ddl_commands() loop
    perform ${emitMessageSql(ddlPrefix, ddlContent)};
  end loop;
end
$$;
drop event trigger if exists ${quoteIdent(ddl)};
create event trigger ${quoteIdent(ddl)} on ddl_command_end execute function ${fn}();
drop event trigger if exists ${quoteIdent(drop)};
create event trigger ${quoteIdent(drop)} on sql_drop execute function ${fn}();`
}
