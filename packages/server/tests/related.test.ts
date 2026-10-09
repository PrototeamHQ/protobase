import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, l, resource, view, type RelatedModel } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const hasRole = (role: string) => (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.some((entry) => entry === 'admin' || entry === role) ?? false

const rooms = resource('rooms')
  .table('rooms')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

const guests = resource('guests')
  .table('guests')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), passport: f.text().sensitive(), phone: f.text().access({ read: hasRole('desk') }) })
  .primaryKey((r) => r.id)

const bookings = resource('bookings')
  .table('bookings')
  .fields({ id: f.integer().readOnly().filterable().sortable(), roomId: f.relation('rooms').filterable(), nights: f.integer().filterable().sortable(), note: f.text() })
  .primaryKey((r) => r.id)
  .access({ read: hasRole('desk'), list: hasRole('desk') })

const bookingGuests = resource('bookingGuests')
  .table('booking_guests')
  .fields({ bookingId: f.relation('bookings').filterable(), guestId: f.relation('guests').filterable(), lead: f.boolean().filterable() })
  .primaryKey((r) => [r.bookingId, r.guestId])

const resources = [rooms, guests, bookings, bookingGuests]

const roomView = (item: RelatedModel) => view<typeof rooms>('rooms').layout((r) => [l.section('Room', [r.name]), item])

let db: Kysely<any>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec('create table rooms (id integer primary key, name text not null)')
  db = new Kysely({ dialect: new PGliteDialect(pg) })
})
afterAll(async () => { await db.destroy() })

const admin = (item: RelatedModel) => createAdmin({ resources, views: [roomView(item)], db, authenticate: testAuthenticator })
const related = (title: string, o: Omit<RelatedModel, 'kind' | 'title'>) => l.related(title, o) as RelatedModel

describe('l.related', () => {
  it('is a layout item of its own', () => {
    expect(related('Bookings', { resource: 'bookings', field: 'roomId', sort: 'nights desc' })).toEqual({ kind: 'related', title: 'Bookings', resource: 'bookings', field: 'roomId', sort: 'nights desc' })
  })

  it('accepts a section directly or through a join resource, with columns through relations', () => {
    expect(() => admin(related('Bookings', { resource: 'bookings', field: 'roomId', filter: 'nights > 1', sort: 'nights desc', columns: ['nights', 'roomId.name'] }))).not.toThrow()
    expect(() => admin(related('Guests', { resource: 'bookingGuests', field: 'bookingId', through: { resource: 'bookings', field: 'roomId', filter: 'nights > 0' }, columns: ['guestId', 'guestId.name', 'lead'] }))).not.toThrow()
  })

  it('refuses a section that does not fit the resources, naming the view and the section', () => {
    const problems: Array<[Omit<RelatedModel, 'kind' | 'title'>, string]> = [
      [{ resource: 'nothing', field: 'roomId' }, 'unknown resource "nothing"'],
      [{ resource: 'bookings', field: 'missing' }, 'unknown field "missing" on bookings'],
      [{ resource: 'bookings', field: 'note' }, '"note" on bookings is not filterable'],
      [{ resource: 'bookings', field: 'nights' }, '"nights" on bookings is not a relation to rooms'],
      [{ resource: 'bookingGuests', field: 'guestId' }, '"guestId" on bookingGuests is not a relation to rooms'],
      [{ resource: 'bookings', field: 'roomId', filter: 'note = "x"' }, 'filter: Field "note" cannot be filtered on'],
      [{ resource: 'bookings', field: 'roomId', sort: 'note' }, 'sort:'],
      [{ resource: 'bookings', field: 'roomId', columns: ['roomId.floor'] }, 'column: unknown field "roomId.floor" on rooms'],
      [{ resource: 'bookings', field: 'roomId', pageSize: 0 }, 'pageSize must be a whole number from 1 to 100'],
      [{ resource: 'bookingGuests', field: 'bookingId', through: { resource: 'bookings', field: 'note' } }, 'through: "note" on bookings is not filterable'],
      [{ resource: 'guests', field: 'id', through: { resource: 'bookingGuests', field: 'bookingId' } }, 'through: bookingGuests has a composite key, so name the field to collect with "key"'],
      [{ resource: 'bookingGuests', field: 'bookingId', through: { resource: 'bookings', field: 'roomId' }, columns: ['guestId.passport'] }, 'column: "guestId.passport" is sensitive'],
    ]
    for (const [options, message] of problems) {
      expect(() => admin(related('Stays', options)), message).toThrow(`View "rooms": related "Stays": ${message}`)
    }
  })
})

describe('a related section in /meta', () => {
  const app = () => admin(related('Guests', { resource: 'bookingGuests', field: 'bookingId', through: { resource: 'bookings', field: 'roomId' }, columns: ['guestId', 'guestId.phone', 'lead'] }))
  const layout = async (roles: string) => {
    const meta = await (await app().request('/api/meta', { headers: as(undefined, roles) })).json()
    return meta.views.find((entry: { resource: string }) => entry.resource === 'rooms').layout as Array<{ kind: string; columns?: string[] }>
  }

  it('is sent to a caller who can read every resource it names', async () => {
    expect((await layout('desk')).find((item) => item.kind === 'related')?.columns).toEqual(['guestId', 'guestId.phone', 'lead'])
  })

  it('loses the columns the caller cannot read', async () => {
    const appWithoutBookingRule = createAdmin({
      resources: [rooms, guests, bookings.access({ read: () => true, list: () => true }), bookingGuests],
      views: [roomView(related('Guests', { resource: 'bookingGuests', field: 'bookingId', through: { resource: 'bookings', field: 'roomId' }, columns: ['guestId', 'guestId.phone', 'lead'] }))],
      db,
      authenticate: testAuthenticator,
    })
    const meta = await (await appWithoutBookingRule.request('/api/meta', { headers: as(undefined, 'guest') })).json()
    expect(meta.views.find((entry: { resource: string }) => entry.resource === 'rooms').layout[1].columns).toEqual(['guestId', 'lead'])
  })

  it('is left out for a caller who cannot read a resource it goes through', async () => {
    expect((await layout('guest')).map((item) => item.kind)).toEqual(['section'])
  })
})
