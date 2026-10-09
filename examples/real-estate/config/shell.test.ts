import { createAdmin, configExports } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import * as config from './index'

describe('real estate sidebar and user menu', () => {
  const { resources, views, userMenu } = configExports(config)

  it('has recent groups that fit their resources', () => {
    const grouped = views.map((view) => view.toModel()).filter((view) => view.nav?.recent)
    expect(grouped.map((view) => view.resource).sort()).toEqual(['tickets', 'units'])
    // createAdmin refuses a group or a user menu entry that does not fit, before any request.
    expect(() => createAdmin({ resources, views, userMenu, db: {} as never, authenticate: () => { throw new Error('No requests in this test') } })).not.toThrow()
  })

  it('moves the account pages into the user menu', () => {
    expect(userMenu?.toUserMenuModel().items.map((item) => (item.kind === 'resource' ? item.resource : item.label))).toEqual(['organizations', 'users', 'Documentation', 'Support'])
  })
})
