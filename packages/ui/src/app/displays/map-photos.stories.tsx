import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Map card photos', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const bikes = resource('bikes')
  .table('bikes')
  .fields({
    id: f.integer().readOnly(),
    name: f.text(),
    photo: f.file().accept(['image/*']).optional(),
    latitude: f.decimal({ precision: 8, scale: 6 }),
    longitude: f.decimal({ precision: 9, scale: 6 }),
  })
  .primaryKey((r) => r.id)

const bikePhotos = resource('bike_photos')
  .table('bike_photos')
  .fields({ id: f.integer().readOnly(), bike_id: f.relation('bikes').filterable(), position: f.integer().sortable(), photo: f.file().accept(['image/*']) })
  .primaryKey((r) => r.id)

const bikesView = view<typeof bikes>('bikes')
  .title((r) => r.name)
  .names({ singular: 'Bike', plural: 'Bikes' })
  .list((r, d) => ({
    columns: [r.name],
    displays: [d.cards({ image: r.photo }, { photos: { resource: 'bike_photos', field: 'bike_id', image: 'photo', sort: 'position' } }), d.map({ latitude: r.latitude, longitude: r.longitude })],
    default: 'map',
  }))

// A style of one background layer, so the story draws a map without the network.
const offlineStyle = URL.createObjectURL(new Blob([JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e8efe4' } }] })], { type: 'application/json' }))

// A photo stand-in: a sky and a ground in its own colour, drawn as a PNG.
const picture = (hue: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 120
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 60% 80%)`
  context.fillRect(0, 0, 160, 120)
  context.fillStyle = `hsl(${hue} 45% 45%)`
  context.fillRect(0, 80, 160, 40)
  return canvas.toDataURL('image/png')
}

const photo = (name: string, hue: number) => ({ uri: `public:bikes/${name}.png`, name: `${name}.png`, type: 'image/png', size: 2048, url: picture(hue) })

const Shop = () => {
  const [client] = useState(() => {
    const api = fakeApi({
      resources: [bikes.toModel(), bikePhotos.toModel()],
      views: [bikesView.toModel(bikes.toModel())],
      maps: { style: offlineStyle },
      rows: {
        bikes: [
          { id: 1, name: 'Brompton C Line', photo: photo('brompton', 200), latitude: '52.370216', longitude: '4.885168' },
          { id: 2, name: 'Cortina U4', photo: photo('cortina', 30), latitude: '52.358400', longitude: '4.909900' },
        ],
        bike_photos: [
          { id: 10, bike_id: 1, position: 1, photo: photo('brompton-side', 120) },
          { id: 11, bike_id: 1, position: 2, photo: photo('brompton-folded', 280) },
          { id: 20, bike_id: 2, position: 1, photo: photo('cortina-side', 60) },
          { id: 21, bike_id: 2, position: 2, photo: photo('cortina-rack', 330) },
        ],
      },
    })
    // Every bike is in view, so the map's answer is the list's, with the photos it asks for
    const map: typeof api.client.map = async (name, params) => {
      const page = await api.client.list(name, { labels: params.labels, photos: params.photos })
      return { items: page.items, buckets: [], totalSize: page.totalSize ?? page.items.length, labels: page.labels, photos: page.photos }
    }
    return { ...api.client, map }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/bikes" workspace="Pip's bike shop" />
    </div>
  )
}

export const MapPhotos: StoryObj = { name: 'A chosen card stepping through photos', render: () => <Shop /> }

export const MapPhotosChecks: StoryObj = {
  ...MapPhotos,
  name: 'A chosen card stepping through photos (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const markers = async () => {
      await waitFor(() => expect(canvas.getAllByRole('button', { name: 'Show the bike' })).toHaveLength(2), { timeout: 10_000 })
      return canvas.getAllByRole('button', { name: 'Show the bike' })
    }
    const chosen = () => within(canvas.getByRole('group', { name: 'Chosen bike' }))
    const track = () => canvas.getByRole('group', { name: 'Chosen bike' }).querySelector<HTMLElement>('[data-card-photos]')!

    // A marker's card steps through its photos to the last
    await userEvent.click((await markers())[0]!)
    const first = (await chosen().findByRole('link')).textContent
    await userEvent.click(chosen().getByRole('button', { name: 'Next photo' }))
    await userEvent.click(chosen().getByRole('button', { name: 'Next photo' }))
    await waitFor(() => expect(chosen().getByText('Photo 3 of 3')).toBeTruthy())

    // Another marker's card starts at its own first photo, its own image
    await userEvent.click((await markers())[1]!)
    await waitFor(() => expect(chosen().getByRole('link').textContent).not.toBe(first))
    expect(chosen().getByText('Photo 1 of 3')).toBeTruthy()
    expect(track().scrollLeft).toBe(0)
  },
}
