import { describe, expect, it } from 'vitest'
import { appPath, type AppAddress, type ResourceModel } from '@protobase/schema'
import type { GridRow } from '../../data-grid'
import { rentalResources, rentalViews } from '../testing/rentals-domain'
import { embeddedRowTargets } from './embedded-row-targets'

const resources: Record<string, ResourceModel> = Object.fromEntries(rentalResources.map((model) => [model.name, model]))
const views = Object.fromEntries(rentalViews.map((view) => [view.resource, view]))
const model = resources.lease_tenants!
const targets = (opens: string | undefined, canUpdate = true) => embeddedRowTargets({ model, view: views.lease_tenants, opens, resources, views, canUpdate })
const linkTo = (to: AppAddress) => ({ href: appPath(to), onFollow: () => undefined })
const ada = { id: '2,1', lease_id: 2, tenant_id: { id: 1, name: 'Ada de Vries' }, role: 'primary' }

// The menu's items for a row, as label and where each leads
const menu = (opens: string | undefined, row: GridRow, canUpdate = true) =>
  targets(opens, canUpdate)
    .actions(linkTo)
    .filter((action) => action.available?.(row) ?? true)
    .map((action) => [action.label, action.link!(row).href])

describe('embeddedRowTargets', () => {
  it('opens the row itself without a relation to open', () => {
    expect(targets(undefined).address(ada)).toEqual({ kind: 'record', resource: 'lease_tenants', key: [2, 1] })
    expect(menu(undefined, ada)).toEqual([['Open lease tenant', appPath({ kind: 'record', resource: 'lease_tenants', key: [2, 1] })]])
  })

  it('opens the record on the other side, and edits the link itself from the menu', () => {
    expect(targets('tenant_id').address(ada)).toEqual({ kind: 'record', resource: 'tenants', key: 1 })
    expect(menu('tenant_id', ada)).toEqual([
      ['Open tenant', appPath({ kind: 'record', resource: 'tenants', key: 1 })],
      ['Edit lease tenant', appPath({ kind: 'record', resource: 'lease_tenants', key: [2, 1], edit: true })],
    ])
  })

  it('opens the link for a user who may not edit it, and for a row that points nowhere', () => {
    expect(menu('tenant_id', ada, false).map(([label]) => label)).toEqual(['Open tenant', 'Open lease tenant'])
    expect(menu('tenant_id', { ...ada, permissions: { update: false, delete: false } }).map(([label]) => label)).toEqual(['Open tenant', 'Open lease tenant'])
    const nowhere = { ...ada, tenant_id: null }
    expect(targets('tenant_id').address(nowhere)).toEqual({ kind: 'record', resource: 'lease_tenants', key: [2, null] })
    expect(menu('tenant_id', nowhere).map(([label]) => label)).toEqual(['Edit lease tenant'])
  })
})
