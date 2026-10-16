import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { mapLayerStorageKey } from './map-layer-choice'
import { mapLib } from './maplibre'

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

// Tiles of one colour from a protocol of the story's own, so the aerial layer draws without the network.
mapLib.addProtocol('story-tiles', async () => {
  const canvas = new OffscreenCanvas(256, 256)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#5b6b45'
  context.fillRect(0, 0, 256, 256)
  return { data: await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer() }
})

const aerial = { id: 'aerial_nl', label: 'Aerial', tiles: 'story-tiles://{z}/{x}/{y}', attribution: 'Story aerial photos CC BY 4.0', bounds: [3.2, 50.7, 7.3, 53.6] as [number, number, number, number], maxzoom: 19 }

const Shops = ({ start, sidebar = false, withoutStyle = false, withLayers = false }: { start: string; sidebar?: boolean; withoutStyle?: boolean; withLayers?: boolean }) => {
  const shopsView = view<typeof shops>('shops').layout((r) => [l.section('Shop', [r.name]), l.map('Location', { latitude: r.latitude, longitude: r.longitude, sidebar }), l.section('Coordinates', [r.latitude, r.longitude])])
  const [api] = useState(() => fakeApi({ resources: [shops.toModel()], views: [shopsView.toModel()], rows: { shops: rows }, ...(!withoutStyle && { maps: { style: offlineStyle, ...(withLayers && { layers: [aerial] }) } }) }))
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

export const WithLayers: StoryObj = {
  name: 'Switching to aerial photos',
  beforeEach: () => localStorage.removeItem(mapLayerStorageKey),
  render: () => <Shops start="/shops/1" withLayers />,
}

export const WithLayersChecks: StoryObj = {
  ...WithLayers,
  name: 'Switching to aerial photos (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const attribution = () => canvasElement.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent ?? ''
    // The style's map is the default, and the switch offers the layer by its label
    const layers = within(await canvas.findByRole('group', { name: 'Map layer' }, { timeout: 10_000 }))
    expect(layers.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    expect(attribution()).not.toContain('Story aerial photos')
    // Choosing the layer draws its tiles with its credit, and the browser remembers it
    await userEvent.click(layers.getByRole('button', { name: 'Aerial' }))
    expect(layers.getByRole('button', { name: 'Aerial' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(attribution()).toContain('Story aerial photos CC BY 4.0'), { timeout: 10_000 })
    expect(localStorage.getItem(mapLayerStorageKey)).toBe('aerial_nl')
    // Back to the map, the credit goes and the choice is forgotten
    await userEvent.click(layers.getByRole('button', { name: 'Map' }))
    await waitFor(() => expect(attribution()).not.toContain('Story aerial photos'))
    expect(localStorage.getItem(mapLayerStorageKey)).toBeNull()
  },
}
