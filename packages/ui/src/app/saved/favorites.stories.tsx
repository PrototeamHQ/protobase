import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type Client, type ResourcePermissions } from '@protobase/client'
import { f, resource, signInPath, view, type SignInViewModel } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { home } from './story-home-page'

const viewports = { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'List page/Favorites', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const member = createStaticSession('story-token', { id: 'pip', email: 'pip@homes.example', name: 'Pip', role: 'member' })
// A server with an anonymous role and nobody signed in: the status says visitors may browse, and there is no session.
const visitor: AuthSession = { ...member, status: async () => ({ ...(await member.status()), anonymous: true }), session: async () => undefined }

const homes = resource('homes')
  .table('homes')
  .fields({ id: f.integer().readOnly().filterable(), address: f.text().filterable().sortable(), rent: f.decimal({ precision: 10, scale: 2 }).filterable(), photo: f.file().accept(['image/*']).optional() })
  .primaryKey((r) => r.id)
  .search((r) => [r.address])

const favorites = resource('favorites')
  .table('favorites')
  .fields({ id: f.integer().readOnly(), user_id: f.text().readOnly(), home_id: f.relation('homes').filterable() })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)

const homesView = view<typeof homes>('homes')
  .title((r) => r.address)
  .names({ singular: 'Home', plural: 'Homes' })
  .nav({ group: 'Browse', order: 1 })
  .fields((r) => ({ rent: r.rent.prefix('€').suffix(' /month').decimals(0) }))
  .list((r, d) => ({ columns: [r.address, r.rent], displays: [d.cards({ image: r.photo, title: r.address, amount: [r.rent] }, { favorite: { resource: 'favorites', field: 'home_id', label: 'Save to favorites' } })], default: 'cards' }))

const prompt = {
  title: 'Keep the homes you like',
  description: 'Sign in to save homes to your favorites and find them again on any device.',
  benefits: ['Save a home with the heart on its card', 'See all your saved homes on one page'],
  icon: 'heart',
}

const favoritesView = view<typeof favorites>('favorites')
  .title((r) => r.home_id)
  .names({ singular: 'Favorite', plural: 'Favorites' })
  .nav({ group: 'Browse', order: 2 })
  .help('The homes you saved.')
  .list((r) => ({ columns: [r.home_id] }))
  .listOf((r) => r.home_id)
  .signIn(prompt)

// A photo stand-in: a sky and a ground in its own colour, drawn as a PNG.
const picture = (hue: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 120
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 60% 80%)`
  context.fillRect(0, 0, 160, 120)
  context.fillStyle = `hsl(${hue} 45% 45%)`
  context.fillRect(0, 80, 160, 40)
  return canvas.toDataURL('image/png')
}

const photo = (name: string, hue: number) => ({ uri: `public:homes/${name}.png`, name: `${name}.png`, type: 'image/png', size: 2048, url: picture(hue) })

const homeRows = [
  { id: 1, address: 'Keizersgracht 12', rent: '2150.00', photo: photo('keizersgracht', 200) },
  { id: 2, address: 'Oudegracht 88', rent: '1475.00', photo: photo('oudegracht', 30) },
  { id: 3, address: 'Witte de Withstraat 5', rent: '1890.00', photo: photo('witte', 120) },
]

const readOnly: ResourcePermissions = { create: false, update: false, delete: false, conditional: [] }
const own: ResourcePermissions = { create: true, update: false, delete: false, conditional: ['delete'] }
const bottomBar = (label: string) => ({ label, items: [{ kind: 'resource' as const, resource: 'homes', label: 'Homes' }, { kind: 'resource' as const, resource: 'favorites', label: 'Favorites', icon: 'heart' }] })

// What /meta says to each: a member sees and saves favorites; a visitor sees only the homes, and the favorites prompt.
const memberApi = () =>
  fakeApi({
    resources: [homes.toModel(), favorites.toModel()],
    views: [homesView.toModel(homes.toModel()), favoritesView.toModel(favorites.toModel())],
    rows: { homes: homeRows, favorites: [{ id: 1, user_id: 'pip', home_id: 2 }] },
    permissions: { homes: readOnly, favorites: own },
    bottomBar: bottomBar('Portal'),
  })

const signIn: SignInViewModel[] = [{ resource: 'favorites', names: { singular: 'Favorite', plural: 'Favorites' }, nav: { group: 'Browse', order: 2 }, signIn: prompt }]
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

const cardOf = async (canvasElement: HTMLElement, address: string) => (await within(canvasElement).findByText(address)).closest('li')!

export const MemberCards: StoryObj = { name: 'Member: hearts on the cards', render: () => <Portal api={memberApi} auth={member} at="/homes" /> }

export const MemberCardsChecks: StoryObj = {
  ...MemberCards,
  name: 'Member: hearts on the cards (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const saved = within(await cardOf(canvasElement, 'Oudegracht 88')).getByRole('button', { name: 'Save to favorites' })
    await waitFor(() => expect(saved).toHaveAttribute('aria-pressed', 'true'))
    const other = within(await cardOf(canvasElement, 'Keizersgracht 12')).getByRole('button', { name: 'Save to favorites' })
    expect(other).toHaveAttribute('aria-pressed', 'false')

    // A press saves the home and stays on the list; the favorites page lists the saved homes as cards
    await userEvent.click(other)
    await waitFor(() => expect(other).toHaveAttribute('aria-pressed', 'true'))
    expect(canvas.getByRole('heading', { name: 'Homes' })).toBeVisible()
    await userEvent.click(canvas.getByRole('link', { name: 'Favorites' }))
    expect(await canvas.findByRole('heading', { name: 'Favorites' })).toBeVisible()
    await waitFor(() => expect(within(canvas.getByRole('list', { name: 'Homes' })).getAllByRole('listitem')).toHaveLength(2))
    expect(canvas.queryByText('Witte de Withstraat 5')).toBeNull()

    // Taking one off there takes its card away
    await userEvent.click(within(await cardOf(canvasElement, 'Oudegracht 88')).getByRole('button', { name: 'Save to favorites' }))
    await waitFor(() => expect(canvas.queryByText('Oudegracht 88')).toBeNull())
    expect(canvas.getByText('Keizersgracht 12')).toBeVisible()
  },
}

export const MemberFavoritesPhone: StoryObj = {
  name: 'Member: favorites on a phone',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => <Portal api={memberApi} auth={member} at="/favorites" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Oudegracht 88')).toBeVisible()
    expect(canvas.queryByText('Keizersgracht 12')).toBeNull()
    const tabs = within(canvas.getByRole('navigation', { name: 'Tabs' }))
    expect(tabs.getByRole('link', { name: 'Favorites' })).toHaveAttribute('aria-current', 'page')
  },
}

const homeApi = () =>
  fakeApi({
    resources: [homes.toModel(), favorites.toModel()],
    views: [homesView.toModel(homes.toModel()), favoritesView.toModel(favorites.toModel())],
    pages: [home.toModel()],
    rows: { homes: homeRows, favorites: [{ id: 1, user_id: 'pip', home_id: 2 }, { id: 2, user_id: 'pip', home_id: 3 }] },
    permissions: { homes: readOnly, favorites: own },
    bottomBar: bottomBar('Portal'),
  })

export const MemberHome: StoryObj = { name: 'Member: favorites in a row on a page', render: () => <Portal api={homeApi} auth={member} at="/home" /> }

export const MemberHomeChecks: StoryObj = {
  ...MemberHome,
  name: 'Member: favorites in a row on a page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const row = within(await within(canvasElement).findByRole('region', { name: 'Your favorites' }))
    // The homes among the favorites, as the homes' cards, and "View all" to the favorites
    expect(await row.findByText('2 homes')).toBeVisible()
    expect(await row.findByRole('link', { name: /Oudegracht 88/ })).toHaveAttribute('href', '/homes/2')
    expect(row.getByRole('link', { name: /Witte de Withstraat 5/ })).toBeVisible()
    expect(row.queryByText('Keizersgracht 12')).toBeNull()
    expect(row.getByRole('link', { name: /^View all/ })).toHaveAttribute('href', '/favorites')
  },
}

export const VisitorCards: StoryObj = { name: 'Visitor: a heart asks to sign in', render: () => <Portal api={visitorApi} auth={visitor} at="/homes" /> }

export const VisitorCardsChecks: StoryObj = {
  ...VisitorCards,
  name: 'Visitor: a heart asks to sign in (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heart = within(await cardOf(canvasElement, 'Keizersgracht 12')).getByRole('button', { name: 'Save to favorites' })
    expect(heart).not.toHaveAttribute('aria-pressed')
    await userEvent.click(heart)
    const dialog = await canvas.findByRole('dialog', { name: 'Keep the homes you like' })
    expect(within(dialog).getByText('Save a home with the heart on its card')).toBeVisible()
    // The press did not open the home, and "Not now" goes back to it
    expect(canvas.getByRole('heading', { name: 'Homes' })).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())

    // The favorites page tells the visitor the same, and "Sign in" opens the sign-in page
    await userEvent.click(canvas.getByRole('link', { name: 'Favorites' }))
    const page = await canvas.findByRole('region', { name: 'Keep the homes you like' })
    expect(within(page).getByText('See all your saved homes on one page')).toBeVisible()
    const signIn = within(page).getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', signInPath({ next: '/favorites' }))
    await userEvent.click(signIn)
    expect(await canvas.findByRole('heading', { name: /^Sign in/ })).toBeVisible()
  },
}

// A visitor who signs in: the API answers as the anonymous role until then, and as the member after.
const SigningIn = ({ at }: { at: string }) => {
  const [{ client, auth }] = useState(() => {
    let signedIn = false
    const auth: AuthSession = {
      ...visitor,
      session: async () => (signedIn ? member.session() : undefined),
      signIn: async (email, password) => {
        signedIn = true
        return member.signIn(email, password)
      },
    }
    const [visitorClient, memberClient] = [visitorApi().client, memberApi().client]
    const client = new Proxy({} as Client, { get: (_, name) => Reflect.get(signedIn ? memberClient : visitorClient, name) })
    return { client, auth }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={auth} initialUrl={at} workspace="Homes" />
    </div>
  )
}

export const VisitorSignsIn: StoryObj = {
  name: 'Visitor: signing in from the favorites page comes back to it',
  tags: ['play'],
  render: () => <SigningIn at="/homes" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('link', { name: 'Favorites' }))
    const page = await canvas.findByRole('region', { name: 'Keep the homes you like' })
    await userEvent.click(within(page).getByRole('link', { name: 'Sign in' }))
    expect(await canvas.findByRole('heading', { name: /^Sign in/ })).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Email'), 'pip@homes.example')
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))

    // Signed in as the member, on the favorites page: their saved home instead of the prompt
    expect(await canvas.findByRole('button', { name: 'Profile menu' })).toBeVisible()
    expect(await canvas.findByRole('heading', { name: 'Favorites' })).toBeVisible()
    expect(await canvas.findByText('Oudegracht 88')).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Keep the homes you like' })).toBeNull()
  },
}

export const VisitorPhone: StoryObj = {
  name: 'Visitor: a heart on a phone opens a sheet',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => <Portal api={visitorApi} auth={visitor} at="/homes" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = within(await canvas.findByRole('navigation', { name: 'Tabs' }))
    expect(tabs.getByRole('link', { name: 'Favorites' })).toBeVisible()
    await userEvent.click(within(await cardOf(canvasElement, 'Keizersgracht 12')).getByRole('button', { name: 'Save to favorites' }))
    const sheet = await canvas.findByRole('dialog', { name: 'Keep the homes you like' })
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeVisible()
    expect(within(sheet).getByRole('link', { name: 'Sign in' })).toBeVisible()
  },
}

export const VisitorFavoritesPhone: StoryObj = {
  name: 'Visitor: the favorites page on a phone',
  globals: { viewport: { value: 'phone360' } },
  render: () => <Portal api={visitorApi} auth={visitor} at="/favorites" />,
}
