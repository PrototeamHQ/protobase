import { describe, expect, it } from 'vitest'
import { moduleDifference } from '../../schema-modules/module-difference'
import { streamModule } from './stream-module'

const input = { names: { schema: 'events' }, resources: {} }

describe('streamModule', () => {
  it('writes the schema and the event triggers that emit each schema change as a protobase_ddl or protobase_drop message', () => {
    const { sql } = moduleDifference(streamModule, input, undefined)
    expect(sql).toContain('create schema if not exists "events";')
    expect(sql).toContain('create or replace function "events"."emit_schema_messages"() returns event_trigger')
    expect(sql).toContain("pg_logical_emit_message(true, 'protobase_ddl', json_build_object('command_tag', command.command_tag")
    expect(sql).toContain("pg_logical_emit_message(true, 'protobase_drop', json_build_object('object_type', command.object_type")
    expect(sql).toContain('create event trigger "events_ddl_messages" on ddl_command_end execute function "events"."emit_schema_messages"();')
    expect(sql).toContain('create event trigger "events_drop_messages" on sql_drop execute function "events"."emit_schema_messages"();')
  })

  it('writes the triggers again, and nothing else, when the database lacks one', () => {
    const { sql } = moduleDifference(streamModule, input, { lastStep: 1, replaceables: {}, names: input.names })
    expect(sql).not.toContain('create schema')
    expect(sql).toContain('drop event trigger if exists "events_ddl_messages";')
    expect(moduleDifference(streamModule, input, { lastStep: 1, replaceables: { schema_messages: 1 }, names: input.names }).sql).toBeUndefined()
  })
})
