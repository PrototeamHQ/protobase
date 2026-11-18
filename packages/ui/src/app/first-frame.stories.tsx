import type { Meta, StoryObj } from '@storybook/react-vite'
import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type Client, type CurrentOrganization, type OrganizationMember } from '@protobase/client'
import { cachedPlugins } from '../data/start-cache/cached-plugins'
import { loadStartCache, type StartCache } from '../data/start-cache/start-cache'
import type { StartCacheStore } from '../data/start-cache/start-cache-store'
import type { PluginLoader } from '../plugins/load-plugin'
import { pluginApi, protobaseVersion } from '../plugins/plugin-api'
import { createPluginSource, preloadPlugins, type PluginSource } from '../plugins/plugin-source'
import { definePlugin } from './pages/project-ui'
import { App } from './app'
import { showFirstFrame } from './first-frame'
import { overview } from './pages/guide/sales-steps/step-4'
import { salesResources, salesRows, salesViews } from './pages/guide/sales-domain'
import { fakeApi } from './testing/fake-api'
import { rentalResources, rentalRows, rentalViews } from './testing/rentals-domain'

const meta = { title: 'Shell/First frame', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })
const phone = { name: 'Phone', styles: { width: '390px', height: '844px' }, type: 'mobile' }

/** The start cache's records in memory, as IndexedDB keeps them between two starts. */
const memoryStore = (): StartCacheStore => {
  const records: Record<string, unknown> = {}
  return {
    read: async (key) => structuredClone(records[key]),
    write: async (key, value) => void (records[key] = structuredClone(value)),
    remove: async (keys) => keys.forEach((key) => delete records[key]),
  }
}

// The start cache saves a second after the queries settle
const warmMs = 2500

// A plugin served as its plugin.json and module would be, which `/meta` names
const pluginFiles: Record<string, unknown> = { 'https://cdn.example.com/frame/plugin.json': { name: 'frame', api: pluginApi, protobase: '>=0.0.1', entry: 'index.js' } }
const pluginLoader: PluginLoader = {
  readJson: async (url) => (url in pluginFiles ? { json: pluginFiles[url] } : { status: 404 }),
  addStylesheet: () => undefined,
  importModule: async () => ({ default: definePlugin({ name: 'frame' }) }),
}

const app = (client: Client, path: string, startCache: StartCache, pluginSource: PluginSource, auth: AuthSession = session) => (
  <StrictMode>
    <div className="h-screen">
      <App client={client} auth={auth} initialUrl={path} workspace="Veldhuis Supply" startCache={startCache} pluginSource={pluginSource} />
    </div>
  </StrictMode>
)

/**
 * The page at `path` as the app's first frame draws it from a warm start cache: the app runs once, out of sight, so the
 * cache keeps what it showed, as a visit before; then it starts again from that cache, as the shell's entry does, with
 * the plugins the cache names loaded first, and its first render, one synchronous commit, is kept and the app unmounted
 * (`showFirstFrame`, as the shell does for the one-frame test). What shows is only what that commit drew.
 */
const FirstFrame = ({ client, path, auth }: { client: Client; path: string; auth?: AuthSession }) => {
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let done = false
    const store = memoryStore()
    const warm = document.createElement('div')
    warm.style.cssText = 'position:fixed;left:-200vw;top:0;width:100vw;height:100vh'
    document.body.append(warm)
    void (async () => {
      const first = createRoot(warm)
      first.render(app(client, path, await loadStartCache(store, protobaseVersion), createPluginSource(pluginLoader), auth))
      await new Promise((resolve) => setTimeout(resolve, warmMs))
      first.unmount()
      warm.remove()
      const startCache = await loadStartCache(store, protobaseVersion)
      const plugins = createPluginSource(pluginLoader)
      await preloadPlugins(plugins, cachedPlugins(startCache), 10_000)
      if (done || !frame.current) return
      showFirstFrame(frame.current, app(client, path, startCache, plugins, auth))
    })()
    return () => {
      done = true
      warm.remove()
    }
  }, [client, path, auth])
  return <div ref={frame} />
}

/** What stands in for content in the frame: skeletons and other placeholders, spinners, hidden content and busy regions. */
const standIns = (frame: HTMLElement) =>
  [...frame.querySelectorAll('[data-placeholder], .animate-spin, .invisible, [aria-busy="true"]')]
    .filter((element) => !element.closest('[data-fetching]'))
    .map((element) => `<${element.localName}${typeof element.className === 'string' ? ` .${element.className.split(' ').slice(0, 4).join('.')}` : ''}>`)

const frozen = async (canvasElement: HTMLElement) => {
  await waitFor(() => expect(canvasElement.querySelector('[data-first-frame="frozen"]')).not.toBeNull(), { timeout: warmMs + 5000 })
  return canvasElement.querySelector<HTMLElement>('[data-first-frame="frozen"]')!
}

const rentals = () => fakeApi({ resources: rentalResources, views: rentalViews, rows: rentalRows }).client
const rentalsWithPlugin = () => fakeApi({ resources: rentalResources, views: rentalViews, rows: rentalRows, plugins: [{ url: 'https://cdn.example.com/frame/plugin.json' }] }).client
const sales = () => fakeApi({ resources: salesResources, views: salesViews, pages: [overview.toModel()], rows: salesRows }).client

/** A list's first frame is the list with its rows, every one the view holds. */
export const List: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentals()} path="/tenants" />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getByText('Ada de Vries')).toBeInTheDocument()
  },
}

export const ListOnPhone: StoryObj = {
  ...List,
  tags: ['play', 'phone'],
  parameters: { viewport: { options: { phone } } },
  globals: { viewport: { value: 'phone' } },
}

/** With a plugin, the first frame is the list too: the plugin loaded before the app drew, so no gate waits for it. */
export const ListWithPlugin: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentalsWithPlugin()} path="/tenants" />,
  play: List.play,
}

/** A record's first frame is the record, its fields filled. */
export const Record: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentals()} path="/tenants/1" />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getByRole('heading', { name: 'Ada de Vries' })).toBeInTheDocument()
  },
}

export const RecordOnPhone: StoryObj = {
  ...Record,
  tags: ['play', 'phone'],
  parameters: { viewport: { options: { phone } } },
  globals: { viewport: { value: 'phone' } },
}

/** A composed page's first frame is the page with its blocks drawn, not hidden behind its skeleton. */
export const ComposedPage: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={sales()} path="/overview" />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getByRole('heading', { name: overview.toModel().title ?? 'Overview' })).toBeInTheDocument()
  },
}

export const ComposedPageOnPhone: StoryObj = {
  ...ComposedPage,
  tags: ['play', 'phone'],
  parameters: { viewport: { options: { phone } } },
  globals: { viewport: { value: 'phone' } },
}


/** A create form's first frame is the form, its fields and their choices drawn. */
export const CreateForm: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentals()} path="/leases/new" />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getAllByRole('textbox').length + within(frame).queryAllByRole('combobox').length).toBeGreaterThan(0)
  },
}

/** The account page's first frame is the page with the person's details. */
export const AccountPage: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentals()} path="/-/account" />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getByRole('heading', { level: 1 })).toHaveTextContent(/account/i)
  },
}

// Sam is an admin of Veldhuis Supply, in an app with organizations
const veldhuis = { id: 'org-veldhuis', name: 'Veldhuis Supply', slug: 'veldhuis', logo: null }
const members: OrganizationMember[] = [
  { id: 'm-sam', userId: 'story', name: 'Sam Veldhuis', email: 'sam@veldhuis.example', role: 'owner', appRoles: [], createdAt: '2026-09-01T09:00:00.000Z' },
  { id: 'm-jan', userId: 'u-jan', name: 'Jan Smit', email: 'jan@veldhuis.example', role: 'member', appRoles: [], createdAt: '2026-09-20T09:00:00.000Z' },
]
const samAsOwner: CurrentOrganization = { organization: veldhuis, role: 'owner', appRoles: [], memberId: 'm-sam', globalRoles: [] }
const withOrganizations: AuthSession = {
  ...session,
  status: async () => ({ ...(await session.status()), organizations: { create: 'everyone', roles: [] } }),
  organizations: { ...session.organizations, current: async () => samAsOwner, list: async () => [veldhuis], members: async () => members },
}

/** The organization page's first frame is the organization, named. */
export const OrganizationPage: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentals()} path="/-/organization" auth={withOrganizations} />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getAllByText('Veldhuis Supply').length).toBeGreaterThan(0)
  },
}

/** The members page's first frame lists the organization's members. */
export const MembersPage: StoryObj = {
  tags: ['play'],
  render: () => <FirstFrame client={rentals()} path="/-/organization/members" auth={withOrganizations} />,
  play: async ({ canvasElement }) => {
    const frame = await frozen(canvasElement)
    expect(standIns(frame)).toEqual([])
    expect(within(frame).getByText('Jan Smit')).toBeInTheDocument()
  },
}
