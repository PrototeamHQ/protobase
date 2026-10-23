import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { Db } from '@protobase/query'
import { reorderIn } from './batch/reorder'
import type { Deps } from './deps'
import { checkedFilter, checkedSort } from './filter-input'
import { resourceSchemas } from './openapi/schemas'
import { buildRegistry } from './registry'
import { requestAccess, writableFields } from './request-access'
import { validateBody } from './validate-body'

const isLoop = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('loop') ?? false
const isAdmin = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('admin') ?? false

// The admin sets a sealed value only the loop reads; the other fields the admin cannot read follow the resource's writes.
const secrets = resource('secrets')
  .table('secrets')
  .fields({
    id: f.integer().readOnly(),
    name: f.text(),
    sealed_value: f.text().access({ read: isLoop, create: isAdmin, update: isAdmin }),
    first_value: f.text().optional().access({ read: isLoop, create: isAdmin }),
    note: f.text().optional().access({ read: isLoop }),
    attachment: f.file().optional().access({ read: isLoop, create: isAdmin, update: isAdmin }),
  })
  .primaryKey((r) => r.id)

// Ranks the admin may set but not read: a plain one, and the resource's position.
const steps = resource('steps')
  .table('steps')
  .fields({
    id: f.integer().readOnly(),
    hidden_rank: f.integer().access({ read: isLoop, create: isAdmin, update: isAdmin }),
    position: f.integer().sortable().access({ read: isLoop, create: isAdmin, update: isAdmin }),
  })
  .primaryKey((r) => r.id)
  .position((r) => r.position)

const registry = buildRegistry([secrets, steps])
const entry = registry.find('secrets')!
const deps = { registry, accessOptions: {} } as unknown as Deps
const accessOf = (role: string, of = entry) => requestAccess(deps, of, { user: { id: '1', roles: [role] } })

const refusal = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as { extras?: { errors?: unknown[] } }).extras?.errors ?? error
  }
  throw new Error('The body was accepted')
}

describe('a write-only field', () => {
  it('is written by a role whose own field rule allows it, on create and on update', async () => {
    const admin = await accessOf('admin')
    expect(validateBody(admin, 'create', { name: 'TOKEN', sealed_value: 'v1.sealed', first_value: 'v1.first' })).toEqual({ name: 'TOKEN', sealed_value: 'v1.sealed', first_value: 'v1.first' })
    expect(validateBody(admin, 'update', { sealed_value: 'v1.again' })).toEqual({ sealed_value: 'v1.again' })
  })

  it('is never readable by that role, so no response, filter or sort of theirs names it', async () => {
    const admin = await accessOf('admin')
    expect(Object.keys(admin.model.fields)).toEqual(['id', 'name'])
    expect(Object.keys(admin.readable.fields)).toEqual(['id', 'name'])
    expect(() => checkedFilter(admin.model, 'sealed_value = "v1.sealed"')).toThrow(/sealed_value/)
    expect(() => checkedSort(admin.model, 'sealed_value')).toThrow(/sealed_value/)
  })

  it('stays unknown where the write rule is only the resource\'s, per operation, and for a file field', async () => {
    const admin = await accessOf('admin')
    expect(writableFields(admin, 'create')).toEqual(['name', 'sealed_value', 'first_value'])
    expect(writableFields(admin, 'update')).toEqual(['name', 'sealed_value'])
    const unknown = (mode: 'create' | 'update', field: string) =>
      expect(refusal(() => validateBody(admin, mode, { name: 'TOKEN', [field]: 'x' }))).toEqual([{ field, code: 'unknown-field', message: `Unknown field "${field}"` }])
    unknown('create', 'note')
    unknown('create', 'attachment')
    unknown('update', 'first_value')
    unknown('update', 'attachment')
  })

  it('is in the API documentation\'s write bodies only', async () => {
    const schemas = resourceSchemas(await accessOf('admin'))
    expect(Object.keys(schemas.Secrets!.properties!)).not.toContain('sealed_value')
    expect(Object.keys(schemas.SecretsCreate!.properties!)).toEqual(['name', 'sealed_value', 'first_value'])
    expect(Object.keys(schemas.SecretsUpdate!.properties!)).toEqual(['name', 'sealed_value'])
  })

  it('is read, not written, by the role that only reads it', async () => {
    const loop = await accessOf('loop')
    expect(Object.keys(loop.model.fields)).toContain('sealed_value')
    expect(writableFields(loop, 'update')).toEqual(['name', 'first_value', 'note'])
  })

  it('is not the position, and no reorder orders by one, since both compare stored values the caller cannot read', async () => {
    const admin = await accessOf('admin', registry.find('steps')!)
    expect(writableFields(admin, 'update')).toEqual(['hidden_rank'])
    // Refused before any query, so no transaction is needed
    const reorder = reorderIn(undefined as unknown as Db, deps, admin, { field: 'hidden_rank', keys: [[1], [2]], etags: {}, start: 1 }, [])
    await expect(reorder).rejects.toMatchObject({ extras: { errors: [{ field: 'hidden_rank', code: 'unknown-field', message: 'Unknown field "hidden_rank"' }] } })
  })
})
