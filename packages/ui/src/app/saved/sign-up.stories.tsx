import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession, type AuthUser, type Client, type ResourcePermissions } from '@protobase/client'
import { f, resource, view, type SignInViewModel } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Open sign-up', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A portal with open sign-up: visitors browse the homes, and anyone makes an account to keep favorites.
const homes = resource('homes')
  .table('homes')
  .fields({ id: f.integer().readOnly().filterable(), address: f.text().filterable().sortable() })
  .primaryKey((r) => r.id)

const favorites = resource('favorites')
  .table('favorites')
  .fields({ id: f.integer().readOnly(), user_id: f.text().readOnly(), home_id: f.relation('homes').filterable() })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)

const homesView = view<typeof homes>('homes')
  .title((r) => r.address)
  .names({ singular: 'Home', plural: 'Homes' })
  .nav({ group: 'Browse', order: 1 })
  .list((r, d) => ({ columns: [r.address], displays: [d.cards({ title: r.address }, { favorite: { resource: 'favorites', field: 'home_id', label: 'Save to favorites' } })], default: 'cards' }))

const prompt = {
  title: 'Keep the homes you like',
  description: 'Sign in to save homes to your favorites and find them again on any device.',
  benefits: ['Save a home with the heart on its card'],
  icon: 'heart',
}

const favoritesView = view<typeof favorites>('favorites')
  .title((r) => r.home_id)
  .names({ singular: 'Favorite', plural: 'Favorites' })
  .nav({ group: 'Yours', order: 1 })
  .help('The homes you saved.')
  .list((r) => ({ columns: [r.home_id] }))
  .listOf((r) => r.home_id)
  .signIn(prompt)

const homeRows = [
  { id: 1, address: 'Keizersgracht 12' },
  { id: 2, address: 'Oudegracht 88' },
]

const readOnly: ResourcePermissions = { create: false, update: false, delete: false, conditional: [] }
const own: ResourcePermissions = { create: true, update: false, delete: false, conditional: ['delete'] }
const signIn: SignInViewModel[] = [{ resource: 'favorites', names: { singular: 'Favorite', plural: 'Favorites' }, nav: { group: 'Yours', order: 1 }, signIn: prompt }]

// What /meta says before and after: a visitor sees the homes and the favorites prompt, the new member their favorites.
const visitorApi = () => fakeApi({ resources: [homes.toModel()], views: [homesView.toModel(homes.toModel())], rows: { homes: homeRows }, permissions: { homes: readOnly }, signIn })
const memberApi = () =>
  fakeApi({
    resources: [homes.toModel(), favorites.toModel()],
    views: [homesView.toModel(homes.toModel()), favoritesView.toModel(favorites.toModel())],
    rows: { homes: homeRows, favorites: [] },
    permissions: { homes: readOnly, favorites: own },
  })

const code = '246810'

// A server with open sign-up and an anonymous role: nobody is signed in until the emailed code makes an account.
const openSignUp = () => {
  const base = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story', role: 'member' })
  const mailed = new Set<string>()
  let user: AuthUser | undefined
  const session: AuthSession = {
    ...base,
    status: async () => ({ ...(await base.status()), signInMethods: ['password', 'emailCode'], anonymous: true, signUp: true }),
    session: async () => user,
    sendSignUpCode: async (email) => void mailed.add(email),
    signUp: async (input) => {
      if (!mailed.has(input.email) || input.code !== code) throw new AuthError('The code is not right, or has expired. Ask for a new one.', 400, 'SIGN_UP_CODE_INVALID')
      user = { id: 'new-member', email: input.email, name: input.name, role: 'member' }
      return user
    },
  }
  return { session, signedUp: () => user !== undefined }
}

const Portal = () => {
  const [{ client, session }] = useState(() => {
    const auth = openSignUp()
    const visitor = visitorApi().client
    const member = memberApi().client
    // The API answers as the anonymous role until the account exists, and as the new member after.
    const client = new Proxy({} as Client, { get: (_, name) => Reflect.get(auth.signedUp() ? member : visitor, name) })
    return { client, session: auth.session }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/homes" workspace="Homes" />
    </div>
  )
}

export const FromAHeart: StoryObj = {
  name: 'Visitor: a heart, then an account of their own',
  tags: ['play'],
  render: () => <Portal />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = (await canvas.findByText('Keizersgracht 12')).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Save to favorites' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Keep the homes you like' })
    expect(within(dialog).getByRole('button', { name: 'Sign in' })).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create an account' }))

    // The address first, then the code mailed to it with a name and a password
    expect(await canvas.findByRole('heading', { name: 'Create an account' })).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Email'), 'nia@homes.example')
    await userEvent.click(canvas.getByRole('button', { name: 'Email me a code' }))
    expect(await canvas.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(canvas.getByText('nia@homes.example')).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Code'), '000000')
    await userEvent.type(canvas.getByLabelText('Your name'), 'Nia')
    await userEvent.type(canvas.getByLabelText('Password (optional)'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }))
    expect(await canvas.findByRole('alert')).toHaveTextContent('The code is not right, or has expired.')
    await userEvent.clear(canvas.getByLabelText('Code'))
    await userEvent.type(canvas.getByLabelText('Code'), code)
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }))

    // Signed in as the new member: their own favorites, empty, instead of the prompt
    expect(await canvas.findByRole('button', { name: 'Profile menu' })).toBeVisible()
    await userEvent.click(canvas.getByRole('link', { name: 'Favorites' }))
    expect(await canvas.findByRole('heading', { name: 'Favorites' })).toBeVisible()
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Keep the homes you like' })).toBeNull())
  },
}

export const FromTheSignInPage: StoryObj = {
  name: 'Visitor: "Create an account" on the sign-in page, and back',
  tags: ['play'],
  render: () => <Portal />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Keizersgracht 12')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(await canvas.findByRole('heading', { name: /^Sign in/ })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Create an account' }))
    expect(await canvas.findByRole('heading', { name: 'Create an account' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(await canvas.findByRole('heading', { name: /^Sign in/ })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Create an account' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue without an account' }))
    expect(await canvas.findByText('Keizersgracht 12')).toBeVisible()
  },
}
