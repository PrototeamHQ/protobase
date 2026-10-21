import { describe, expect, it } from 'vitest'
import { f, l, resource, view } from '@protobase/schema'
import type { Deps } from './deps'
import { metaModel } from './meta-model'
import { fieldModes } from './read-service'
import { buildRegistry } from './registry'
import { requestAccess, writeOnlyFields } from './request-access'
import { pruneView } from './view-access'

const isLoop = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('loop') ?? false
const isAdmin = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('admin') ?? false

// The admin sets a sealed value and a first value only the loop reads; the note neither of them writes blind.
const secrets = resource('secrets')
  .table('secrets')
  .fields({
    id: f.integer().readOnly(),
    sealed_value: f.text().sensitive().access({ read: isLoop, create: isAdmin, update: isAdmin }),
    name: f.text().filterable(),
    first_value: f.text().optional().filterable().access({ read: isLoop, create: isAdmin }),
    note: f.text().optional().access({ read: isLoop }),
  })
  .primaryKey((r) => r.id)

const secretsView = view<typeof secrets>('secrets')
  .list((r) => ({ columns: [r.name, r.note] }))
  .fields((r) => ({ sealed_value: r.sealed_value.label('Sealed value'), note: r.note.label('Note') }))
  .layout((r) => [l.section('Secret', [r.name, r.sealed_value, r.note]), l.section('Notes', [r.note])])
  .toModel()

const registry = buildRegistry([secrets])
const deps = { registry, accessOptions: {} } as unknown as Deps
const accessOf = (role: string) => requestAccess(deps, registry.find('secrets')!, { user: { id: '1', roles: [role] } })

describe('the model /meta sends', () => {
  it('has the fields the caller writes but cannot read, in the model\'s order, sensitive and named by no filter or sort', async () => {
    const admin = await accessOf('admin')
    expect(writeOnlyFields(admin)).toEqual(['sealed_value', 'first_value'])
    const model = metaModel(admin)
    expect(Object.keys(model.fields)).toEqual(['id', 'sealed_value', 'name', 'first_value'])
    expect(model.fields.first_value).toMatchObject({ readOnly: false, sensitive: true, writeOnly: true, filterable: false, sortable: false, aliases: [] })
    expect(model.fields.name).not.toHaveProperty('writeOnly')
  })

  it('is the readable model for a caller with no write-only field', async () => {
    const loop = await accessOf('loop')
    expect(writeOnlyFields(loop)).toEqual([])
    expect(metaModel(loop)).toBe(loop.readable)
  })
})

describe('a record\'s field modes', () => {
  it('list a write-only field the caller may change on the record as edit, and leave out one they may not', async () => {
    const admin = await accessOf('admin')
    expect(fieldModes(admin, true)).toEqual({ id: 'read', name: 'edit', sealed_value: 'edit' })
    expect(fieldModes(admin, false)).toEqual({ id: 'read', name: 'read' })
  })
})

describe('the view /meta sends', () => {
  it('keeps a write-only field in record sections and field hints only', async () => {
    const admin = await accessOf('admin')
    const pruned = pruneView(secretsView, admin.readable, { secrets: admin.model }, new Set(), new Set(), new Set(writeOnlyFields(admin)))
    expect(pruned.layout).toEqual([{ kind: 'section', title: 'Secret', fields: ['name', 'sealed_value'] }])
    expect(pruned.fields).toEqual({ sealed_value: { label: 'Sealed value' } })
    expect(pruned.list?.columns).toEqual(['name'])
  })
})
