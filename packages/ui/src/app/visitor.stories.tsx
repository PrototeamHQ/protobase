import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
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
    expect(canvas.queryByRole('button', { name: /New order/ })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
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
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    expect(address()).toBe('/-/sign-in?next=%2Forders')
    await userEvent.click(canvas.getByRole('button', { name: 'Forgot password?' }))
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
