import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiProvider } from '../../data/api-provider'
import { ToastProvider } from '../../toasts'
import { MetaGate, useAdminMeta } from '../meta-gate'
import { Router, useNavigationGuard, type GuardKind } from '../router'
import { NewVersionButton } from './new-version-button'
import { NewVersionToast } from './new-version-toast'

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

const Page = ({ server }: { server: ReturnType<typeof fakeServer> }) => (
  <Router initialUrl="/">
    <ApiProvider fetch={server.fetch}>
      <MetaGate>
        <ToastProvider>
          <NewVersionToast />
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <AppName />
              <NewVersionButton />
            </div>
            <Unsaved kind="draft-kept" label="Record edits" />
            <Unsaved kind="input-lost" label="New record" />
          </div>
        </ToastProvider>
      </MetaGate>
    </ApiProvider>
  </Router>
)

const focusWindow = () => window.dispatchEvent(new Event('focus'))
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

const play = (server: ReturnType<typeof fakeServer>) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  const body = within(canvasElement.ownerDocument.body)
  await canvas.findByRole('heading', { name: 'Shop' })

  // The same version: the page takes the new /meta, and says nothing
  server.state.appName = 'Store'
  focusWindow()
  await canvas.findByRole('heading', { name: 'Store' })
  expect(body.queryByText('This app has been updated')).toBeNull()
  expect(canvas.queryByRole('button', { name: 'Reload page to use the new version' })).toBeNull()

  // Another version: the page keeps what it has, says so, and reads /meta no more
  server.state.appName = 'Store 2'
  server.state.version = '0.15.0'
  focusWindow()
  await body.findByText('This app has been updated')
  expect(canvas.getByRole('heading', { name: 'Store' })).toBeVisible()
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

const desktop = fakeServer()

/**
 * When the server moves to another Protobase version, the page keeps the `/meta` it has, stops reading it, and offers a
 * reload in a toast and in the top bar, which asks first while a form holds unsaved changes.
 */
export const OffersReload: StoryObj = {
  tags: ['play'],
  render: () => <Page server={desktop} />,
  play: play(desktop),
}

const phone = fakeServer()

/** The same on a phone, where the toast sits above the bottom bar and the top bar's button is only its icon. */
export const OffersReloadOnPhone: StoryObj = {
  tags: ['play', 'phone'],
  globals: { viewport: { value: 'phone360' } },
  render: () => <Page server={phone} />,
  play: play(phone),
}
