import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Cards and the scrollbar', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const bikes = resource('bikes')
  .table('bikes')
  .fields({ id: f.integer().readOnly(), name: f.text(), price: f.decimal({ precision: 10, scale: 2 }), photo: f.file().accept(['image/*']).optional() })
  .primaryKey((r) => r.id)

const bikesView = view<typeof bikes>('bikes')
  .title((r) => r.name)
  .list((r, d) => ({ columns: [r.name, r.price], displays: [d.cards({ image: r.photo, meta: [r.price] })], default: 'cards' }))

// A photo stand-in, drawn as a PNG
const picture = (hue: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 120
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 60% 80%)`
  context.fillRect(0, 0, 160, 120)
  return canvas.toDataURL('image/png')
}

const rows = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  name: `Bike ${index + 1}`,
  price: '1450.00',
  photo: { uri: `public:bikes/${index + 1}.png`, name: `${index + 1}.png`, type: 'image/png', size: 2048, url: picture(index * 45) },
}))

// A row of cards, as tall as they are rather than the window, with a filler below them that the play function makes
// as tall as brings the page to the window's height
const Shop = () => {
  const [api] = useState(() => fakeApi({ resources: [bikes.toModel()], views: [bikesView.toModel(bikes.toModel())], rows: { bikes: rows } }))
  return (
    <>
      <div>
        <App client={api.client} auth={session} initialUrl="/bikes" workspace="Pip's bike shop" />
      </div>
      <div data-testid="filler" />
    </>
  )
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

const scrollbarWidth = () => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position: absolute; width: 100px; height: 100px; overflow: scroll'
  document.body.append(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return width
}

export const AtTheThreshold: StoryObj = {
  name: 'Cards just too tall for the window keep their width (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    // Only a scrollbar that takes room narrows the cards
    expect(scrollbarWidth()).toBeGreaterThan(0)
    const card = () => canvasElement.querySelector<HTMLElement>('li[aria-posinset]')!
    await waitFor(() => expect(canvasElement.querySelectorAll('li[aria-posinset]')).toHaveLength(rows.length))
    await waitFor(() => expect(card().offsetHeight).toBeGreaterThan(card().offsetWidth * 0.75))

    // A pixel too tall for the window with the cards as wide as they are now: the scrollbar it brings must not narrow
    // the cards, as that would make them short enough to fit, lose the scrollbar, widen them again, and so on
    const page = document.scrollingElement ?? document.documentElement
    const filler = within(canvasElement).getByTestId('filler')
    const room = window.innerHeight - page.scrollHeight
    expect(room).toBeGreaterThanOrEqual(0)
    filler.style.height = `${room + 1}px`
    const widths: number[] = []
    for (let index = 0; index < 30; index++) {
      await frame()
      widths.push(card().offsetWidth)
    }
    expect(new Set(widths).size).toBe(1)
    expect(page.scrollHeight).toBeGreaterThan(window.innerHeight)
  },
}
