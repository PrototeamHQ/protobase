import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
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
