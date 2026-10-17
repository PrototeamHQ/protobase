import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
import { signInPath } from '@protobase/schema'
import { themeStorageKey } from '../theme/theme-preference'
import { App } from './app'
import { fakeClient } from './testing/fake-client'

const meta = { title: 'Visitor', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A server with an anonymous role and nobody signed in: the status says visitors may browse, and there is no session.
const signedIn = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
const visitorSession: AuthSession = {
  ...signedIn,
  status: async () => ({ ...(await signedIn.status()), anonymous: true }),
  session: async () => undefined,
}

export const Browsing: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: { create: false, update: false, delete: false, conditional: [] } })} auth={visitorSession} initialUrl="/orders" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    expect(canvas.queryByRole('button', { name: 'Profile menu' })).toBeNull()
    expect(canvas.queryByRole('link', { name: /New order/ })).toBeNull()
    // "Sign in" is a link to the sign-in route, which the browser shows and can open in a new tab
    const signIn = canvas.getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', signInPath({ next: '/orders' }))
    await userEvent.click(signIn)
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Continue without signing in' }))
    expect(await canvas.findByText('SO-1')).toBeVisible()
  },
}

// The sign-in route and its steps are pages of their own in the tab's history: Back from them returns to the step
// before, then to browsing the page "Sign in" was pressed on, and Forward opens the sign-in route again.
const resettingSession: AuthSession = { ...visitorSession, status: async () => ({ ...(await visitorSession.status()), passwordReset: true }) }
const address = () => `${window.location.pathname}${window.location.search}`

export const BackFromSignIn: StoryObj = {
  tags: ['play'],
  render: () => {
    window.history.replaceState({ protobaseIndex: 0 }, '', '/orders')
    return (
      <div className="h-screen">
        <App client={fakeClient({ permissions: { create: false, update: false, delete: false, conditional: [] } })} auth={resettingSession} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    await userEvent.click(canvas.getByRole('link', { name: 'Sign in' }))
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    expect(address()).toBe('/-/sign-in?next=%2Forders')
    await userEvent.click(canvas.getByRole('link', { name: 'Forgot password?' }))
    expect(await canvas.findByRole('heading', { name: 'Reset your password' })).toBeVisible()
    expect(address()).toBe('/-/sign-in?step=forgot-password&next=%2Forders')

    window.history.back()
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    window.history.back()
    expect(await canvas.findByText('SO-1')).toBeVisible()
    expect(canvas.queryByRole('heading', { name: 'Sign in to Protobase' })).toBeNull()
    await waitFor(() => expect(address()).toBe('/orders'))

    window.history.forward()
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
  },
}

// A visitor picks a theme above "Sign in", as a signed-in user does in the profile menu, and the sign-in page keeps it.
export const PickingTheme: StoryObj = {
  name: 'Picking a theme',
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: { create: false, update: false, delete: false, conditional: [] } })} auth={visitorSession} initialUrl="/orders" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    const group = within(canvas.getByRole('group', { name: 'Theme' }))
    await userEvent.click(group.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(15, 15, 17)')

    await userEvent.click(canvas.getByRole('link', { name: 'Sign in' }))
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    expect(document.documentElement.dataset.theme).toBe('dark')
  },
}

// A visitor the view grants the orders' website gets the action rail's button to it, named after its host, opening it
// in a new tab with neither the opener nor the referrer; an order without a web address has no button.
const readOnly = { create: false, update: false, delete: false, conditional: [] }
const websiteLink = { name: 'website', label: 'View on {host}', icon: 'external-link', bulk: false, run: { kind: 'link' as const, href: '{website}' } }
const websites = { 'SO-1': 'https://www.shop.example/orders/SO-1?ref=a&b=1', 'SO-2': null, 'SO-3': 'javascript:alert(1)' }

export const LinkToRecordUrl: StoryObj = {
  name: "Link to a record's URL",
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: readOnly, actions: [websiteLink], websites })} auth={visitorSession} initialUrl="/orders/o1" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const original = window.open
    const open = fn()
    window.open = open
    await userEvent.click(await canvas.findByRole('button', { name: 'View on shop.example' }))
    window.open = original
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('https://www.shop.example/orders/SO-1?ref=a&b=1', '_blank', 'noopener,noreferrer')
  },
}

export const NoRecordUrl: StoryObj = {
  name: "No record's URL",
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: readOnly, actions: [websiteLink], websites })} auth={visitorSession} initialUrl="/orders/o3" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'SO-3' })
    expect(canvas.queryByRole('button', { name: /View on/ })).toBeNull()
    expect(canvas.queryByRole('heading', { name: 'Actions' })).toBeNull()
  },
}
