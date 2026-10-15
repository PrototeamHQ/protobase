import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type ResourcePermissions } from '@protobase/client'
import { appPath, f, resource, view, type SignInViewModel } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { home } from './story-home-page'

const viewports = { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'List page/Saved searches', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const member = createStaticSession('story-token', { id: 'pip', email: 'pip@homes.example', name: 'Pip', role: 'member' })
// A server with an anonymous role and nobody signed in: the status says visitors may browse, and there is no session.
const visitor: AuthSession = { ...member, status: async () => ({ ...(await member.status()), anonymous: true }), session: async () => undefined }

const homes = resource('homes')
  .table('homes')
  .fields({
    id: f.integer().readOnly().filterable(),
    address: f.text().filterable().sortable(),
    rent: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    garden: f.boolean().filterable(),
    published_at: f.timestamp().filterable().sortable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.address])

const searches = resource('searches')
  .table('searches')
  .fields({
    id: f.integer().readOnly().sortable(),
    user_id: f.text().readOnly(),
    name: f.text().optional(),
    filter: f.text(),
    email: f.enum(['instant', 'daily', 'none']),
    seen_at: f.timestamp(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)

const homesView = view<typeof homes>('homes')
  .title((r) => r.address)
  .names({ singular: 'Home', plural: 'Homes' })
  .nav({ group: 'Browse', order: 1 })
  .fields((r) => ({ rent: r.rent.prefix('€').suffix(' /month').decimals(0) }))
  .list((r, d) => ({ columns: [r.address, r.rent, r.garden], sort: [[r.published_at, 'desc']], displays: [d.cards({ title: r.address, amount: [r.rent], flags: [r.garden] })], default: 'cards' }))
  .filters((r, w) => [w.range(r.rent), w.toggle(r.garden)])
  .saveSearch({ resource: 'searches' })

const prompt = {
  title: 'Hear of new homes first',
  description: 'Sign in to save a search and see the homes that are new to you.',
  benefits: ['Save the filters you set', 'See the homes published since you last looked'],
  icon: 'bookmark',
}

const searchesView = view<typeof searches>('searches')
  .title((r) => r.name)
  .names({ singular: 'Search', plural: 'Searches' })
  .nav({ group: 'Browse', order: 2 })
  .help('The searches you saved, with the homes published since you last looked.')
  .fields((r) => ({ email: r.email.valueLabels({ instant: 'At once', daily: 'Daily digest', none: 'No email' }) }))
  .list((r) => ({ columns: [r.name, r.email], sort: [[r.id, 'asc']] }))
  .searchesOf((r) => ({ resource: 'homes', filter: r.filter, name: r.name, controls: [r.email], unseen: { seenAt: r.seen_at, field: 'published_at' } }))
  .signIn(prompt)

const homeRows = [
  { id: 1, address: 'Keizersgracht 12', rent: '2150.00', garden: true, published_at: '2026-10-11T09:00:00.000Z' },
  { id: 2, address: 'Oudegracht 88', rent: '1475.00', garden: true, published_at: '2026-10-09T09:00:00.000Z' },
  { id: 3, address: 'Witte de Withstraat 5', rent: '1890.00', garden: false, published_at: '2026-10-08T09:00:00.000Z' },
  { id: 4, address: 'Lange Voorhout 3', rent: '2400.00', garden: true, published_at: '2026-09-20T09:00:00.000Z' },
  { id: 5, address: 'Nobelstraat 21', rent: '1650.00', garden: false, published_at: '2026-09-15T09:00:00.000Z' },
]

// Pip saved two searches: homes with a garden, last looked at on 1 October, and one without a name, looked at since the newest home.
const searchRows = [
  { id: 1, user_id: 'pip', name: 'Gardens', filter: 'garden = true', email: 'daily', seen_at: '2026-10-01T09:00:00.000Z' },
  { id: 2, user_id: 'pip', name: null, filter: 'rent >= 1000 AND rent <= 2000', email: 'instant', seen_at: '2026-10-12T09:00:00.000Z' },
]

const readOnly: ResourcePermissions = { create: false, update: false, delete: false, conditional: [] }
const own: ResourcePermissions = { create: true, update: true, delete: true, conditional: ['update', 'delete'] }
const bottomBar = (label: string) => ({ label, items: [{ kind: 'resource' as const, resource: 'homes', label: 'Homes' }, { kind: 'resource' as const, resource: 'searches', label: 'Searches', icon: 'bookmark' }] })

// What /meta says to each: a member saves and lists their searches; a visitor sees only the homes, and the searches' prompt.
const memberApi = () =>
  fakeApi({
    resources: [homes.toModel(), searches.toModel()],
    views: [homesView.toModel(homes.toModel()), searchesView.toModel(searches.toModel())],
    rows: { homes: homeRows, searches: searchRows },
    permissions: { homes: readOnly, searches: own },
    bottomBar: bottomBar('Portal'),
  })

const signIn: SignInViewModel[] = [{ resource: 'searches', names: { singular: 'Search', plural: 'Searches' }, nav: { group: 'Browse', order: 2 }, signIn: prompt }]
const visitorApi = () =>
  fakeApi({
    resources: [homes.toModel()],
    views: [homesView.toModel(homes.toModel())],
    rows: { homes: homeRows },
    permissions: { homes: readOnly },
    bottomBar: bottomBar('Browse'),
    signIn,
  })

const Portal = ({ api, auth, at }: { api: () => ReturnType<typeof fakeApi>; auth: AuthSession; at: string }) => {
  const [client] = useState(() => api().client)
  return (
    <div className="h-screen">
      <App client={client} auth={auth} initialUrl={at} workspace="Homes" />
    </div>
  )
}

const gardens = `/homes?filter=${encodeURIComponent('garden = true')}`

export const MemberSearches: StoryObj = { name: 'Member: the searches page', render: () => <Portal api={memberApi} auth={member} at="/searches" /> }

export const MemberSearchesChecks: StoryObj = {
  ...MemberSearches,
  name: 'Member: the searches page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Each search with its filters, how many homes it finds, and the homes newest first, those published since it was
    // last looked at, 1 October, marked new
    const gardensSearch = await canvas.findByRole('region', { name: 'Gardens' })
    expect(within(gardensSearch).getByRole('list', { name: 'Filters' })).toHaveTextContent('Garden')
    expect(await within(gardensSearch).findByText('3 homes')).toBeVisible()
    const gardens = await within(gardensSearch).findByRole('list', { name: 'Homes' })
    const cards = await within(gardens).findAllByRole('link')
    expect(cards.map((card) => card.textContent)).toEqual([expect.stringContaining('Keizersgracht 12'), expect.stringContaining('Oudegracht 88'), expect.stringContaining('Lange Voorhout 3')])
    expect(cards.map((card) => within(card.closest('li')!).queryByText('New') !== null)).toEqual([true, true, false])
    expect(within(gardensSearch).getByRole('combobox', { name: 'Email' })).toHaveValue('daily')

    // A search without a name has its filters for a title, and nothing new, which it says beside its homes
    const rents = canvas.getByRole('region', { name: 'Rent: €1,000 /month – €2,000 /month' })
    expect(within(rents).queryByRole('list', { name: 'Filters' })).toBeNull()
    expect(await within(rents).findByText('No new homes since you last looked.')).toBeVisible()
    expect(await within(rents).findByRole('link', { name: /Oudegracht 88/ })).toBeVisible()
    expect(within(rents).queryByText('New')).toBeNull()

    // "View all results" opens the homes with the search's filter, where the search shows as saved
    await userEvent.click(within(gardensSearch).getByRole('link', { name: 'View all results' }))
    expect(await canvas.findByRole('heading', { name: 'Homes' })).toBeVisible()
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save search' })).toHaveAttribute('aria-pressed', 'true'))
    expect(await canvas.findByText('Lange Voorhout 3')).toBeVisible()
    expect(canvas.queryByText('Witte de Withstraat 5')).toBeNull()
  },
}

export const MemberControlChecks: StoryObj = {
  ...MemberSearches,
  name: 'Member: changing how often to hear of a search (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const gardens = within(await canvas.findByRole('region', { name: 'Gardens' }))
    await userEvent.selectOptions(gardens.getByRole('combobox', { name: 'Email' }), 'No email')
    // A toast says the change is saved, and what it is now
    const toast = await canvas.findByRole('status')
    expect(toast).toHaveTextContent('Gardens saved')
    expect(toast).toHaveTextContent('Email: No email')
    expect(gardens.getByRole('combobox', { name: 'Email' })).toHaveValue('none')
  },
}

export const MemberSave: StoryObj = { name: 'Member: saving a filtered list', render: () => <Portal api={memberApi} auth={member} at={`/homes?filter=${encodeURIComponent('rent >= 1500 AND rent <= 2500')}`} /> }

export const MemberSaveChecks: StoryObj = {
  ...MemberSave,
  name: 'Member: saving a filtered list (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const save = await canvas.findByRole('button', { name: 'Save search' })
    await waitFor(() => expect(save).toHaveAttribute('aria-pressed', 'false'))
    // Saving asks for a name, which may be left empty, and shows what the search filters on
    await userEvent.click(save)
    const dialog = await canvas.findByRole('dialog', { name: 'Save search' })
    expect(within(dialog).getByRole('list', { name: 'Filters' })).toHaveTextContent('Rent: €1,500 /month – €2,500 /month')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Mid-range')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(canvas.getByRole('link', { name: 'Searches' }))
    const saved = await canvas.findByRole('region', { name: 'Mid-range' })
    expect(within(saved).getByRole('list', { name: 'Filters' })).toHaveTextContent('Rent: €1,500 /month – €2,500 /month')
  },
}

export const MemberRenameChecks: StoryObj = {
  ...MemberSearches,
  name: 'Member: renaming a saved search (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Rename Rent: €1,000 /month – €2,000 /month' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Rename Rent: €1,000 /month – €2,000 /month' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Affordable')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const renamed = await canvas.findByRole('region', { name: 'Affordable' })
    expect(within(renamed).getByRole('list', { name: 'Filters' })).toHaveTextContent('Rent: €1,000 /month – €2,000 /month')
  },
}

export const MemberSearchesPhone: StoryObj = {
  name: 'Member: the searches page on a phone',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => <Portal api={memberApi} auth={member} at="/searches" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const gardensSearch = await canvas.findByRole('region', { name: 'Gardens' })
    // The homes sit in one row that a swipe scrolls sideways, within the screen
    const gardens = await within(gardensSearch).findByRole('list', { name: 'Homes' })
    await waitFor(() => expect(gardens.scrollWidth).toBeGreaterThan(gardens.clientWidth))
    expect(gardens.getBoundingClientRect().right).toBeLessThanOrEqual(360)
    const tabs = within(canvas.getByRole('navigation', { name: 'Tabs' }))
    expect(tabs.getByRole('link', { name: 'Searches' })).toHaveAttribute('aria-current', 'page')
  },
}

// The gardens search opened from its "View all results", its filters since changed to a rent from €1,400 to €2,200
const changedGardens = appPath({ kind: 'list', resource: 'homes', filter: 'rent >= 1400 AND rent <= 2200', savedSearch: '1' })

export const MemberUpdate: StoryObj = { name: 'Member: updating a saved search', render: () => <Portal api={memberApi} auth={member} at={changedGardens} /> }

export const MemberUpdateChecks: StoryObj = {
  ...MemberUpdate,
  name: 'Member: updating a saved search (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: 'Save as new search' })).toBeVisible()
    await userEvent.click(await canvas.findByRole('button', { name: 'Update Gardens' }))

    // The dialog says what changes: the filters, how many more homes, and which homes come and go
    const dialog = await canvas.findByRole('dialog', { name: 'Update Gardens?' })
    const changes = within(dialog).getByRole('list', { name: 'Filter changes' })
    expect(within(changes).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['RemovedGarden', 'AddedRent: €1,400 /month – €2,200 /month'])
    expect(await within(dialog).findByText('1 more home')).toBeVisible()
    const added = within(dialog).getByRole('region', { name: 'Added' })
    expect(await within(added).findByText('Witte de Withstraat 5')).toBeVisible()
    expect(within(added).getByText('Nobelstraat 21')).toBeVisible()
    const removed = within(dialog).getByRole('region', { name: 'Removed' })
    expect(await within(removed).findByText('Lange Voorhout 3')).toBeVisible()
    expect(within(removed).queryByText('Keizersgracht 12')).toBeNull()

    // Updating gives the search the list's filter, which then shows as saved
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save search' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(canvas.getByRole('link', { name: 'Searches' }))
    const gardens = await canvas.findByRole('region', { name: 'Gardens' })
    expect(within(gardens).getByRole('list', { name: 'Filters' })).toHaveTextContent('Rent: €1,400 /month – €2,200 /month')
  },
}

export const MemberSaveAsNewChecks: StoryObj = {
  ...MemberUpdate,
  name: 'Member: saving a changed search as a new one (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Save as new search' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Save as new search' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save search' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(canvas.getByRole('link', { name: 'Searches' }))
    expect(await canvas.findByRole('region', { name: 'Gardens' })).toBeVisible()
    expect(await canvas.findByRole('region', { name: 'Rent: €1,400 /month – €2,200 /month' })).toBeVisible()
  },
}

// Sixty homes with a garden, one published each day before 12 October, and a search of them last looked at on 1 October
const manyHomes = Array.from({ length: 60 }, (_, index) => ({
  id: 100 + index,
  address: `Tuinstraat ${index + 1}`,
  rent: String(1200 + index * 10),
  garden: true,
  published_at: new Date(Date.UTC(2026, 9, 11 - index, 9)).toISOString(),
}))
const manyApi = () =>
  fakeApi({
    resources: [homes.toModel(), searches.toModel()],
    views: [homesView.toModel(homes.toModel()), searchesView.toModel(searches.toModel())],
    rows: { homes: manyHomes, searches: [searchRows[0]!] },
    permissions: { homes: readOnly, searches: own },
    bottomBar: bottomBar('Portal'),
  })

export const MemberLongRow: StoryObj = { name: 'Member: a search that finds many homes', render: () => <Portal api={manyApi} auth={member} at="/searches" /> }

export const MemberLongRowChecks: StoryObj = {
  ...MemberLongRow,
  name: 'Member: a search that finds many homes (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = await canvas.findByRole('region', { name: 'Gardens' })
    expect(await within(search).findByText('60 homes')).toBeVisible()
    // Only the cards near the view are drawn, each knowing its place among all sixty
    const row = await within(search).findByRole('list', { name: 'Homes' })
    const drawn = await within(row).findAllByRole('link')
    expect(drawn.length).toBeLessThan(15)
    expect(drawn[0]!.closest('li')).toHaveAttribute('aria-setsize', '60')
    expect(within(drawn[0]!.closest('li')!).getByText('New')).toBeVisible()
    expect(within(search).queryByRole('button', { name: 'Previous homes' })).toBeNull()
    // The arrow scrolls on by a view's width, drawing the cards it comes to
    await userEvent.click(within(search).getByRole('button', { name: 'Next homes' }))
    await waitFor(() => expect(row.scrollLeft).toBeGreaterThan(500))
    await waitFor(() => expect(within(row).getByRole('link', { name: /Tuinstraat 8\b/ })).toBeVisible())
    expect(within(search).getByRole('button', { name: 'Previous homes' })).toBeVisible()
    // The homes published before 1 October are not new
    row.scrollLeft = row.scrollWidth
    const last = await within(row).findByRole('link', { name: /Tuinstraat 60\b/ })
    expect(within(last.closest('li')!).queryByText('New')).toBeNull()
  },
}

const homeApi = () =>
  fakeApi({
    resources: [homes.toModel(), searches.toModel()],
    views: [homesView.toModel(homes.toModel()), searchesView.toModel(searches.toModel())],
    pages: [home.toModel()],
    rows: { homes: homeRows, searches: searchRows },
    permissions: { homes: readOnly, searches: own },
    bottomBar: bottomBar('Portal'),
  })

export const MemberHome: StoryObj = { name: 'Member: a home page with a row per search', render: () => <Portal api={homeApi} auth={member} at="/home" /> }

export const MemberHomeChecks: StoryObj = {
  ...MemberHome,
  name: 'Member: a home page with a row per search (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const searches = within(await canvas.findByRole('region', { name: 'Your searches' }))
    // Each search is a row of what it finds, its new homes marked, under its name or filters, which open it
    const gardens = within(await searches.findByRole('region', { name: 'Gardens' }))
    expect(gardens.getByRole('link', { name: 'Gardens' })).toHaveAttribute('href', '/searches/1')
    expect(await gardens.findByText('3 homes')).toBeVisible()
    const keizersgracht = await gardens.findByRole('link', { name: /Keizersgracht 12/ })
    expect(within(keizersgracht.closest('li')!).getByText('New')).toBeVisible()
    expect(gardens.getByRole('link', { name: 'View all results' })).toHaveAttribute('href', `/homes?${new URLSearchParams({ filter: 'garden = true', saved_search: '1' })}`)
    const rents = within(searches.getByRole('region', { name: 'Rent: €1,000 /month – €2,000 /month' }))
    expect(await rents.findByText('No new homes since you last looked.')).toBeVisible()
  },
}

export const VisitorSave: StoryObj = { name: 'Visitor: saving a search asks to sign in', render: () => <Portal api={visitorApi} auth={visitor} at={gardens} /> }

export const VisitorSaveChecks: StoryObj = {
  ...VisitorSave,
  name: 'Visitor: saving a search asks to sign in (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const save = await canvas.findByRole('button', { name: 'Save search' })
    expect(save).not.toHaveAttribute('aria-pressed')
    await userEvent.click(save)
    const dialog = await canvas.findByRole('dialog', { name: 'Hear of new homes first' })
    expect(within(dialog).getByText('Save the filters you set')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
  },
}
