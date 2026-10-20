import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView } from '../../../../../docs-examples/bike-shop/step-5'
import { repairsView } from '../../../../../docs-examples/reference/workshop'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Scrolling', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const total = 2_000
const manyRepairs = Array.from({ length: total }, (_, index) => ({ ...repairRows[index % repairRows.length]!, id: index + 1, number: `R-${String(1001 + index)}` }))

const Shop = ({ start }: { start: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: manyRepairs } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

// Every wheel and touch listener added while the story renders and plays, with whether it may block scrolling
const blocking: string[] = []
const recordListeners = () => {
  const add = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    const passive = typeof options === 'object' && options.passive === true
    if (/^(wheel|mousewheel|touchstart|touchmove)$/.test(type) && !passive) blocking.push(type)
    add.call(this, type, listener, options)
  }
  return () => {
    EventTarget.prototype.addEventListener = add
  }
}

const page = () => document.scrollingElement ?? document.documentElement

/**
 * The list scrolls the page natively: the page is as tall as every row, only the rows in view and a few more are in
 * the DOM, nothing listens for wheel or touch in a way that can hold scrolling up, and a drawn row moves with the
 * scroll position at once, before anything draws again.
 */
const checkScrolling = async (canvasElement: HTMLElement, items: () => HTMLElement[], rowHeight: number) => {
  await waitFor(() => expect(items().length).toBeGreaterThan(0))
  expect(page().scrollHeight).toBeGreaterThan(total * rowHeight)
  expect(blocking).toEqual([])
  expect(items().length).toBeLessThan(60)

  const row = items().find((item) => item.getBoundingClientRect().top > 0)!
  const before = row.getBoundingClientRect().top
  page().scrollTop += 40
  expect(row.getBoundingClientRect().top).toBeCloseTo(before - 40, 0)

  // Far down, the rows drawn are the ones in view
  page().scrollTop = (total / 2) * rowHeight
  await waitFor(() => expect(items().some((item) => Math.abs(item.getBoundingClientRect().top) < window.innerHeight)).toBe(true))
  expect(items().length).toBeLessThan(60)
  expect(items().every((item) => Math.abs(item.getBoundingClientRect().top) < 3 * window.innerHeight)).toBe(true)
  expect(within(canvasElement).queryByText(/ of 2,000/)).toBeNull()
}

const phone360 = { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }

export const CardsOnPhoneChecks: StoryObj = {
  name: 'Cards on a phone scroll the page (checks)',
  tags: ['play', 'phone', '!dev'],
  parameters: { viewport: { options: { phone360 } } },
  globals: { viewport: { value: 'phone360' } },
  beforeEach: () => {
    blocking.length = 0
    return recordListeners()
  },
  render: () => <Shop start="/repairs?display=cards" />,
  play: async ({ canvasElement }) => {
    // A card is at least its picture-less height
    await checkScrolling(canvasElement, () => [...canvasElement.querySelectorAll<HTMLElement>('li[aria-posinset]')], 44)
  },
}

export const TableChecks: StoryObj = {
  name: 'The table scrolls the page (checks)',
  tags: ['play', '!dev'],
  beforeEach: () => {
    blocking.length = 0
    return recordListeners()
  },
  render: () => <Shop start="/repairs?display=table" />,
  play: async ({ canvasElement }) => {
    const grid = await within(canvasElement).findByRole('grid')
    await checkScrolling(canvasElement, () => [...grid.querySelectorAll<HTMLElement>('[role=row]')].slice(1), 36)
    // The header stays below the top bar
    const header = grid.querySelector<HTMLElement>('[role=row]')!
    expect(header.getBoundingClientRect().top).toBeCloseTo(canvasElement.querySelector('header')!.getBoundingClientRect().bottom, 0)
  },
}


// The repairs open on `display` when the address names none, as the breadcrumb's link to them does
const opening = (display: string) => {
  const view = repairsView.toModel()
  return { ...view, list: { ...view.list!, default: display } }
}

const OnHistory = ({ display }: { display: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), opening(display)], rows: { customers: customerRows, repairs: manyRepairs } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} workspace="Pip's bike shop" />
    </div>
  )
}

/** Uses the real browser history, on the repairs shown as `display`. */
const renderOnHistory = (display: string) => () => {
  window.history.replaceState({ protobaseIndex: 0 }, '', '/repairs')
  return <OnHistory display={display} />
}

// The first item whose top is in view below the top bar, and how far below it
const firstInView = (canvasElement: HTMLElement, items: () => HTMLElement[]) => {
  const below = canvasElement.querySelector('header')!.getBoundingClientRect().bottom
  const item = items().find((each) => each.getBoundingClientRect().top >= below - 1)
  return item && { text: item.textContent, below: Math.round(item.getBoundingClientRect().top - below) }
}

/**
 * Scrolled far down, the list opens the record in view, comes back through `back`, and shows the same item at the same
 * height.
 */
const checkComingBack = async (canvasElement: HTMLElement, items: () => HTMLElement[], back: () => Promise<void>) => {
  const canvas = within(canvasElement)
  await waitFor(() => expect(items().length).toBeGreaterThan(0))
  page().scrollTop = 20_000
  await waitFor(() => expect(firstInView(canvasElement, items)?.text).toMatch(/R-\d+/))
  const left = firstInView(canvasElement, items)!
  const opened = items().find((item) => item.textContent === left.text)!
  await userEvent.click(opened.querySelector('a[href]')!)
  await canvas.findByRole('heading', { level: 1, name: /^R-/ })
  await back()
  await waitFor(() => expect(firstInView(canvasElement, items)).toEqual(left))
}

export const CardsComeBackChecks: StoryObj = {
  name: 'Cards come back to where they were left on Back (checks)',
  tags: ['play', '!dev'],
  render: renderOnHistory('cards'),
  play: async ({ canvasElement }) => {
    await checkComingBack(canvasElement, () => [...canvasElement.querySelectorAll<HTMLElement>('li[aria-posinset]')], async () => window.history.back())
  },
}

export const TableComesBackChecks: StoryObj = {
  name: 'The table comes back to where it was left by a link (checks)',
  tags: ['play', '!dev'],
  render: renderOnHistory('table'),
  play: async ({ canvasElement }) => {
    const breadcrumb = () => within(within(canvasElement).getByRole('navigation', { name: 'Breadcrumb' }))
    await checkComingBack(canvasElement, () => [...canvasElement.querySelectorAll<HTMLElement>('[role=grid] [role=row]')].slice(1), async () => userEvent.click(breadcrumb().getByRole('link', { name: 'Repairs' })))
  },
}
