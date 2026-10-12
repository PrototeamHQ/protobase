import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Map', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const shops = resource('shops')
  .table('shops')
  .fields({ id: f.integer().readOnly(), name: f.text(), latitude: f.decimal({ precision: 8, scale: 6 }).optional(), longitude: f.decimal({ precision: 9, scale: 6 }).optional() })
  .primaryKey((r) => r.id)

const rows = [
  { id: 1, name: 'Pip on the Prinsengracht', latitude: '52.370216', longitude: '4.885168' },
  { id: 2, name: 'Pip, opening soon', latitude: null, longitude: null },
]

// A style of one background layer, so the stories draw a map without the network.
const offlineStyle = URL.createObjectURL(new Blob([JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e8efe4' } }] })], { type: 'application/json' }))

const Shops = ({ start, sidebar = false, withoutStyle = false }: { start: string; sidebar?: boolean; withoutStyle?: boolean }) => {
  const shopsView = view<typeof shops>('shops').layout((r) => [l.section('Shop', [r.name]), l.map('Location', { latitude: r.latitude, longitude: r.longitude, sidebar }), l.section('Coordinates', [r.latitude, r.longitude])])
  const [api] = useState(() => fakeApi({ resources: [shops.toModel()], views: [shopsView.toModel()], rows: { shops: rows }, ...(!withoutStyle && { maps: { style: offlineStyle } }) }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

export const OnTheMap: StoryObj = { name: 'The record on the map', render: () => <Shops start="/shops/1" /> }

export const InTheSidebar: StoryObj = { name: 'In the sidebar', render: () => <Shops start="/shops/1" sidebar /> }

export const OnTheMapChecks: StoryObj = {
  ...OnTheMap,
  name: 'The record on the map (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Pip on the Prinsengracht' })
    expect(await canvas.findByRole('heading', { name: 'Location' })).toBeVisible()
    // MapLibre loads with the first map, then draws it with the pin in the main column
    await waitFor(() => expect(canvasElement.querySelector('.maplibregl-marker')).not.toBeNull(), { timeout: 10_000 })
    expect(canvasElement.querySelector('.maplibregl-canvas')).not.toBeNull()
    expect(canvasElement.querySelector('aside .maplibregl-map')).toBeNull()
  },
}

export const InTheSidebarChecks: StoryObj = {
  ...InTheSidebar,
  name: 'In the sidebar (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Pip on the Prinsengracht' })
    const aside = within(canvasElement.querySelector('aside')!)
    expect(await aside.findByText('Location')).toBeVisible()
    await waitFor(() => expect(canvasElement.querySelector('aside .maplibregl-marker')).not.toBeNull(), { timeout: 10_000 })
    expect(canvasElement.querySelectorAll('.maplibregl-map')).toHaveLength(1)
  },
}

export const WithoutPositionChecks: StoryObj = {
  name: 'No map for a record without a position (checks)',
  tags: ['play', '!dev'],
  render: () => <Shops start="/shops/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Pip, opening soon' })
    expect(canvas.getByRole('heading', { name: 'Coordinates' })).toBeVisible()
    expect(canvas.queryByRole('heading', { name: 'Location' })).toBeNull()
  },
}

export const WithoutStyleChecks: StoryObj = {
  name: 'No map without a map style (checks)',
  tags: ['play', '!dev'],
  render: () => <Shops start="/shops/1" withoutStyle />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Pip on the Prinsengracht' })
    expect(canvas.getByRole('heading', { name: 'Coordinates' })).toBeVisible()
    expect(canvas.queryByRole('heading', { name: 'Location' })).toBeNull()
    expect(canvasElement.querySelector('.maplibregl-map')).toBeNull()
  },
}
