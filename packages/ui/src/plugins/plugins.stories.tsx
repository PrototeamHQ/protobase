import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { component } from '@protobase/layout'
import { l } from '@protobase/schema'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView } from '../../../../docs-examples/bike-shop/step-5'
import * as workshop from '../../../../docs-examples/reference/workshop'
import { App } from '../app'
import { definePlugin } from '../app/pages/project-ui'
import { fakeApi } from '../app/testing/fake-api'
import type { PluginLoader } from './load-plugin'
import { usePlugin } from './plugin-context'

const meta = { title: 'Plugins/Loading', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

/** A plugin's component: it reads the plugin it belongs to and the settings the app gave it. */
const Greeting = () => {
  const plugin = usePlugin()
  return <p>{`${plugin.name} ${plugin.version} says ${String(plugin.settings.greeting)}`}</p>
}

/** A plugin's component that throws while drawing. */
const Faulty = () => {
  throw new Error('Faulty broke')
}

// The plugins as their plugin.json files and modules would be served; `gone` has no plugin.json at all.
const files: Record<string, unknown> = {
  'https://cdn.example.com/hello/plugin.json': { name: 'hello', version: '1.0.0', api: 1, protobase: '>=0.0.1', entry: 'index.js' },
  'https://cdn.example.com/next/plugin.json': { name: 'next', api: 2, protobase: '>=0.0.1', entry: 'index.js' },
}
const modules: Record<string, Record<string, unknown>> = {
  'https://cdn.example.com/hello/index.js': { Greeting, Faulty, default: definePlugin({ name: 'hello' }) },
}
const loader: PluginLoader = {
  readJson: async (url) => (url in files ? { json: files[url] } : { status: 404 }),
  addStylesheet: () => undefined,
  importModule: async (url) => modules[url]!,
}
const plugins = [
  { url: 'https://cdn.example.com/hello/plugin.json', settings: { greeting: 'hello there' } },
  { url: 'https://cdn.example.com/next/plugin.json' },
  { url: 'https://cdn.example.com/gone/plugin.json' },
]

// The repair's page draws three components plugins provide: one that draws, one that throws, and one from a plugin that is off.
const withPlugins = workshop.repairsView.layout((r) => [
  l.section('The bike', [r.customer_id, r.bike, r.problem]),
  l.custom(component('Greeting', { plugin: 'hello' }), { title: 'From a plugin' }),
  l.custom(component('Faulty', { plugin: 'hello' }), { title: 'Throws' }),
  l.custom(component('WarrantyCard', { plugin: 'next' }), { title: 'Off' }),
])

const Shop = ({ role }: { role: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), withPlugins.toModel()], rows: { customers: customerRows, repairs: repairRows }, plugins }))
  const [session] = useState(() => createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/repairs/1" pluginLoader={loader} workspace="Pip's bike shop" />
    </div>
  )
}

export const ForAnAdmin: StoryObj = { name: 'For an admin: two plugins off', render: () => <Shop role="admin" /> }

export const ForAnAdminChecks: StoryObj = {
  ...ForAnAdmin,
  name: 'For an admin: two plugins off (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-301' })
    expect(canvas.getByText('hello 1.0.0 says hello there')).toBeVisible()
    const alerts = canvas.getAllByRole('alert').map((alert) => alert.textContent)
    expect(alerts).toEqual(['Faulty could not be drawn.', 'No component is registered as WarrantyCard. Export it from protobase.ui.tsx, or load the plugin that provides it.'])
    const notice = within(canvas.getByRole('region', { name: 'Plugins off' }))
    expect(notice.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'The plugin next is off: it is built for plugin API 2, and this app has plugin API 1.',
      'The plugin https://cdn.example.com/gone/plugin.json is off: its plugin.json answered 404.',
    ])
    await userEvent.click(notice.getByRole('button', { name: 'Dismiss' }))
    expect(canvas.queryByRole('region', { name: 'Plugins off' })).toBeNull()
  },
}

export const ForAnotherRoleChecks: StoryObj = {
  name: 'For another role: no notice (checks)',
  render: () => <Shop role="mechanic" />,
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-301' })
    expect(canvas.getByText('hello 1.0.0 says hello there')).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Plugins off' })).toBeNull()
  },
}
