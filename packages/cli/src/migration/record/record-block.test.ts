import { describe, expect, it } from 'vitest'
import { recordBlock, recordId, sqlHash, textBeforeRecord } from './record-block'

const row = { id: 'id-1', number: 3, name: '003_auth', protobaseVersion: '1.0.0', model: {}, modelHash: 'hash', physical: { auth: ["it's"] }, additive: true, completed: true }

describe('recordBlock', () => {
  it("ends with the insert of the file's own row, its strings quoted", () => {
    const block = recordBlock(row, 'abc')
    expect(block.startsWith('-- protobase:record id-1\n')).toBe(true)
    expect(block).toContain('create table if not exists migrations.history (')
    expect(block.trimEnd().split('\n').at(-1)).toBe(
      "insert into migrations.history (id, number, name, protobase_version, model, model_hash, physical, additive, sql_hash, completed_at) values ('id-1', 3, '003_auth', '1.0.0', '{}'::jsonb, 'hash', '{\"auth\":[\"it''s\"]}'::jsonb, true, 'abc', clock_timestamp());",
    )
  })

  it('leaves what is unknown null, and the row incomplete when an .after.sql follows', () => {
    expect(recordBlock({ ...row, number: null, additive: null, completed: false }, null)).toContain("values ('id-1', null, '003_auth', '1.0.0', '{}'::jsonb, 'hash', '{\"auth\":[\"it''s\"]}'::jsonb, null, null, null);")
  })
})

describe('sqlHash', () => {
  it('covers the text before the record block, whatever its line endings', () => {
    const text = 'create table a ();\n'
    const block = recordBlock(row, sqlHash(text))
    expect(textBeforeRecord(`${text}${block}`)).toBe(text)
    expect(sqlHash(`${text}${block}`)).toBe(sqlHash(text))
    expect(sqlHash('create table a ();\r\n')).toBe(sqlHash(text))
    expect(sqlHash('create table b ();\n')).not.toBe(sqlHash(text))
  })
})

describe('recordId', () => {
  it("reads the id of the file's record block", () => {
    expect(recordId(`select 1;\n${recordBlock(row, null)}`)).toBe('id-1')
    expect(recordId('select 1;\n')).toBeUndefined()
  })
})
