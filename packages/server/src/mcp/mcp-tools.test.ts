import type { Db } from '@protobase/query'
import { describe, expect, it } from 'vitest'
import { mcpTools } from './mcp-tools'

const db = {} as Db
const names = (sql: boolean, roles: string[], writes = false) => mcpTools({ db, sql, writes })({ user: { id: 1, roles } }).map((tool) => tool.name)
const records = ['list_resources', 'list_records', 'get_record']

describe('mcpTools', () => {
  it('offers read-only SQL only with sql on, to a caller who sees the assistant', () => {
    expect(names(true, ['admin'])).toEqual([...records, 'run_read_only_query'])
    expect(names(true, ['ai'])).toEqual([...records, 'run_read_only_query'])
    expect(names(true, ['sales'])).toEqual(records)
    expect(names(false, ['admin'])).toEqual(records)
    expect(names(false, ['sales'])).toEqual(records)
  })

  it('offers the write tools after the read tools to any role with writes on', () => {
    expect(names(false, ['sales'], true)).toEqual([...records, 'create_record', 'update_record'])
    expect(names(true, ['admin'], true)).toEqual([...records, 'create_record', 'update_record', 'run_read_only_query'])
  })
})
