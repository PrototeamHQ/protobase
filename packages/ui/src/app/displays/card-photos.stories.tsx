import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const viewports = { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'List page/Card photos', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const shops = resource('shops')
  .table('shops')
  .fields({ id: f.integer().readOnly(), name: f.text() })
  .primaryKey((r) => r.id)

const bikes = resource('bikes')
  .table('bikes')
  .fields({ id: f.integer().readOnly(), shop_id: f.relation('shops').filterable(), name: f.text(), price: f.decimal({ precision: 10, scale: 2 }), photo: f.file().accept(['image/*']).optional() })
  .primaryKey((r) => r.id)

const bikePhotos = resource('bike_photos')
  .table('bike_photos')
  .fields({ id: f.integer().readOnly(), bike_id: f.relation('bikes').filterable(), position: f.integer().sortable(), photo: f.file().accept(['image/*']) })
  .primaryKey((r) => r.id)

// A shop's page lists its bikes, in a row that scrolls sideways on a phone
const shopsView = view<typeof shops>('shops')
  .title((r) => r.name)
  .list((r) => ({ columns: [r.name] }))
  .layout((r) => [l.section('Shop', [r.name]), l.related('Bikes', { resource: 'bikes', field: 'shop_id', columns: ['name'] })])

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

// The resources the cards asked the list API for, in order, to see that each card loads its photos once.
const listed: string[] = []

const Shop = ({ url = '/bikes' }: { url?: string }) => {
  const [client] = useState(() => {
    const api = fakeApi({
      resources: [shops.toModel(), bikes.toModel(), bikePhotos.toModel()],
      views: [shopsView.toModel(shops.toModel()), bikesView.toModel(bikes.toModel())],
      rows: {
        shops: [{ id: 1, name: 'Pip on wheels' }],
        bikes: [
          { id: 1, shop_id: 1, name: 'Brompton C Line', price: '1450.00', photo: brompton },
          { id: 2, shop_id: 1, name: 'Cortina U4', price: '749.00', photo: photo('cortina', 30) },
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
      <App client={client} auth={session} initialUrl={url} workspace="Pip's bike shop" />
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
    const track = () => card.querySelector<HTMLElement>('[data-card-photos]')!
    const slide = (position: number) => track().children[position]?.querySelector('img')?.getAttribute('src')
    expect(slide(0)).toBe(brompton.url)
    expect(getComputedStyle(within(card).getByRole('button', { name: 'Next photo' })).opacity).toBe('0')

    // The photos load with the card, so the dots mark the cover before anything is touched
    await waitFor(() => expect(within(card).getByText('Photo 1 of 3')).toBeTruthy())
    expect(track().scrollLeft).toBe(0)

    // A press scrolls to the next photo, the cover once, in their order, and stays on the list
    await userEvent.click(within(card).getByRole('button', { name: 'Next photo' }))
    await waitFor(() => expect(within(card).getByText('Photo 2 of 3')).toBeTruthy())
    expect(slide(1)).toMatch(/^data:image\/png/)
    expect(slide(1)).not.toBe(brompton.url)
    expect(track().scrollLeft).toBeGreaterThan(0)
    expect(listed.filter((name) => name === 'bike_photos')).toHaveLength(2)
    expect(canvas.getByRole('list', { name: 'Bikes' })).toBeTruthy()

    // Back past the first wraps to the last, however quickly pressed
    await userEvent.click(within(card).getByRole('button', { name: 'Previous photo' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Previous photo' }))
    await waitFor(() => expect(within(card).getByText('Photo 3 of 3')).toBeTruthy())

    // A swipe is a scroll of the track, which the dots follow
    track().scrollTo({ left: 0, behavior: 'instant' })
    await waitFor(() => expect(within(card).getByText('Photo 1 of 3')).toBeTruthy())
    expect(getComputedStyle(track()).overflowX).toBe('auto')

    // A bike without further photos keeps its cover and loses its arrows once they are known
    const cortina = (await canvas.findByText('Cortina U4')).closest('li')!
    await waitFor(() => expect(within(cortina).queryByRole('button', { name: 'Next photo' })).toBeNull())
    expect(cortina.querySelector('img')).not.toBeNull()
  },
}

export const CardPhotosInRow: StoryObj = {
  name: 'Cards in a sideways row on a phone',
  globals: { viewport: { value: 'phone360' } },
  render: () => <Shop url="/shops/1" />,
}

export const CardPhotosInRowChecks: StoryObj = {
  ...CardPhotosInRow,
  name: 'Cards in a sideways row on a phone (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = (await canvas.findByText('Brompton C Line')).closest('li')!
    const track = card.querySelector<HTMLElement>('[data-card-photos]')!

    // The row scrolls on a swipe, not the photos, which the arrows still step through
    expect(getComputedStyle(track).overflowX).toBe('hidden')
    await userEvent.click(within(card).getByRole('button', { name: 'Next photo' }))
    await waitFor(() => expect(within(card).getByText('Photo 2 of 3')).toBeTruthy())
    expect(track.scrollLeft).toBeGreaterThan(0)
  },
}
