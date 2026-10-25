import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { view } from './view'

const apps = resource('apps')
  .table('apps')
  .fields({ id: f.uuid(), organization_id: f.text().filterable(), name: f.text() })
  .primaryKey((r) => r.id)

describe("nav({ tenant: 'current' })", () => {
  const across = apps.tenant((r) => r.organization_id, { across: 'memberships' })

  it('keeps the entry in the view model', () => {
    const built = view<typeof across>('apps').nav({ tenant: 'current' }).list((r) => ({ columns: [r.name] })).toModel(across.toModel())
    expect(built.nav).toEqual({ tenant: 'current' })
  })

  it('needs a list to narrow, and a filterable tenant field', () => {
    expect(() => view<typeof across>('apps').nav({ tenant: 'current' }).toModel()).toThrow('needs .list(...)')
    expect(() => view<typeof apps>('apps').nav({ tenant: 'current' }).list((r) => ({ columns: [r.name] })).toModel(apps.toModel())).toThrow('.filterable() field')
    const unfiltered = resource('apps').table('apps').fields({ id: f.uuid(), org: f.text(), name: f.text() }).primaryKey((r) => r.id).tenant((r) => r.org)
    expect(() => view<typeof unfiltered>('apps').nav({ tenant: 'current' }).list((r) => ({ columns: [r.name] })).toModel(unfiltered.toModel())).toThrow('.filterable() field')
  })

  it('applies to a named list by its own nav', () => {
    const named = view<typeof across>('apps').list((r) => ({ columns: [r.name] })).namedList('mine', (v) => v.names({ singular: 'App', plural: 'My apps' }).nav({ tenant: 'current' }))
    expect(() => named.toModel(across.toModel())).toThrow('needs .list(...)')
  })
})
