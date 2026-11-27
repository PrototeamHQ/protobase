import { describe, expect, it } from 'vitest'
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, sql } from 'kysely'
import { actorPrefix, emitMessage, emitMessageSql } from './logical-message'

const db = new Kysely<never>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (k) => new PostgresIntrospector(k), createQueryCompiler: () => new PostgresQueryCompiler() } })

describe('emitMessage', () => {
  it('emits a transactional message, its prefix and content bound, the content as text', () => {
    const compiled = sql`select ${emitMessage(actorPrefix, '{"id":"u1","roles":[]}')}`.compile(db)
    expect(compiled.sql).toBe('select pg_logical_emit_message(true, $1, $2::text)')
    expect(compiled.parameters).toEqual(['protobase_actor', '{"id":"u1","roles":[]}'])
  })

  it('writes the same call into a function body around an SQL expression', () => {
    expect(emitMessageSql('protobase_ddl', 'x::text')).toBe("pg_logical_emit_message(true, 'protobase_ddl', x::text)")
  })
})
