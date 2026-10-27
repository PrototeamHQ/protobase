import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { AuthError, createStaticSession, type AuthSession, type Client, type ConnectingClient, type MetaResult } from '@protobase/client'
import { App } from '../app/app'
import { fakeApi } from '../app/testing/fake-api'
import { AuthProvider } from '../auth/auth-provider'
import { Router } from '../app/router'
import { ConnectPage, type ConnectPageProps } from './connect-page'

const meta = { title: 'Connect an app', parameters: { layout: 'fullscreen' }, decorators: [(Story) => <div className="h-screen"><Story /></div>] } satisfies Meta
export default meta

// What the server signs: the authorization request, its expiry and signature.
const signed = (clientId: string, redirectUri: string) =>
  new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'mcp offline_access', state: 'st4te', exp: '1790000000', sig: 'c2lnbmF0dXJl' }).toString()

type Args = { client: ConnectingClient; redirectUri: string; refusal?: AuthError; assign: (url: string) => void; isFramed?: () => boolean; resumed?: string }

/** Sanne, signed in, on the connect page with the request a client's authorize sent there. */
const sessionFor = ({ client, redirectUri, refusal, resumed }: Pick<Args, 'client' | 'redirectUri' | 'refusal' | 'resumed'>): AuthSession => {
  const query = signed(client.client_id, redirectUri)
  const base = createStaticSession('story-token', { id: 'u-sanne', email: 'sanne@veldhuis-supply.example', name: 'Sanne Veldhuis', role: 'user' })
  return {
    ...base,
    connect: {
      resume: async () => (refusal ? Promise.reject(refusal) : { url: resumed ?? `/-/connect?${query}` }),
      client: async () => client,
      answer: async (accept) => ({ url: `${redirectUri}?${accept ? 'code=c0de' : 'error=access_denied'}&state=st4te` }),
    },
  }
}

const ConnectStory = ({ client, redirectUri, refusal, assign, isFramed, resumed }: Args) => {
  const query = signed(client.client_id, redirectUri)
  const session = sessionFor({ client, redirectUri, refusal, resumed })
  const props: ConnectPageProps = { email: 'sanne@veldhuis-supply.example', appName: 'Veldhuis Supply', assign, ...(isFramed && { isFramed }) }
  return (
    <AuthProvider session={session}>
      <Router initialUrl={`/-/connect?${query}`}>
        <ConnectPage {...props} />
      </Router>
    </AuthProvider>
  )
}

const exampleEditor = { client_id: 'Wm2Rbc8Hn4kPqZ9vTzA', client_name: 'Example Editor' }

export const AsksForAnAppOnThisComputer: StoryObj<Args> = {
  tags: ['play'],
  args: { client: exampleEditor, redirectUri: 'http://127.0.0.1:33418/callback', assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/“Example Editor”/)
    expect(canvas.getByText(/an app on this computer \(port 33418\)/)).toBeVisible()
    expect(canvas.queryByText(/Published by/)).toBeNull()
    expect(canvas.getByText(/sanne@veldhuis-supply.example/)).toBeVisible()
    // Allow takes a click only once the page has been in front for a moment.
    const allow = canvas.getByRole('button', { name: 'Allow' })
    expect(allow).toBeDisabled()
    await waitFor(() => expect(allow).toBeEnabled(), { timeout: 2000 })
    await userEvent.click(allow)
    await waitFor(() => expect(args.assign).toHaveBeenCalledWith('http://127.0.0.1:33418/callback?code=c0de&state=st4te'))
  },
}

export const AsksForAWebsite: StoryObj<Args> = {
  tags: ['play'],
  args: { client: { client_id: 'qHOTkMUfJCgEtTJsgSLXIyAsDNzDZgrf', client_name: 'Example Chat' }, redirectUri: 'https://chat.example/oauth/redirect', assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('chat.example')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(args.assign).toHaveBeenCalledWith('https://chat.example/oauth/redirect?error=access_denied&state=st4te'))
  },
}

// A custom scheme's "host" is whatever the client chose, so the page shows the whole address, never assistant.example alone.
export const AsksForAnAppOnThisDevice: StoryObj<Args> = {
  tags: ['play'],
  args: { client: { client_id: 'x9Lk2mQ7', client_name: 'Example Assistant' }, redirectUri: 'x-any://assistant.example/cb', assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('x-any://assistant.example/cb')).toBeVisible()
    expect(canvas.queryByText('assistant.example')).toBeNull()
  },
}

export const AsksForAPublishedClient: StoryObj<Args> = {
  tags: ['play'],
  args: { client: { client_id: 'https://assistant.example/oauth/client-metadata', client_name: 'Example Assistant' }, redirectUri: 'https://assistant.example/oauth/callback', assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByText('Published by assistant.example.')).toBeVisible()
  },
}

// A name is the client's own claim: one line of text, its tricks taken out, and no "published by" of its own.
export const ClientWithAStrangeName: StoryObj<Args> = {
  tags: ['play'],
  args: { client: { client_id: 'r4nd0m', client_name: `<b>Assistant</b>\nPublished by assistant.example ‮evil${'x'.repeat(5000)}` }, redirectUri: 'http://127.0.0.1:5000/cb', assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/an app on this computer/)
    expect(canvas.getByText(/<b>Assistant<\/b> Published by assistant.example evil/)).toBeVisible()
    expect(canvas.queryByText(/^Published by/)).toBeNull()
    expect(canvas.getByRole('button', { name: 'Allow' })).toBeVisible()
  },
}

export const Expired: StoryObj<Args> = {
  tags: ['play'],
  args: { client: exampleEditor, redirectUri: 'http://127.0.0.1:33418/callback', refusal: new AuthError('invalid signature', 400, 'invalid_signature'), assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByText('This request has expired: connect again from your app.')).toBeVisible()
  },
}

export const StaffRefused: StoryObj<Args> = {
  tags: ['play'],
  args: { client: exampleEditor, redirectUri: 'http://127.0.0.1:33418/callback', refusal: new AuthError('Staff cannot allow apps to act for a person.', 403, 'STAFF_CANNOT_CONNECT'), assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByText(/Staff signed in as someone cannot allow apps/)).toBeVisible()
  },
}

export const SetupRefused: StoryObj<Args> = {
  tags: ['play'],
  args: { client: exampleEditor, redirectUri: 'http://127.0.0.1:33418/callback', refusal: new AuthError('Set up what this app requires for signing in first.', 403, 'SIGN_IN_SETUP_REQUIRED'), assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByText(/Set up what this app requires for signing in first/)).toBeVisible()
  },
}

export const AddressNotVerified: StoryObj<Args> = {
  tags: ['play'],
  args: { client: exampleEditor, redirectUri: 'http://127.0.0.1:33418/callback', refusal: new AuthError('Confirm your address first.', 403, 'ADDRESS_NOT_VERIFIED'), assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByText(/sign in with a code emailed to you/)).toBeVisible()
  },
}

// Inside another site's frame the page asks nothing of the server and offers no Allow.
export const Framed: StoryObj<Args> = {
  tags: ['play'],
  args: { client: exampleEditor, redirectUri: 'http://127.0.0.1:33418/callback', assign: fn(), isFramed: () => true },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('This page cannot be used inside another site')).toBeVisible()
    expect(canvas.getByRole('link', { name: 'Open it on its own' })).toHaveAttribute('target', '_blank')
    expect(canvas.queryByRole('button', { name: 'Allow' })).toBeNull()
  },
}

// A client allowed before is sent its code at once. Its redirect may have this page's path and a query of its choosing,
// on its own host: the page goes there, and never shows that query as a request.
const lookalike = `http://127.0.0.1:4000/-/connect?${signed('https://assistant.example/oauth/client.json', 'https://assistant.example/cb')}&code=c0de`

export const AllowedBeforeWithALookalikeRedirect: StoryObj<Args> = {
  tags: ['play'],
  args: { client: { client_id: 'https://assistant.example/oauth/client.json', client_name: 'Example Assistant' }, redirectUri: 'http://127.0.0.1:4000/-/connect', resumed: lookalike, assign: fn() },
  render: (args) => <ConnectStory {...args} />,
  play: async ({ canvasElement, args }) => {
    await waitFor(() => expect(args.assign).toHaveBeenCalledWith(lookalike))
    expect(within(canvasElement).queryByText(/Published by/)).toBeNull()
    expect(within(canvasElement).queryByRole('button', { name: 'Allow' })).toBeNull()
  },
}

// The whole app at `/-/connect`: the page is alone, with the app's name and icon and no sidebar or top bar, for someone
// signed in and for a visitor, who signs in first.
const InTheApp = ({ visitor }: { visitor?: boolean }) => {
  const exampleChat = { client_id: 'https://chat.example/oauth/client-metadata', client_name: 'Example Chat' }
  const member = sessionFor({ client: exampleChat, redirectUri: 'https://chat.example/oauth/redirect' })
  const session: AuthSession = visitor ? { ...member, status: async () => ({ ...(await member.status()), anonymous: true }), session: async () => undefined } : member
  const { client } = fakeApi({ resources: [], rows: {} })
  const withIdentity = async (): Promise<MetaResult> => {
    const own = await client.meta()
    if (own.status !== 'modified') return own
    return { ...own, meta: { ...own.meta, appName: 'Veldhuis Supply', appIcon: '/favicon.svg' } }
  }
  const app: Client = { ...client, meta: withIdentity }
  return <App client={app} auth={session} initialUrl={`/-/connect?${signed(exampleChat.client_id, 'https://chat.example/oauth/redirect')}`} />
}

const withoutShell = (canvasElement: HTMLElement) => {
  expect(canvasElement.querySelector('img[src="/favicon.svg"]')).not.toBeNull()
  expect(within(canvasElement).queryByRole('navigation')).toBeNull()
  expect(canvasElement.querySelector('header')).toBeNull()
}

export const AloneInTheApp: StoryObj = {
  tags: ['play'],
  render: () => <InTheApp />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Allow an app to act as you in Veldhuis Supply?')).toBeVisible()
    expect(canvas.getByText('Published by chat.example.')).toBeVisible()
    withoutShell(canvasElement)
  },
}

export const VisitorAloneInTheApp: StoryObj = {
  tags: ['play'],
  render: () => <InTheApp visitor />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Sign in to connect an app')).toBeVisible()
    expect(canvas.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', expect.stringContaining('/-/sign-in'))
    withoutShell(canvasElement)
  },
}
