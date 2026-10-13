import { printFilter, resolveAccess } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { alerts, favorites, listingPhotos, listings, notes, searchProfiles } from './index'
import { publicListingFields, roles } from './roles'

// Two members, an admin and a visitor, as the server's sessions carry them.
const anna = { user: { id: 'user-anna', roles: ['member'] } }
const bram = { user: { id: 'user-bram', roles: ['member'] } }
const admin = { user: { id: 'user-admin', roles: ['admin'] } }
const visitor = { user: { id: '', roles: ['anonymous'] } }

const access = (source: Parameters<typeof resolveAccess>[0], ctx: Parameters<typeof resolveAccess>[1]) => resolveAccess(source, ctx, { roles })
const rows = (filter: unknown) => (filter && typeof filter === 'object' ? printFilter(filter as never) : filter)

const ownData = [['search_profiles', searchProfiles], ['alerts', alerts], ['favorites', favorites], ['notes', notes]] as const

describe('a member\'s own data', () => {
  it.each(ownData)('limits every operation on %s to the rows of the member asking', async (_, source) => {
    for (const [who, id] of [[anna, 'user-anna'], [bram, 'user-bram']] as const) {
      const resolved = await access(source, who)
      for (const operation of ['read', 'update', 'delete'] as const) {
        if (!resolved.operations[operation]) continue
        expect(rows(resolved.rowFilter[operation]), `${source.toModel().name} ${operation}`).toBe(`user_id = "${id}"`)
      }
      expect(resolved.operations.read).toBe(true)
    }
  })

  it.each(ownData)('keeps %s from admins as from everyone else', async (_, source) => {
    expect(rows((await access(source, admin)).rowFilter.read)).toBe('user_id = "user-admin"')
  })

  it.each(ownData)('shows nothing of %s to a visitor', async (_, source) => {
    const resolved = await access(source, visitor)
    expect(resolved.operations).toEqual({ list: false, read: false, create: false, update: false, delete: false })
  })

  it('lets a member write notes, profiles and favorites as their own, and only change whether an alert is seen', async () => {
    for (const source of [notes, searchProfiles, favorites]) {
      const resolved = await access(source, anna)
      expect(resolved.operations.create).toBe(true)
      expect(rows(resolved.rowFilter.create)).toBe('user_id = "user-anna"')
    }
    const resolved = await access(alerts, anna)
    expect(resolved.operations).toMatchObject({ create: false, update: true, delete: true })
    expect(resolved.writableFields.update).toEqual(['seen'])
    expect((await access(favorites, anna)).operations.update).toBe(false)
  })

  it('never lets anyone write the owner', async () => {
    for (const [, source] of ownData) {
      for (const who of [anna, admin]) {
        const resolved = await access(source, who)
        expect(resolved.writableFields.create ?? []).not.toContain('user_id')
        expect(resolved.writableFields.update ?? []).not.toContain('user_id')
      }
    }
  })
})

describe('listings', () => {
  it('shows a visitor the published listings, without the agent to call', async () => {
    const resolved = await access(listings, visitor)
    expect(resolved.operations).toEqual({ list: true, read: true, create: false, update: false, delete: false })
    expect(rows(resolved.rowFilter.read)).toBe('published_at:*')
    expect([...resolved.readableFields].sort()).toEqual([...publicListingFields].sort())
    expect(resolved.readableFields).not.toContain('agent_phone')
  })

  it('shows members the agent too, still of published listings only, and admins the drafts', async () => {
    const member = await access(listings, anna)
    expect(member.readableFields).toContain('agent_phone')
    expect(rows(member.rowFilter.read)).toBe('published_at:*')
    expect(member.operations.update).toBe(false)
    const catalogue = await access(listings, admin)
    expect(catalogue.rowFilter.read).toBeUndefined()
    expect(catalogue.operations).toMatchObject({ create: true, update: true, delete: true })
  })

  it('shows a visitor the photos with their placeholders', async () => {
    const photos = await access(listingPhotos, visitor)
    expect(photos.operations.read).toBe(true)
    expect(photos.readableFields).toEqual(expect.arrayContaining(['photo', 'photo_placeholder']))
    expect((await access(listings, visitor)).readableFields).toEqual(expect.arrayContaining(['photo', 'photo_placeholder']))
  })
})
