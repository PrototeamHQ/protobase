import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
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

// Two rows of three cards, which a 1280 by 720 window can show whole or just not, as the cards narrow or widen
const rows = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  name: `Bike ${index + 1}`,
  price: '1450.00',
  photo: { uri: `public:bikes/${index + 1}.png`, name: `${index + 1}.png`, type: 'image/png', size: 2048, url: picture(index * 45) },
}))

// The cards, narrowed by a right margin the play function sets, and a button that takes no room in the page to open a
// dialog over them
const Shop = () => {
  const [api] = useState(() => fakeApi({ resources: [bikes.toModel()], views: [bikesView.toModel(bikes.toModel())], rows: { bikes: rows } }))
  const [dialog, setDialog] = useState(false)
  const close = () => setDialog(false)
  return (
    <>
      <div data-testid="app">
        <App client={api.client} auth={session} initialUrl="/bikes" workspace="Pip's bike shop" />
      </div>
      <Button className="fixed right-4 bottom-4" onClick={() => setDialog(true)}>
        Open dialog
      </Button>
      {dialog && <Dialog title="A dialog" onClose={close} actions={<Button onClick={close}>Close</Button>} />}
    </>
  )
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const frames = async (count: number) => {
  for (let index = 0; index < count; index++) await frame()
}

const scrollbarWidth = () => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position: absolute; width: 100px; height: 100px; overflow: scroll'
  document.body.append(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return width
}

// Sets the page's scrollbar gutter over the shell's: `auto` as in a browser without `scrollbar-gutter`, or should the
// shell stop keeping it, so whatever else keeps the cards from flashing has to
const gutter = document.createElement('style')
const setGutter = (value: 'auto' | 'stable' | undefined) => {
  gutter.textContent = value ? `html { scrollbar-gutter: ${value} !important }` : ''
  document.head.append(gutter)
}
const withoutGutter = () => {
  setGutter('auto')
  return () => gutter.remove()
}
const withShellGutter = () => {
  setGutter(undefined)
  return () => gutter.remove()
}

const firstCard = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('li[aria-posinset]')!

const overflows = () => document.documentElement.scrollHeight > window.innerHeight

/**
 * Finds the threshold: the least right margin, to a quarter pixel, at which the cards fit the window beside room for
 * its scrollbar. Up to the scrollbar's width more, they are just too tall for the window without that room, and short
 * enough with it: a scrollbar that came and went with them would narrow them, they would fit and it would go, they would
 * widen and it would come, every frame.
 */
const findThreshold = async (canvasElement: HTMLElement) => {
  // Only a scrollbar that takes room narrows the cards
  expect(scrollbarWidth()).toBeGreaterThan(0)
  await waitFor(() => expect(canvasElement.querySelectorAll('li[aria-posinset]')).toHaveLength(rows.length))
  await waitFor(() => expect(firstCard(canvasElement).offsetHeight).toBeGreaterThan(firstCard(canvasElement).offsetWidth * 0.75))
  const app = within(canvasElement).getByTestId('app')
  const restore = gutter.textContent
  gutter.textContent = 'html { scrollbar-gutter: stable !important }'
  const overflowsAt = async (margin: number) => {
    app.style.marginRight = `${margin}px`
    await frames(8)
    return overflows()
  }
  // Three cards a row, from the widest to the narrowest
  let [low, high] = [30, 260]
  expect(await overflowsAt(low)).toBe(true)
  expect(await overflowsAt(high)).toBe(false)
  while (high - low > 0.25) {
    const middle = (low + high) / 2
    if (await overflowsAt(middle)) low = middle
    else high = middle
  }
  gutter.textContent = restore
  return { app, margin: high }
}

/** How often the first card's width changes over `count` frames, and whether it keeps one width over the last half. */
const widthChanges = async (canvasElement: HTMLElement, count: number) => {
  const widths: number[] = []
  for (let index = 0; index < count; index++) {
    await frame()
    widths.push(firstCard(canvasElement).getBoundingClientRect().width)
  }
  return { changes: widths.filter((width, index) => index > 0 && width !== widths[index - 1]).length, settled: new Set(widths.slice(count / 2)).size === 1 }
}

// Into the threshold by a pixel and a half, by half the scrollbar's width and a fraction, and by nearly all of it: card
// widths of whole pixels and fractions, as in other windows and at other zoom levels
const intoThreshold = (scrollbar: number) => [1.5, scrollbar / 2 + 0.25, scrollbar - 1]

/** Puts the cards at each width into the threshold and checks their width changes no more than `most` times there. */
const checkThreshold = async (canvasElement: HTMLElement, most: number) => {
  const { app, margin } = await findThreshold(canvasElement)
  for (const into of intoThreshold(scrollbarWidth())) {
    app.style.marginRight = `${margin + into}px`
    const { changes, settled } = await widthChanges(canvasElement, 60)
    expect(changes).toBeLessThanOrEqual(most)
    expect(settled).toBe(true)
  }
}

/** Opens the dialog over cards in the threshold and closes it, twice, and checks their width changes no more than `most` times. */
const checkDialog = async (canvasElement: HTMLElement, most: number) => {
  const canvas = within(canvasElement)
  const { app, margin } = await findThreshold(canvasElement)
  app.style.marginRight = `${margin + scrollbarWidth() / 2}px`
  await widthChanges(canvasElement, 30)
  for (let round = 0; round < 2; round++) {
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }))
    await within(document.body).findByRole('dialog', { name: 'A dialog' })
    const open = await widthChanges(canvasElement, 30)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    const closed = await widthChanges(canvasElement, 60)
    expect(open.changes + closed.changes).toBeLessThanOrEqual(most)
    expect(closed.settled).toBe(true)
  }
}

// Should something make the cards' width loop, it settles in a flip or two rather than flashing every frame
const settleCount = 4

export const AtTheThreshold: StoryObj = {
  name: 'Cards just too tall for the window keep their width (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  beforeEach: withShellGutter,
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    await checkThreshold(canvasElement, 0)
  },
}

export const WithoutTheGutter: StoryObj = {
  name: 'Cards just too tall for the window settle without the scrollbar gutter (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  beforeEach: withoutGutter,
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    expect(getComputedStyle(document.documentElement).scrollbarGutter).toBe('auto')
    await checkThreshold(canvasElement, settleCount)
  },
}

export const DialogAtTheThreshold: StoryObj = {
  name: 'A dialog over cards just too tall for the window keeps their width (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  beforeEach: withShellGutter,
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    await checkDialog(canvasElement, 0)
  },
}

export const DialogWithoutTheGutter: StoryObj = {
  name: 'A dialog over cards just too tall for the window settles without the scrollbar gutter (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  beforeEach: withoutGutter,
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    await checkDialog(canvasElement, settleCount)
  },
}
