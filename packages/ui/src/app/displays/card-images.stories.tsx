import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { rgbaToThumbHash } from 'thumbhash'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Card images', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const bikes = resource('bikes')
  .table('bikes')
  .fields({ id: f.integer().readOnly(), name: f.text(), price: f.decimal({ precision: 10, scale: 2 }), photo: f.file().accept(['image/*']).optional() })
  .primaryKey((r) => r.id)

const bikesView = view<typeof bikes>('bikes')
  .title((r) => r.name)
  .list((r, d) => ({ columns: [r.name, r.price], displays: [d.cards({ image: r.photo, meta: [r.price] })], default: 'cards' }))

// A photo stand-in: a sky and a ground in the bike's colour, drawn as a PNG.
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
  const [api] = useState(() =>
    fakeApi({
      resources: [bikes.toModel()],
      views: [bikesView.toModel(bikes.toModel())],
      rows: {
        bikes: [
          { id: 1, name: 'Brompton C Line', price: '1450.00', photo: photo('brompton', 200) },
          { id: 2, name: 'Gazelle Ultimate', price: '2899.00', photo: photo('gazelle', 120) },
          { id: 3, name: 'Cortina U4', price: '749.00', photo: null },
        ],
      },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/bikes" workspace="Pip's bike shop" />
    </div>
  )
}

export const CardImages: StoryObj = { name: 'Cards with an image', render: () => <Shop /> }

export const CardImagesChecks: StoryObj = {
  ...CardImages,
  name: 'Cards with an image (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Brompton C Line')
    const pictures = canvasElement.querySelectorAll('ul img')
    expect(pictures).toHaveLength(2)
    expect(pictures[0]!.getAttribute('src')).toMatch(/^data:image\/png/)
  },
}

// A bike's photo with a ThumbHash placeholder and a card-sized variant, as an image field with `.placeholder()` and
// `.variants()` stores it; `loads: false` stands for a photo still on its way.
const photographed = resource('bikes')
  .table('bikes')
  .fields({
    id: f.integer().readOnly(),
    name: f.text(),
    price: f.decimal({ precision: 10, scale: 2 }),
    photo: f.file().accept(['image/*']).optional().placeholder('photo_placeholder').variants({ card: { width: 640, height: 480, fit: 'cover', format: 'webp' } }),
    photo_placeholder: f.text().readOnly().optional(),
  })
  .primaryKey((r) => r.id)

const photographedView = view<typeof photographed>('bikes')
  .title((r) => r.name)
  .list((r, d) => ({ columns: [r.name, r.price, r.photo], displays: [d.cards({ image: r.photo, meta: [r.price] })], default: 'cards' }))

const thumbHashOf = (hue: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 100
  canvas.height = 75
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 60% 80%)`
  context.fillRect(0, 0, 100, 75)
  context.fillStyle = `hsl(${hue} 45% 45%)`
  context.fillRect(0, 50, 100, 25)
  const { data } = context.getImageData(0, 0, 100, 75)
  return btoa(String.fromCharCode(...rgbaToThumbHash(100, 75, data)))
}

const photographedRow = (id: number, name: string, hue: number, loads: boolean) => {
  const placeholder = thumbHashOf(hue)
  const card = loads ? picture(hue) : `https://bikes.invalid/${name}.card.webp`
  return {
    id,
    name,
    price: '1450.00',
    photo_placeholder: placeholder,
    photo: { uri: `public:bikes/${name}.jpg`, name: `${name}.jpg`, type: 'image/jpeg', size: 4_000_000, url: `https://bikes.invalid/${name}.jpg`, placeholder, variants: { card: { url: card, type: 'image/webp', width: 640, height: 480 } } },
  }
}

const PhotographedShop = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [photographed.toModel()],
      views: [photographedView.toModel(photographed.toModel())],
      rows: { bikes: [photographedRow(1, 'brompton', 200, true), photographedRow(2, 'gazelle', 120, false)] },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/bikes" workspace="Pip's bike shop" />
    </div>
  )
}

export const CardPlaceholders: StoryObj = { name: 'Cards with variants and placeholders', render: () => <PhotographedShop /> }

export const CardPlaceholdersChecks: StoryObj = {
  ...CardPlaceholders,
  name: 'Cards with variants and placeholders (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('brompton')
    const [loaded, loading] = [...canvasElement.querySelectorAll<HTMLImageElement>('ul img')]
    // The card variant, not the 4 MB original
    expect(loaded!.getAttribute('src')).toMatch(/^data:image\/png/)
    expect(loading!.getAttribute('src')).toBe('https://bikes.invalid/gazelle.card.webp')
    // The placeholder shows until the photo has loaded
    expect(loading!.style.backgroundImage).toMatch(/^url\("data:image\/png;base64,/)
    await waitFor(() => expect(loaded!.style.backgroundImage).toBe(''))
  },
}
