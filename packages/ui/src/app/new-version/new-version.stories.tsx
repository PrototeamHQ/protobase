import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AppShell } from '../../app-shell/app-shell'
import type { ShellUser } from '../../app-shell/profile-menu'
import type { SidebarMode } from '../../app-shell/sidebar-mode'
import { useSidebarNoticeShown } from '../../app-shell/sidebar-notice'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { ToastProvider } from '../../toasts'
import { MetaGate, useAdminMeta } from '../meta-gate'
import { Router, useNavigationGuard, type GuardKind } from '../router'
import { NewVersionBanner } from './new-version-banner'
import { NewVersionButton } from './new-version-button'
import { NewVersionToast } from './new-version-toast'
import { sampleNavGroups } from '../../app-shell/nav-fixtures'

const meta = { title: 'New version' } satisfies Meta
export default meta

/** Answers `/meta` with the app's name and the Protobase version it runs, which a story moves on. */
const fakeServer = () => {
  const state = { metaCalls: 0, appName: 'Shop', version: '0.14.2' }
  const fetch = async (input: RequestInfo | URL) => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    const url = String(input)
    if (!url.endsWith('/api/meta')) throw new Error(`Unexpected request ${url}`)
    state.metaCalls += 1
    const body = { appName: state.appName, protobaseVersion: state.version, resources: [], views: [], permissions: {} }
    return Response.json(body, { headers: { etag: `"${state.appName}-${state.version}"` } })
  }
  return { state, fetch }
}

const AppName = () => <h1>{useAdminMeta().appName}</h1>

/** A form holding input, which a reload keeps as a draft or loses. */
const Unsaved = ({ kind, label }: { kind: GuardKind; label: string }) => {
  const [dirty, setDirty] = useState(false)
  useNavigationGuard(dirty, kind)
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={dirty} onChange={(event) => setDirty(event.target.checked)} /> {label}
    </label>
  )
}

const user: ShellUser = { name: 'Sample User', email: 'sample@example.test', initials: 'SU', hue: 250, role: 'Admin', roleTone: 'violet' }

/** The app's shell as the app wires it: the banner in a full-width sidebar, otherwise the toast and the top bar's button. */
const Shell = ({ mode, children }: { mode: SidebarMode; children: ReactNode }) => {
  const banner = useSidebarNoticeShown(mode)
  return (
    <div className="h-screen">
      {!banner && <NewVersionToast />}
      <AppShell navGroups={sampleNavGroups} sidebarMode={mode} activeItem="orders" breadcrumb={['Orders']} user={user} sidebarNotice={<NewVersionBanner />} actions={!banner && <NewVersionButton />}>
        {children}
      </AppShell>
    </div>
  )
}

const Page = ({ server, mode }: { server: ReturnType<typeof fakeServer>; mode: SidebarMode }) => (
  <Router initialUrl="/">
    <ApiProvider fetch={server.fetch}>
      <MetaGate>
        <ToastProvider>
          <Shell mode={mode}>
            <div className="flex flex-col gap-3 p-4">
              <AppName />
              <Unsaved kind="draft-kept" label="Record edits" />
              <Unsaved kind="input-lost" label="New record" />
            </div>
          </Shell>
        </ToastProvider>
      </MetaGate>
    </ApiProvider>
  </Router>
)

const focusWindow = () => window.dispatchEvent(new Event('focus'))
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

const banner = /Store updated/

/** Moves the server to another Protobase version, after a change on the same one that the page takes as it is. */
const changeVersion = async (server: ReturnType<typeof fakeServer>, canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  const body = within(canvasElement.ownerDocument.body)
  await canvas.findByRole('heading', { name: 'Shop' })

  // The same version: the page takes the new /meta, and says nothing
  server.state.appName = 'Store'
  focusWindow()
  await canvas.findByRole('heading', { name: 'Store' })
  expect(body.queryByText('This app has been updated')).toBeNull()
  expect(canvas.queryByRole('button', { name: 'Reload page to use the new version' })).toBeNull()
  expect(canvas.queryByRole('button', { name: banner })).toBeNull()

  // Another version: the page keeps what it has, and reads /meta no more
  server.state.appName = 'Store 2'
  server.state.version = '0.15.0'
  focusWindow()
}

/** Where the sidebar is collapsed or a drawer: the toast and the top bar's button. */
const playFloating = (server: ReturnType<typeof fakeServer>) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  const body = within(canvasElement.ownerDocument.body)
  await changeVersion(server, canvasElement)
  await body.findByText('This app has been updated')
  expect(canvas.getByRole('heading', { name: 'Store' })).toBeVisible()
  expect(canvas.queryByRole('button', { name: banner })).toBeNull()
  const calls = server.state.metaCalls
  focusWindow()
  await settle()
  expect(server.state.metaCalls).toBe(calls)

  // With a draft this browser keeps, the reload asks first
  await userEvent.click(canvas.getByRole('checkbox', { name: 'Record edits' }))
  await userEvent.click(body.getByRole('button', { name: 'Reload' }))
  const kept = await body.findByRole('dialog', { name: 'Reload without saving?' })
  expect(within(kept).getByText(/come back after the page reloads/)).toBeInTheDocument()
  // The toast steps aside while a modal is open, so it covers none of its buttons
  await waitFor(() => expect(body.queryByText('This app has been updated')).toBeNull())
  await userEvent.click(within(kept).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())

  // With input a reload loses, it says so; the top bar's button asks the same
  await userEvent.click(canvas.getByRole('checkbox', { name: 'New record' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Reload page to use the new version' }))
  const lost = await body.findByRole('dialog', { name: 'Reload without saving?' })
  expect(within(lost).getByText(/lost when the page reloads/)).toBeInTheDocument()
  await userEvent.click(within(lost).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())

  // × closes the toast for good; the top bar's button stays
  await userEvent.click(await body.findByRole('button', { name: 'Dismiss' }))
  await waitFor(() => expect(body.queryByText('This app has been updated')).toBeNull())
  expect(canvas.getByRole('button', { name: 'Reload page to use the new version' })).toBeVisible()
}

/** Where the sidebar shows at full width: the banner above the profile, and neither the toast nor the top bar's button. */
const playBanner = (server: ReturnType<typeof fakeServer>) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  const body = within(canvasElement.ownerDocument.body)
  await changeVersion(server, canvasElement)
  const reload = await canvas.findByRole('button', { name: banner })
  expect(reload).toHaveTextContent('Save your work, then click here to reload')
  expect(canvas.getByRole('heading', { name: 'Store' })).toBeVisible()
  expect(body.queryByText('This app has been updated')).toBeNull()
  expect(canvas.queryByRole('button', { name: 'Reload page to use the new version' })).toBeNull()

  // With a draft this browser keeps, the reload asks first
  await userEvent.click(canvas.getByRole('checkbox', { name: 'Record edits' }))
  await userEvent.click(reload)
  const kept = await body.findByRole('dialog', { name: 'Reload without saving?' })
  expect(within(kept).getByText(/come back after the page reloads/)).toBeInTheDocument()
  await userEvent.click(within(kept).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())

  // With input a reload loses, it says so
  await userEvent.click(canvas.getByRole('checkbox', { name: 'New record' }))
  await userEvent.click(reload)
  const lost = await body.findByRole('dialog', { name: 'Reload without saving?' })
  expect(within(lost).getByText(/lost when the page reloads/)).toBeInTheDocument()
  await userEvent.click(within(lost).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
  expect(reload).toBeVisible()
}

const desktop = fakeServer()

/**
 * When the server moves to another Protobase version, the page keeps the `/meta` it has, stops reading it, and offers a
 * reload in a banner at the bottom of the sidebar, which asks first while a form holds unsaved changes.
 */
export const OffersReload: StoryObj = {
  tags: ['play'],
  render: () => <Page server={desktop} mode="text-small" />,
  play: playBanner(desktop),
}

const collapsed = fakeServer()

/** With the sidebar collapsed to icons, which have no room for the banner, a toast and the top bar's button offer it. */
export const OffersReloadCollapsed: StoryObj = {
  tags: ['play'],
  render: () => <Page server={collapsed} mode="icon" />,
  play: playFloating(collapsed),
}

const phone = fakeServer()

/** The same on a phone, where the toast sits above the bottom bar and the top bar's button is only its icon. */
export const OffersReloadOnPhone: StoryObj = {
  tags: ['play', 'phone'],
  globals: { viewport: { value: 'phone360' } },
  render: () => <Page server={phone} mode="text-small" />,
  play: playFloating(phone),
}

const updated: MetaData = { etag: '"backlog"', appName: 'Firstmate Backlog', versionChange: { to: '0.15.0' }, resources: {}, views: {}, pages: {}, permissions: {} }

/** The banner as it stands once the server runs another version, above the signed-in person. */
const Banner = () => (
  <Router initialUrl="/">
    <MetaContext.Provider value={updated}>
      <div className="h-screen">
        <AppShell navGroups={sampleNavGroups} sidebarMode="text-small" activeItem="orders" breadcrumb={['Orders']} user={user} workspace="Veldhuis Supply" appName={updated.appName} sidebarNotice={<NewVersionBanner />}>
          <div className="p-6 text-muted-foreground">Page content</div>
        </AppShell>
      </div>
    </MetaContext.Provider>
  </Router>
)

export const BannerLight: StoryObj = { parameters: { layout: 'fullscreen' }, render: () => <Banner /> }

export const BannerDark: StoryObj = { parameters: { layout: 'fullscreen' }, globals: { theme: 'dark' }, render: () => <Banner /> }
