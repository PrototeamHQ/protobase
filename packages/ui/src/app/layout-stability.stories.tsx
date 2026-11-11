import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession, type Client } from '@protobase/client'
import { App } from './app'
import { overview } from './pages/guide/sales-steps/step-4'
import { salesResources, salesRows, salesViews } from './pages/guide/sales-domain'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Shell/Layout while loading', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

/** The client with every answer `ms` late, as over a phone's network, each call on its own clock as a server's would. */
const late = (client: Client, ms: number) =>
  Object.fromEntries(
    Object.entries(client).map(([name, call]) => [
      name,
      typeof call !== 'function'
        ? call
        : (...args: unknown[]) => {
            const answer = (call as (...args: unknown[]) => unknown)(...args)
            return answer instanceof Promise ? new Promise((resolve) => setTimeout(resolve, ms)).then(() => answer) : answer
          },
    ]),
  ) as unknown as Client

const Phone = ({ start }: { start: string }) => {
  const [client] = useState(() => late(fakeApi({ resources: salesResources, views: salesViews, pages: [overview.toModel()], rows: salesRows }).client, 300))
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={start} workspace="Veldhuis Supply" />
    </div>
  )
}

type LayoutShift = { value: number; startTime: number; hadRecentInput: boolean }

/**
 * Cumulative Layout Shift as browsers score it: the largest burst of shifts not caused by input, each burst ending at a
 * second's pause or after five seconds. The story's page opened with the story, so the buffer holds its whole load.
 */
const layoutShift = async (settleMs: number) => {
  await new Promise((resolve) => setTimeout(resolve, settleMs))
  // Layout shifts are not in the performance timeline's own lists: only a buffered observer reads them
  const shifts = await new Promise<LayoutShift[]>((resolve) => {
    const observer = new PerformanceObserver((list) => {
      observer.disconnect()
      resolve(list.getEntries() as unknown as LayoutShift[])
    })
    observer.observe({ type: 'layout-shift', buffered: true })
    setTimeout(() => {
      observer.disconnect()
      resolve([])
    }, 100)
  })
  let worst = 0
  let burst = 0
  let start = 0
  let previous = -Infinity
  for (const shift of shifts.filter((each) => !each.hadRecentInput)) {
    if (shift.startTime - previous > 1000 || shift.startTime - start > 5000) {
      burst = 0
      start = shift.startTime
    }
    burst += shift.value
    previous = shift.startTime
    worst = Math.max(worst, burst)
  }
  return worst
}

const steady = (start: string, ready: (canvasElement: HTMLElement) => Promise<unknown>): StoryObj => ({
  tags: ['play', 'touch', '!dev'],
  render: () => <Phone start={start} />,
  play: async ({ canvasElement }) => {
    await ready(canvasElement)
    expect(await layoutShift(1500)).toBeLessThan(0.05)
  },
})

/** A composed page of counts, a record card, tables and cards appears at once where it stays, at 390 px. */
export const ComposedPageChecks: StoryObj = {
  ...steady('/overview', (canvasElement) => within(canvasElement).findByText('Biggest unpaid delivery', {}, { timeout: 5000 })),
  tags: ['play', 'touch', '!dev'],
  name: 'A composed page does not shift as it loads (checks)',
}

/** A list in cards draws each card where it stays, at 390 px. */
export const ListChecks: StoryObj = {
  ...steady('/orders', (canvasElement) => within(canvasElement).findByText('SO-2041', {}, { timeout: 5000 })),
  tags: ['play', 'touch', '!dev'],
  name: 'A list does not shift as it loads (checks)',
}

/** A record page opened by its address shows a skeleton of its fields, then the record in its place, at 390 px. */
export const RecordChecks: StoryObj = {
  ...steady('/orders/1', (canvasElement) => within(canvasElement).findByRole('heading', { name: 'SO-2041' }, { timeout: 5000 })),
  tags: ['play', 'touch', '!dev'],
  name: 'A record page does not shift as it loads (checks)',
}
