import type { Db } from '@protobase/query'
import { describe, expect, it } from 'vitest'
import { defineTool } from '../assistant/tools'
import { mcpTools } from './mcp-tools'
import type { McpWrites } from './mcp-writes'

const db = {} as Db
const names = (sql: boolean, roles: string[], writes: McpWrites = false) => mcpTools({ db, sql, writes })({ user: { id: 1, roles } }).map((tool) => tool.name)
const records = ['list_resources', 'describe_resource', 'list_records', 'count_records', 'get_record']

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

  it("offers the app's own tools after the built-in ones, whatever writes says", () => {
    const tool = (name: string) => defineTool({ name, description: name, parameters: { type: 'object' }, run: async () => name })
    const own = [tool('send_invoice'), tool('usage')]
    const tools = (writes: McpWrites) => mcpTools({ db, sql: true, writes, own })({ user: { id: 1, roles: ['admin'] } }).map((entry) => entry.name)
    expect(tools(false)).toEqual([...records, 'run_read_only_query', 'send_invoice', 'usage'])
    expect(tools(true)).toEqual([...records, 'create_record', 'update_record', 'delete_record', 'batch_write', 'run_read_only_query', 'send_invoice', 'usage'])
    expect(mcpTools({ db, sql: true, writes: false, own })({ user: { id: 1, roles: ['sales'] } }).map((entry) => entry.name)).toEqual([...records, 'send_invoice', 'usage'])
  })

  it("stops startup on an own tool named twice, or named as a built-in tool even one its options leave off", () => {
    const tool = (name: string) => defineTool({ name, description: name, parameters: { type: 'object' }, run: async () => name })
    for (const name of ['get_record', 'create_record', 'add_comment', 'run_read_only_query']) {
      expect(() => mcpTools({ db, sql: false, writes: false, own: [tool(name)] })).toThrow(`The MCP tool "${name}" has the name of a built-in MCP tool; give it another name`)
    }
    expect(() => mcpTools({ db, sql: false, writes: false, own: [tool('usage'), tool('usage')] })).toThrow('Two assistant tools are named "usage"')
  })

  it('gives every session the same tool objects, so their schemas are compiled once', () => {
    const tools = mcpTools({ db, sql: true, writes: true })
    const first = tools({ user: { id: 1, roles: ['admin'] } })
    tools({ user: { id: 2, roles: ['admin'] } }).forEach((tool, index) => expect(tool).toBe(first[index]))
    tools({ user: { id: 3, roles: ['sales'] } }).forEach((tool, index) => expect(tool).toBe(first[index]))
  })
})
