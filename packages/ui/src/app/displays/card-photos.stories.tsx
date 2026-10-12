import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Card photos', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const bikes = resource('bikes')
  .table('bikes')
  .fields({ id: f.integer().readOnly(), name: f.text(), price: f.decimal({ precision: 10, scale: 2 }), photo: f.file().accept(['image/*']).optional() })
  .primaryKey((r) => r.id)

const bikePhotos = resource('bike_photos')
  .table('bike_photos')
  .fields({ id: f.integer().readOnly(), bike_id: f.relation('bikes').filterable(), position: f.integer().sortable(), photo: f.file().accept(['image/*']) })
  .primaryKey((r) => r.id)

const bikesView = view<typeof bikes>('bikes')
  .title((r) => r.name)
  .list((r, d) => ({
    columns: [r.name, r.price],
    displays: [d.cards({ image: r.photo, meta: [r.price] }, { photos: { resource: 'bike_photos', field: 'bike_id', image: 'photo', sort: 'position' } })],
    default: 'cards',
  }))

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

const brompton = photo('brompton', 200)

// The resources the cards asked the list API for, in order, to see that the photos load only on an arrow press.
const listed: string[] = []

const Shop = () => {
  const [client] = useState(() => {
    const api = fakeApi({
      resources: [bikes.toModel(), bikePhotos.toModel()],
      views: [bikesView.toModel(bikes.toModel())],
      rows: {
        bikes: [
          { id: 1, name: 'Brompton C Line', price: '1450.00', photo: brompton },
          { id: 2, name: 'Cortina U4', price: '749.00', photo: photo('cortina', 30) },
        ],
        bike_photos: [
          { id: 11, bike_id: 1, position: 3, photo: photo('brompton-folded', 280) },
          { id: 10, bike_id: 1, position: 1, photo: brompton },
          { id: 12, bike_id: 1, position: 2, photo: photo('brompton-side', 120) },
        ],
      },
    })
    listed.length = 0
    const list: typeof api.client.list = (resource, params) => {
      listed.push(String(resource))
      return api.client.list(resource, params)
    }
    return { ...api.client, list }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/bikes" workspace="Pip's bike shop" />
    </div>
  )
}

export const CardPhotos: StoryObj = { name: 'Cards stepping through photos', render: () => <Shop /> }

export const CardPhotosChecks: StoryObj = {
  ...CardPhotos,
  name: 'Cards stepping through photos (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = (await canvas.findByText('Brompton C Line')).closest('li')!
    const shown = () => card.querySelector('img')!.getAttribute('src')
    expect(shown()).toBe(brompton.url)
    expect(listed).not.toContain('bike_photos')

    // The first press loads the photos, the cover once, in their order, and stays on the list
    await userEvent.click(within(card).getByRole('button', { name: 'Next photo' }))
    await waitFor(() => expect(within(card).getByText('Photo 2 of 3')).toBeTruthy())
    expect(shown()).toMatch(/^data:image\/png/)
    expect(shown()).not.toBe(brompton.url)
    expect(listed.filter((name) => name === 'bike_photos')).toHaveLength(1)
    expect(canvas.getByRole('list', { name: 'Bikes' })).toBeTruthy()

    // Back past the first wraps to the last
    await userEvent.click(within(card).getByRole('button', { name: 'Previous photo' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Previous photo' }))
    await waitFor(() => expect(within(card).getByText('Photo 3 of 3')).toBeTruthy())

    // A bike without further photos keeps its cover and loses its arrows once they are known
    const cortina = (await canvas.findByText('Cortina U4')).closest('li')!
    await userEvent.click(within(cortina).getByRole('button', { name: 'Next photo' }))
    await waitFor(() => expect(within(cortina).queryByRole('button', { name: 'Next photo' })).toBeNull())
    expect(cortina.querySelector('img')).not.toBeNull()
  },
}
