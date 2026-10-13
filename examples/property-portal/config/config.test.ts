import sharp from 'sharp'
import { configExports, createAdmin } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import * as config from './index'
import { roles } from './roles'

describe('the portal config', () => {
  const { resources, views, pages } = configExports(config)

  it('passes the checks the server makes at startup: views, pages, role limits and the anonymous role', () => {
    expect(() => createAdmin({ resources, views, db: {} as never, files: { secret: 'config-test-secret', sharp }, authenticate: () => { throw new Error('No requests in this test') }, options: { roles } })).not.toThrow()
  })

  it('has a view for every table, and one more for members on listings', () => {
    const viewed = views.map((view) => view.toModel())
    expect(resources.map((source) => source.toModel().name).filter((name) => !viewed.some((view) => view.resource === name))).toEqual([])
    expect(viewed.filter((view) => view.resource === 'listings').map((view) => view.roles ?? [])).toEqual([[], ['member', 'admin']])
    expect(pages.map((entry) => entry.name)).toEqual(['home'])
  })

  it('opens listings as cards with their cover photo and arrows through the rest, offers them on a map, and starts a note from a listing with the listing chosen', () => {
    const [everyone, members] = views.map((view) => view.toModel()).filter((view) => view.resource === 'listings')
    expect(everyone!.list).toMatchObject({
      default: 'cards',
      displays: [
        { kind: 'cards', image: 'photo', title: 'address', amount: ['purchase_price', 'rent_price'], footer: ['place_id', 'agent_name'], photos: { resource: 'listing_photos', field: 'listing_id', image: 'photo', sort: 'position' } },
        { kind: 'map', name: 'map', label: 'Map', latitude: 'latitude', longitude: 'longitude' },
      ],
    })
    expect(everyone!.actions).toEqual([])
    expect(members!.actions.find((action) => action.name === 'add_note')?.run).toEqual({ kind: 'link', to: { kind: 'create', resource: 'notes', values: { listing_id: '{id}' } } })
  })
})
