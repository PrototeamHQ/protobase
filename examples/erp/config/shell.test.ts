import { createAdmin, configExports } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import * as config from './index'
import { roles } from './roles'

describe('ERP sidebar, user menu and bottom bar', () => {
  const { resources, views, userMenu, bottomBars } = configExports(config)

  it('has recent groups that fit their resources', () => {
    const grouped = views.map((view) => view.toModel()).filter((view) => view.nav?.recent)
    expect(grouped.map((view) => view.resource).sort()).toEqual(['invoices', 'orders'])
    // createAdmin refuses a group or a user menu entry that does not fit, before any request.
    expect(() => createAdmin({ resources, views, userMenu, db: {} as never, authenticate: () => { throw new Error('No requests in this test') } })).not.toThrow()
  })

  it('moves the account pages into the user menu', () => {
    expect(userMenu?.toUserMenuModel().items.map((item) => (item.kind === 'resource' ? item.resource : item.label))).toEqual(['organizations', 'users', 'Documentation', 'Support'])
  })

  it('gives the warehouse role a bottom bar that fits the resources and roles', () => {
    expect(bottomBars.map((bar) => bar.toBottomBarModel())).toEqual([expect.objectContaining({ label: 'Warehouse', roles: ['warehouse'] })])
    expect(() => createAdmin({ resources, views, bottomBars, db: {} as never, authenticate: () => { throw new Error('No requests in this test') }, options: { roles } })).not.toThrow()
  })
})
