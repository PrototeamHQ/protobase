import { describe, expect, it } from 'vitest'
import type { TableIndexes } from '@protobase/query'
import { defineRoles, resolveAccess } from '@protobase/schema'
import { checkDefinition, type CheckedDefinition } from './check-definition'
import { definitionResource } from './definition-resource'
import { column, field, notesColumns, notesDefinition } from './fixtures'
import type { StoredDefinition } from './read-definitions'

const checked = (definition: StoredDefinition = notesDefinition(), columns = notesColumns()) => (checkDefinition(definition, columns) as { definition: CheckedDefinition }).definition

const btree = (column: string) => ({ name: `${column}_idx`, method: 'btree', partial: false, keys: [{ column, definition: column, opclass: 'text_ops' }] })
const trigram = (column: string) => ({ name: `${column}_trgm`, method: 'gin', partial: false, keys: [{ column, definition: column, opclass: 'gin_trgm_ops' }] })
const indexes = (...list: TableIndexes['indexes']): TableIndexes => ({ kind: 'table', indexes: list })

const operations = ['list', 'read', 'create', 'update', 'delete'] as const
const allowedFor = async (user: { id: string; roles?: string[] }, options = {}) => {
  const { resource } = definitionResource(checked())
  const { operations: allowed } = await resolveAccess(resource, { user }, options)
  return operations.filter((operation) => allowed[operation])
}

describe('definitionResource', () => {
  it('builds a resource over user_tables.<name> with an id key, its fields by type and its labels on a view', () => {
    const { resource, view } = definitionResource(checked())
    const model = resource.toModel()
    expect(model.name).toBe('notes')
    expect(model.table).toEqual({ schema: 'user_tables', name: 'notes' })
    expect(model.primaryKey).toEqual(['id'])
    expect(model.fields.id).toMatchObject({ type: 'bigint', readOnly: true })
    expect(model.fields.title).toMatchObject({ type: 'text', nullable: false })
    expect(model.fields.body).toMatchObject({ type: 'text', nullable: true })
    expect(model.explicitGrants).toBe(true)
    const shown = view.toModel(model)
    expect(shown.names).toEqual({ singular: 'Note', plural: 'Notes' })
    expect(shown.title).toBe('title')
    expect(shown.fields.title).toMatchObject({ label: 'Title' })
    expect(shown.fields.body).toMatchObject({ label: 'Body', multiline: true })
  })
  it('builds each of the eight types with the schema builders', () => {
    const columns = notesColumns({
      everything: { id: column('bigint', true, true), a: column('text'), b: column('text'), c: column('integer'), d: column('numeric'), e: column('boolean'), g: column('date'), h: column('timestamp with time zone'), i: column('jsonb') },
    })
    const types = { a: 'text', b: 'long_text', c: 'integer', d: 'decimal', e: 'boolean', g: 'date', h: 'timestamp', i: 'json' }
    const definition = notesDefinition({ name: 'everything', title_field: null, fields: Object.entries(types).map(([name, type]) => field({ name, type, ...(type === 'decimal' && { precision: 12, scale: 2 }) })) })
    const model = definitionResource(checked(definition, columns)).resource.toModel()
    expect(Object.fromEntries(Object.entries(model.fields).map(([name, built]) => [name, built.type]))).toEqual({ id: 'bigint', a: 'text', b: 'text', c: 'integer', d: 'decimal', e: 'boolean', g: 'date', h: 'timestamp', i: 'json' })
  })
  it('claims filters, sorts and search only where an index serves them', () => {
    const bare = definitionResource(checked()).resource.toModel()
    expect([bare.fields.title!.filterable, bare.fields.title!.sortable, bare.fields.id!.sortable, bare.search]).toEqual([false, false, false, undefined])
    const sorted = definitionResource(checked(), indexes(btree('id'), btree('title'))).resource.toModel()
    expect([sorted.fields.title!.filterable, sorted.fields.title!.sortable, sorted.fields.id!.sortable, sorted.search]).toEqual([true, true, true, undefined])
    const searched = definitionResource(checked(), indexes(trigram('title'))).resource.toModel()
    expect([searched.fields.title!.filterable, searched.fields.title!.sortable, searched.search]).toEqual([true, false, ['title']])
    expect(searched.fields.body!.filterable).toBe(false)
  })
  it('lets an admin do everything and anyone else nothing, without roles', async () => {
    expect(await allowedFor({ id: 'u1', roles: ['admin'] })).toEqual([...operations])
    expect(await allowedFor({ id: 'u2', roles: ['user'] })).toEqual([])
    expect(await allowedFor({ id: 'u3' })).toEqual([])
  })
  it('gives a role with *.read, and the anonymous role, nothing', async () => {
    const roles = defineRoles({ admin: ['*'], reader: ['*.read'], writer: ['*.read', '*.create', '*.update', '*.delete'], anonymous: [] })
    expect(await allowedFor({ id: 'u1', roles: ['admin'] }, { roles })).toEqual([...operations])
    expect(await allowedFor({ id: 'u2', roles: ['reader'] }, { roles })).toEqual([])
    expect(await allowedFor({ id: 'u3', roles: ['writer'] }, { roles })).toEqual([])
    expect(await allowedFor({ id: 'anonymous', roles: ['anonymous'] }, { roles })).toEqual([])
  })
  it("makes an organization's table a tenant resource over organization_id, reached only by its own organization's admins", async () => {
    const columns = notesColumns({ t1_notes: { ...Object.fromEntries(notesColumns().get('notes')!), organization_id: column('text', true) } })
    const { resource } = definitionResource(checked(notesDefinition({ name: 't1_notes', organization_id: 'a' }), columns))
    const model = resource.toModel()
    expect(model.tenant).toBe('organization_id')
    expect(model.fields.organization_id).toMatchObject({ type: 'text' })
    expect(model.live).toBeFalsy()
    expect(model.explicitGrants).toBe(true)
    const allowed = async (context: Parameters<typeof resolveAccess>[1]) => {
      const { operations: decided } = await resolveAccess(resource, context)
      return operations.filter((operation) => decided[operation])
    }
    expect(await allowed({ user: { id: '1', roles: [] }, organization: { id: 'a', role: 'admin' } })).toEqual([...operations])
    expect(await allowed({ user: { id: '1', roles: ['admin'] }, organization: { id: 'a' } })).toEqual([...operations])
    expect(await allowed({ user: { id: '1', roles: [] }, organization: { id: 'a', role: 'member' } })).toEqual([])
    expect(await allowed({ user: { id: '1', roles: [] }, organization: { id: 'b', role: 'owner' } })).toEqual([])
    expect(await allowed({ user: { id: '1', roles: ['admin'] }, organization: { id: 'b' } })).toEqual([])
    expect(await allowed({ user: { id: '1', roles: ['admin'] } })).toEqual([])
  })
})
