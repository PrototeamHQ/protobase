import sharp from 'sharp'
import { configExports, createAdmin } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import * as config from './index'
import { roles } from './roles'

describe('the portal mobile bottom bars', () => {
  const { resources, views, pages, bottomBars } = configExports(config)

  it('gives members, admins and visitors home, listings, favorites and searches', () => {
    expect(bottomBars.map((bar) => bar.toBottomBarModel())).toEqual([
      expect.objectContaining({ label: 'Portal', roles: ['member', 'admin'], items: [
        { kind: 'page', page: 'home', label: 'Home' },
        { kind: 'resource', resource: 'listings', label: 'Listings' },
        { kind: 'resource', resource: 'favorites', label: 'Favorites', icon: 'heart' },
        { kind: 'resource', resource: 'saved_searches', label: 'Searches', icon: 'bookmark' },
      ] }),
      expect.objectContaining({ label: 'Browse', roles: ['anonymous'], items: [
        { kind: 'page', page: 'home', label: 'Home' },
        { kind: 'resource', resource: 'listings', label: 'Listings' },
        { kind: 'resource', resource: 'favorites', label: 'Favorites', icon: 'heart' },
        { kind: 'resource', resource: 'saved_searches', label: 'Searches', icon: 'bookmark' },
      ] }),
    ])
  })

  it('fits the resources, pages and roles', () => {
    expect(() => createAdmin({ resources, views, pages, bottomBars, db: {} as never, files: { secret: 'config-test-secret', sharp }, authenticate: () => { throw new Error('No requests in this test') }, options: { roles } })).not.toThrow()
  })
})
