import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Map approximate positions', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@homes.example', name: 'Pip', role: 'admin' })

const homes = resource('homes')
  .table('homes')
  .fields({
    id: f.integer().readOnly(),
    address: f.text(),
    latitude: f.decimal({ precision: 8, scale: 6 }).filterable(),
    longitude: f.decimal({ precision: 9, scale: 6 }).filterable(),
    position_exact: f.boolean(),
    accuracy: f.integer().optional(),
    outline: f.json().optional(),
  })
  .primaryKey((r) => r.id)

const homesView = view<typeof homes>('homes')
  .names({ singular: 'Home', plural: 'Homes' })
  .list((r, d) => ({
    columns: [r.address],
    displays: [d.cards({ title: r.address }), d.map({ latitude: r.latitude, longitude: r.longitude, exact: r.position_exact, radius: r.accuracy, area: r.outline }, { label: 'Map' })],
  }))

// A block's outline and a stretch of a street, as a record states the area its position is somewhere in.
const block = { type: 'Polygon', coordinates: [[[4.8838, 52.3719], [4.8866, 52.3719], [4.8866, 52.3734], [4.8838, 52.3734], [4.8838, 52.3719]]] }
const street = { type: 'LineString', coordinates: [[4.8902, 52.3704], [4.8925, 52.3712], [4.8951, 52.3716]] }

const rows = [
  { id: 1, address: 'Prinsengracht 263', latitude: '52.373900', longitude: '4.881500', position_exact: true, accuracy: null, outline: null },
  { id: 2, address: 'Near Westermarkt', latitude: '52.370300', longitude: '4.881000', position_exact: false, accuracy: 120, outline: null },
  { id: 3, address: 'Somewhere on Leliegracht', latitude: '52.372600', longitude: '4.885200', position_exact: false, accuracy: null, outline: block },
  { id: 4, address: 'Somewhere on Herengracht', latitude: '52.371200', longitude: '4.892500', position_exact: false, accuracy: null, outline: street },
  { id: 5, address: 'Somewhere in the Jordaan', latitude: '52.374000', longitude: '4.891000', position_exact: false, accuracy: null, outline: null },
]

// A style of one background layer, so the map draws without the network.
const offlineStyle = URL.createObjectURL(new Blob([JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e8efe4' } }] })], { type: 'application/json' }))

const Homes = () => {
  const [api] = useState(() => fakeApi({ resources: [homes.toModel()], views: [homesView.toModel()], rows: { homes: rows }, maps: { style: offlineStyle } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/homes?display=map&map=52.37200,4.88700,15.00" workspace="Pip's homes" />
    </div>
  )
}

/** An exact home and approximate ones: in a circle of the radius it states, in a block, on a street, and one that states no area. */
export const ApproximatePositions: StoryObj = { name: 'Exact and approximate positions', render: () => <Homes /> }

export const ApproximatePositionsChecks: StoryObj = {
  ...ApproximatePositions,
  name: 'Exact and approximate positions (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // MapLibre loads with the first map, then draws a marker for each home, those at an approximate position hollow
    const exact = await canvas.findByRole('button', { name: 'Show the home' }, { timeout: 10_000 })
    await waitFor(() => expect(canvas.getAllByRole('button', { name: 'Show the home, at an approximate position' })).toHaveLength(4))
    expect(exact.querySelector('[data-approximate]')).toBeNull()
    for (const marker of canvas.getAllByRole('button', { name: 'Show the home, at an approximate position' })) expect(marker.querySelector('[data-approximate]')).not.toBeNull()

    // The card of a home at an approximate position says so; an exact home's does not
    await userEvent.click(canvas.getAllByRole('button', { name: 'Show the home, at an approximate position' })[0]!)
    const chosen = await canvas.findByRole('group', { name: 'Chosen home' })
    expect(within(chosen).getByText('Approximate position')).toBeVisible()
    await userEvent.click(exact)
    await waitFor(() => expect(within(canvas.getByRole('group', { name: 'Chosen home' })).getByText('Prinsengracht 263')).toBeVisible())
    expect(within(canvas.getByRole('group', { name: 'Chosen home' })).queryByText('Approximate position')).toBeNull()
  },
}
