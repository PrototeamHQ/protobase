import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type Client, type PluginRef } from '@protobase/client'
import { App } from '../app'
import { definePlugin, type BeforeSignInProps } from '../app/pages/project-ui'
import { fakeClient } from '../app/testing/fake-client'
import type { PluginLoader } from './load-plugin'

const meta = { title: 'Plugins/Before sign-in', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A server without an anonymous role and nobody signed in yet; trading a guest code signs the browser in, as an
// endpoint that sets the session cookie would.
const guestServer = (plugins: PluginRef[], { signedIn: already = false } = {}) => {
  const base = createStaticSession('story-token', { id: 'guest', email: 'guest@example.test', name: 'Guest', role: 'user' })
  let signedIn = already
  const session: AuthSession = {
    ...base,
    status: async () => ({ ...(await base.status()), ...(plugins.length > 0 && { plugins }) }),
    session: async () => (signedIn ? base.session() : undefined),
  }
  const exchange = async (code: string) => {
    signedIn = code === 'guest-code'
  }
  return { session, exchange }
}

// The guest's plugin: with `?access=<code>` it trades the code for a session and enters the app; without, the
// sign-in page shows as it would without the plugin.
const guestPlugin = (exchange: (code: string) => Promise<void>) => {
  const GuestAccess = ({ children, params, removeParams, signedIn }: BeforeSignInProps) => {
    const [code] = useState(() => params.get('access'))
    const [failed, setFailed] = useState(false)
    const started = useRef(false)
    useEffect(() => {
      if (!code || started.current) return
      started.current = true
      removeParams(['access'])
      void exchange(code)
        .then(signedIn)
        .then((entered) => setFailed(!entered))
    }, [code, removeParams, signedIn])
    if (code && !failed) return <p role="status">Signing you in as a guest…</p>
    return children
  }
  const CloudBadge = () => <span>Cloud</span>
  return { default: definePlugin({ name: 'cloud', beforeSignIn: GuestAccess, shell: { actions: CloudBadge } }) }
}

const cloud = 'https://cloud.example.com/cloud/plugin.json'
const plugins = [{ url: cloud }]

// What the app read, in order: each plugin.json and module, so a check can tell a plugin loaded once.
let loaded: string[] = []

const loaderFor = (module: Record<string, unknown>): PluginLoader => ({
  readJson: async (url) => {
    loaded.push(url)
    return url === cloud ? { json: { name: 'cloud', api: 1, protobase: '>=0.0.1', entry: 'index.js' } } : { status: 404 }
  },
  addStylesheet: () => undefined,
  importModule: async (url) => {
    loaded.push(url)
    return module
  },
})

// The orders app, with `/meta` naming the cloud plugin to everyone, as it names a plugin that loads before sign-in.
const ordersWith = (refs: PluginRef[]): Client => {
  const client = fakeClient({ permissions: { create: true, update: true, delete: true, conditional: [] } })
  return {
    ...client,
    meta: async (...args) => {
      const read = await client.meta(...args)
      return read.status === 'modified' ? { ...read, meta: { ...read.meta, plugins: refs } } : read
    },
  }
}

const Guest = ({ refs, address, signedIn = false }: { refs: PluginRef[]; address: string; signedIn?: boolean }) => {
  const [server] = useState(() => guestServer(refs, { signedIn }))
  const [loader] = useState(() => {
    loaded = []
    window.history.replaceState({ protobaseIndex: 0 }, '', address)
    return loaderFor(guestPlugin(server.exchange))
  })
  return (
    <div className="h-screen">
      <App client={ordersWith(refs)} auth={server.session} pluginLoader={loader} />
    </div>
  )
}

const address = () => `${window.location.pathname}${window.location.search}`

export const OffChecks: StoryObj = {
  name: 'Off: a guest link opens the sign-in page, and no plugin loads (checks)',
  tags: ['play', '!dev'],
  render: () => <Guest refs={[]} address="/orders?access=guest-code" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    expect(address()).toBe('/-/sign-in?next=%2Forders%3Faccess%3Dguest-code')
    expect(loaded).toEqual([])
  },
}

export const GuestLinkChecks: StoryObj = {
  name: 'On: a guest link signs in through the plugin, which loads once (checks)',
  tags: ['play', '!dev'],
  render: () => <Guest refs={plugins} address="/orders?access=guest-code" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: 'Profile menu' })).toBeVisible()
    await canvas.findByText('SO-1')
    expect(canvas.getByText('Cloud')).toBeVisible()
    expect(canvas.queryByText('Signing you in as a guest…')).toBeNull()
    await waitFor(() => expect(address()).toBe('/orders'))
    expect(loaded).toEqual([cloud, 'https://cloud.example.com/cloud/index.js'])
  },
}

export const WithoutLinkChecks: StoryObj = {
  name: 'On: without a guest code, the sign-in page shows as before (checks)',
  tags: ['play', '!dev'],
  render: () => <Guest refs={plugins} address="/orders" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Sign in to Protobase' })).toBeVisible()
    expect(address()).toBe('/-/sign-in?next=%2Forders')
    expect(loaded).toEqual([cloud, 'https://cloud.example.com/cloud/index.js'])
  },
}

export const SignedInChecks: StoryObj = {
  name: 'On: someone signed in gets the plugin once, without its beforeSignIn (checks)',
  tags: ['play', '!dev'],
  render: () => <Guest refs={plugins} address="/orders?access=guest-code" signedIn />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    expect(canvas.getByText('Cloud')).toBeVisible()
    expect(canvas.queryByText('Signing you in as a guest…')).toBeNull()
    expect(address()).toBe('/orders?access=guest-code')
    expect(loaded).toEqual([cloud, 'https://cloud.example.com/cloud/index.js'])
  },
}
