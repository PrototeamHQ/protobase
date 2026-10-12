import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
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
