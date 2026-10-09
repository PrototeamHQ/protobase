import { describe, expect, it } from 'vitest'
import type { DbColumn } from '../db/model'
import { checkEnumValues } from './check-values'
import { typesCompatible } from './compat'
import { parseDefault } from './defaults'
import { inferKind } from './type-map'

const column = (typeName: string, extra: Partial<DbColumn> = {}): DbColumn => ({
  name: 'c',
  position: 1,
  typeName,
  formatted: typeName,
  isEnum: false,
  enumValues: [],
  notNull: true,
  identity: false,
  identityAlways: false,
  generated: false,
  ...extra,
})

describe('inferKind', () => {
  it.each([
    ['int2', 'integer'],
    ['int4', 'integer'],
    ['int8', 'bigint'],
    ['text', 'text'],
    ['varchar', 'text'],
    ['bool', 'boolean'],
    ['date', 'date'],
    ['timestamptz', 'timestamp'],
    ['timestamp', 'timestamp'],
    ['uuid', 'uuid'],
    ['jsonb', 'json'],
    ['json', 'json'],
  ])('%s -> %s', (typeName, type) => {
    expect(inferKind(column(typeName))).toEqual({ type })
  })

  it('reads numeric precision and scale from the formatted type', () => {
    expect(inferKind(column('numeric', { formatted: 'numeric(14,2)' }))).toEqual({
      type: 'decimal',
      precision: 14,
      scale: 2,
    })
  })

  it('maps Postgres enums to enum with their values', () => {
    const kind = inferKind(column('invoice_status', { isEnum: true, enumValues: ['draft', 'sent'] }))
    expect(kind).toEqual({ type: 'enum', enumValues: ['draft', 'sent'] })
  })

  it('turns a check list on a text column into an enum', () => {
    expect(inferKind(column('text'), ['a', 'b'])).toEqual({ type: 'enum', enumValues: ['a', 'b'] })
    expect(inferKind(column('int4'), ['1'])).toEqual({ type: 'integer' })
  })

  it('exposes unknown types as unsupported text', () => {
    expect(inferKind(column('tsvector'))).toEqual({ type: 'text', unsupported: true })
  })
})

describe('checkEnumValues', () => {
  const check = (columns: string[], definition: string) => ({ columns, definition })

  it('reads the normalised IN list', () => {
    const checks = [
      check(['status'], "CHECK ((status = ANY (ARRAY['draft'::text, 'it''s'::text])))"),
    ]
    expect(checkEnumValues(checks, 'status')).toEqual(['draft', "it's"])
  })

  it('reads bpchar lists', () => {
    const checks = [check(['ACTIVE_FLG'], `CHECK (("ACTIVE_FLG" = ANY (ARRAY['Y'::bpchar, 'N'::bpchar])))`)]
    expect(checkEnumValues(checks, 'ACTIVE_FLG')).toEqual(['Y', 'N'])
  })

  it('ignores other checks', () => {
    expect(checkEnumValues([check(['quantity'], 'CHECK ((quantity > 0))')], 'quantity')).toBeUndefined()
    expect(checkEnumValues([check(['a', 'b'], "CHECK ((a = ANY (ARRAY['x'::text])))")], 'a')).toBeUndefined()
  })
})

describe('parseDefault', () => {
  it('parses literals per type', () => {
    expect(parseDefault('0', { type: 'integer' })).toBe(0)
    expect(parseDefault('21', { type: 'decimal' })).toBe('21')
    expect(parseDefault('false', { type: 'boolean' })).toBe(false)
    expect(parseDefault("'draft'::sales.invoice_status", { type: 'enum' })).toBe('draft')
    expect(parseDefault("'Y'::bpchar", { type: 'text' })).toBe('Y')
  })

  it('leaves function defaults to the database', () => {
    expect(parseDefault('now()', { type: 'timestamp' })).toBeUndefined()
    expect(parseDefault('uuidv7()', { type: 'uuid' })).toBeUndefined()
  })
})

describe('typesCompatible', () => {
  it('accepts refinements of the database type', () => {
    expect(typesCompatible('relation', 'bigint')).toBe(true)
    expect(typesCompatible('currency', 'text')).toBe(true)
    expect(typesCompatible('text', 'enum')).toBe(true)
  })

  it('rejects real mismatches', () => {
    expect(typesCompatible('integer', 'text')).toBe(false)
    expect(typesCompatible('relation', 'json')).toBe(false)
  })
})
