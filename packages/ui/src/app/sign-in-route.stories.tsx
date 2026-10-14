import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
import { App } from './app'
import { fakeClient } from './testing/fake-client'

const meta = { title: 'Sign-in route', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A server without an anonymous role and nobody signed in yet: signing in with any password works.
const signingIn = (): AuthSession => {
  const base = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
  let signedIn = false
  return {
    ...base,
    session: async () => (signedIn ? base.session() : undefined),
    signIn: async (email, password) => {
      signedIn = true
      return base.signIn(email, password)
    },
  }
}
const address = () => `${window.location.pathname}${window.location.search}`

// Someone signed out who opens a page of the app goes to the sign-in route in place of it, and comes back to it signed in.
export const SignedOutComesBack: StoryObj = {
  name: 'Signed out: a page opens the sign-in route, and signing in comes back to it',
  tags: ['play'],
  render: () => {
    window.history.replaceState({ protobaseIndex: 0 }, '', '/orders?filter=status%3Dopen')
    return (
      <div className="h-screen">
        <App client={fakeClient({ permissions: { create: true, update: true, delete: true, conditional: [] } })} auth={signingIn()} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    expect(address()).toBe('/-/sign-in?next=%2Forders%3Ffilter%3Dstatus%253Dopen')
    expect(canvas.queryByRole('button', { name: 'Continue without signing in' })).toBeNull()
    await userEvent.type(canvas.getByLabelText('Email'), 'story@example.test')
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse battery')
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
    expect(await canvas.findByRole('button', { name: 'Profile menu' })).toBeVisible()
    await waitFor(() => expect(address()).toBe('/orders?filter=status%3Dopen'))
  },
}
