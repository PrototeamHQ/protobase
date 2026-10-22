import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiProvider } from '../data/api-provider'
import { useMeta } from '../data/use-meta'
import { ToastProvider } from '../toasts'
import { MetaGate } from './meta-gate'
import { NewVersionNotice } from './new-version-notice'
import { Router, useNavigationGuard } from './router'

const meta = { title: 'New version notice' } satisfies Meta
export default meta

/** Answers `/meta` with the app's name and the Protobase version it runs, which the story moves on. */
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

const server = fakeServer()

const AppName = () => <h1>{useMeta().data?.appName}</h1>

const UnsavedChanges = () => {
  const [dirty, setDirty] = useState(false)
  useNavigationGuard(dirty)
  return (
    <label>
      <input type="checkbox" checked={dirty} onChange={(event) => setDirty(event.target.checked)} /> Unsaved changes
    </label>
  )
}

const focusWindow = () => window.dispatchEvent(new Event('focus'))
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

/**
 * When the server moves to another Protobase version, the page keeps the `/meta` it has, stops reading it, and offers a
 * reload, which asks first while a form holds unsaved changes.
 */
export const OffersReloadOnNewVersion: StoryObj = {
  tags: ['play'],
  render: () => (
    <Router initialUrl="/">
      <ApiProvider fetch={server.fetch}>
        <MetaGate>
          <ToastProvider>
            <NewVersionNotice />
            <AppName />
            <UnsavedChanges />
          </ToastProvider>
        </MetaGate>
      </ApiProvider>
    </Router>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await canvas.findByRole('heading', { name: 'Shop' })

    server.state.appName = 'Store'
    focusWindow()
    await canvas.findByRole('heading', { name: 'Store' })
    expect(body.queryByText('A new version is available')).toBeNull()

    server.state.appName = 'Store 2'
    server.state.version = '0.15.0'
    focusWindow()
    await body.findByText('A new version is available')
    expect(body.getByText(/Protobase 0\.15\.0/)).toBeInTheDocument()
    expect(canvas.getByRole('heading', { name: 'Store' })).toBeVisible()

    const calls = server.state.metaCalls
    focusWindow()
    await settle()
    expect(server.state.metaCalls).toBe(calls)

    await userEvent.click(canvas.getByRole('checkbox', { name: 'Unsaved changes' }))
    await userEvent.click(body.getByRole('button', { name: 'Reload' }))
    const dialog = await body.findByRole('dialog', { name: 'Leave without saving?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
    expect(body.getByText('A new version is available')).toBeInTheDocument()
  },
}
