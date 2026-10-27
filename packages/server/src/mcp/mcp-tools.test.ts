import type { Db } from '@protobase/query'
import { describe, expect, it } from 'vitest'
import { mcpTools } from './mcp-tools'
import type { McpWrites } from './mcp-writes'

const db = {} as Db
const names = (sql: boolean, roles: string[], writes: McpWrites = false) => mcpTools({ db, sql, writes })({ user: { id: 1, roles } }).map((tool) => tool.name)
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
    expect(names(false, ['sales'], true)).toEqual([...records, 'create_record', 'update_record', 'delete_record', 'batch_write'])
    expect(names(true, ['admin'], true)).toEqual([...records, 'create_record', 'update_record', 'delete_record', 'batch_write', 'run_read_only_query'])
  })

  it('offers the write tools on the listed resources only with writes limited', () => {
    expect(names(false, ['admin'], { resources: ['tasks'] })).toEqual([...records, 'create_record', 'update_record', 'delete_record', 'batch_write'])
    const writeTools = mcpTools({ db, sql: false, writes: { resources: ['tasks'] } })({ user: { id: 1, roles: ['admin'] } }).slice(records.length)
    const batch = writeTools.pop()
    expect(batch!.description).toMatch(/It writes only tasks\.$/)
    const limited = expect.objectContaining({ description: 'The resource\'s name: one of tasks.' })
    expect(writeTools.map((tool) => (tool.parameters as { properties: Record<string, unknown> }).properties.resource)).toEqual([limited, limited, limited])
  })

  it('offers list_comments where a resource takes comments, and add_comment after the write tools with writes on', () => {
    const tools = (writes: McpWrites, commented: string[]) => mcpTools({ db, sql: false, writes, commented })({ user: { id: 1, roles: ['sales'] } }).map((tool) => tool.name)
    expect(tools(false, [])).toEqual(records)
    expect(tools(false, ['tasks'])).toEqual([...records, 'list_comments'])
    expect(tools(true, ['tasks'])).toEqual([...records, 'create_record', 'update_record', 'delete_record', 'batch_write', 'list_comments', 'add_comment'])
    expect(tools({ resources: ['labels'] }, ['tasks'])).toEqual([...records, 'create_record', 'update_record', 'delete_record', 'batch_write', 'list_comments'])
  })

  it('gives every session the same tool objects, so their schemas are compiled once', () => {
    const tools = mcpTools({ db, sql: true, writes: true })
    const first = tools({ user: { id: 1, roles: ['admin'] } })
    tools({ user: { id: 2, roles: ['admin'] } }).forEach((tool, index) => expect(tool).toBe(first[index]))
    tools({ user: { id: 3, roles: ['sales'] } }).forEach((tool, index) => expect(tool).toBe(first[index]))
  })
})
