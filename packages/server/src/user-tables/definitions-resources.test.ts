import { describe, expect, it } from 'vitest'
import { defineRoles, resolveAccess } from '@protobase/schema'
import { definitionsResources } from './definitions-resources'

const operations = ['list', 'read', 'create', 'update', 'delete'] as const
const roles = defineRoles({
  admin: ['*'],
  builder: ['user_tables.read', 'user_tables.create', 'user_table_fields.read', 'user_table_fields.create'],
  fields_only: ['user_table_fields.create'],
  writer: ['*.read', '*.create', '*.update', '*.delete'],
  everything: ['*.*'],
})

const { tables, fields } = definitionsResources({ roles: true, taken: ['orders'] })
const allowed = async (source: typeof tables | typeof fields, user: { id: string; roles?: string[] }, options = {}) => {
  const { operations: decided } = await resolveAccess(source, { user }, options)
  return operations.filter((operation) => decided[operation])
}

const issuesOf = (source: typeof tables | typeof fields, record: Record<string, unknown>) =>
  source.validators.flatMap((validate) => (validate as (record: Record<string, unknown>) => { field: string }[] | undefined)(record) ?? []).map((issue) => issue.field)

describe('the resources over the definitions', () => {
  it('give only * and capabilities naming them, never a wildcard over resources, and no one deletes', async () => {
    for (const source of [tables, fields]) {
      expect(await allowed(source, { id: '1', roles: ['admin'] }, { roles })).toEqual(['list', 'read', 'create', 'update'])
      expect(await allowed(source, { id: '2', roles: ['writer'] }, { roles })).toEqual([])
      expect(await allowed(source, { id: '3', roles: ['everything'] }, { roles })).toEqual([])
      expect(await allowed(source, { id: '4', roles: [] }, { roles })).toEqual([])
      expect(await allowed(source, { id: '5', roles: ['unknown'] }, { roles })).toEqual([])
      expect(await allowed(source, { id: '6' }, { roles })).toEqual([])
    }
    expect(await allowed(tables, { id: '7', roles: ['builder'] }, { roles })).toEqual(['list', 'read', 'create'])
    expect(await allowed(tables, { id: '8', roles: ['fields_only'] }, { roles })).toEqual([])
    expect(await allowed(fields, { id: '8', roles: ['fields_only'] }, { roles })).toEqual(['create'])
  })
  it('give admins alone everything but delete, without roles', async () => {
    const open = definitionsResources({ roles: false, taken: [] })
    for (const source of [open.tables, open.fields]) {
      expect(await allowed(source, { id: '1', roles: ['admin'] })).toEqual(['list', 'read', 'create', 'update'])
      expect(await allowed(source, { id: '2', roles: ['user'] })).toEqual([])
      expect(await allowed(source, { id: '3' })).toEqual([])
    }
  })
  it('never let a name, type or table change once created', async () => {
    const { writableFields } = await resolveAccess(fields, { user: { id: '1', roles: ['admin'] } }, { roles })
    expect(writableFields.update.sort()).toEqual(['label', 'position'])
    const table = await resolveAccess(tables, { user: { id: '1', roles: ['admin'] } }, { roles })
    expect(table.writableFields.update.sort()).toEqual(['plural_label', 'singular_label', 'title_field'])
  })
  it.each([`notes"; --`, 'Notes', 'table_definitions.x', 'my notes', 'select', 'n'.repeat(64), 'orders', 'user_tables', 'user_table_fields'])('refuse the table name %j', (name) => {
    expect(issuesOf(tables, { name, singular_label: 'Note', plural_label: 'Notes' })).toEqual(['name'])
  })
  it('refuse a title field that is no name a field can have', () => {
    expect(issuesOf(tables, { name: 'notes', title_field: 'id' })).toEqual(['title_field'])
    expect(issuesOf(tables, { name: 'notes', title_field: 'title' })).toEqual([])
  })
  it.each([`title"; --`, 'Title', 'id', 'etag', 'organization_id', 'order', 'n'.repeat(64)])('refuse the field name %j', (name) => {
    expect(issuesOf(fields, { name, type: 'text', required: false })).toEqual(['name'])
  })
  it('refuse a required field, and a precision or scale a decimal cannot have', () => {
    expect(issuesOf(fields, { name: 'title', type: 'text', required: true })).toEqual(['required'])
    expect(issuesOf(fields, { name: 'price', type: 'decimal', required: false, precision: 12, scale: 2 })).toEqual([])
    expect(issuesOf(fields, { name: 'price', type: 'decimal', required: false, precision: 1001, scale: 2 })).toEqual(['precision'])
    expect(issuesOf(fields, { name: 'price', type: 'decimal', required: false, precision: 12, scale: 13 })).toEqual(['scale'])
    expect(issuesOf(fields, { name: 'price', type: 'decimal', required: false })).toEqual(['precision', 'scale'])
    expect(issuesOf(fields, { name: 'count', type: 'integer', required: false, precision: 12 })).toEqual(['precision'])
  })
  it("with organizations, keep each definition and field in its organization, for that organization's owners and admins alone", async () => {
    const scoped = definitionsResources({ roles: true, taken: ['orders'], organizations: true })
    for (const source of [scoped.tables, scoped.fields]) {
      expect(source.toModel().tenant).toBe('organization_id')
      const allowedIn = async (context: Parameters<typeof resolveAccess>[1]) => {
        const { operations: decided } = await resolveAccess(source, context, { roles })
        return operations.filter((operation) => decided[operation])
      }
      expect(await allowedIn({ user: { id: '1', roles: [] }, organization: { id: 'a', role: 'admin' } })).toEqual(['list', 'read', 'create', 'update'])
      expect(await allowedIn({ user: { id: '1', roles: [] }, organization: { id: 'a', role: 'owner' } })).toEqual(['list', 'read', 'create', 'update'])
      expect(await allowedIn({ user: { id: '1', roles: ['admin'] }, organization: { id: 'a' } })).toEqual(['list', 'read', 'create', 'update'])
      expect(await allowedIn({ user: { id: '1', roles: ['builder'] }, organization: { id: 'a', role: 'member' } })).toEqual([])
      expect(await allowedIn({ user: { id: '1', roles: ['admin'] } })).toEqual([])
    }
    const { writableFields } = await resolveAccess(scoped.tables, { user: { id: '1', roles: [] }, organization: { id: 'a', role: 'admin' } }, { roles })
    expect(writableFields.create).not.toContain('table_name')
  })
  it('with organizations, take a name a resource of the app has, up to 42 bytes, as its table is t<id>_<name>', () => {
    const scoped = definitionsResources({ roles: true, taken: ['orders'], organizations: true })
    expect(issuesOf(scoped.tables, { name: 'orders', singular_label: 'Order', plural_label: 'Orders' })).toEqual([])
    expect(issuesOf(scoped.tables, { name: 'n'.repeat(43), singular_label: 'N', plural_label: 'Ns' })).toEqual(['name'])
    expect(issuesOf(scoped.tables, { name: 'select', singular_label: 'N', plural_label: 'Ns' })).toEqual(['name'])
  })
})
