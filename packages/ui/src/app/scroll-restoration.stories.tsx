import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from './app'
import { overview } from './pages/guide/sales-steps/step-4'
import { salesResources, salesRows, salesViews } from './pages/guide/sales-domain'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Shell/Scroll restoration', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const Sales = () => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views: salesViews, pages: [overview.toModel()], rows: salesRows }))
  return <App client={api.client} auth={session} workspace="Veldhuis Supply" />
}

const phone360 = { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }

const page = () => document.scrollingElement ?? document.documentElement
const index = () => (window.history.state as { protobaseIndex: number }).protobaseIndex
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/** Where the document is scrolled once the page at `path` is shown, after a frame for anything still moving it. */
const shownAt = async (path: string, top: number) => {
  await waitFor(() => expect(window.location.pathname).toBe(path))
  await frame()
  await waitFor(() => expect(Math.round(page().scrollTop)).toBe(top))
}

/** Waits until the page's height holds for a few frames, so no block still loading above moves the scroll position. */
const settled = async () => {
  let height = -1
  let still = 0
  while (still < 5) {
    await frame()
    still = page().scrollHeight === height ? still + 1 : 0
    height = page().scrollHeight
  }
}

/** Scrolls the page down to `wanted`, or as far as it goes when it is shorter; returns where it is. */
const scrollDown = async (wanted: number) => {
  await waitFor(() => expect(page().scrollHeight).toBeGreaterThan(window.innerHeight))
  await settled()
  page().scrollTop = wanted
  const top = Math.round(page().scrollTop)
  expect(top).toBeGreaterThan(0)
  return top
}

/**
 * On the real browser history: a page opened by a link starts at the top, a page already seen included; Back and
 * Forward bring each page back to where it was left; and the top bar's back button goes back in history when the page
 * before is where it leads, else opens that page at the top.
 */
export const ScrollRestorationChecks: StoryObj = {
  name: 'Each page starts at the top and comes back where it was left (checks)',
  tags: ['play', 'phone', '!dev'],
  parameters: { viewport: { options: { phone360 } } },
  globals: { viewport: { value: 'phone360' } },
  render: () => {
    window.history.replaceState({ protobaseIndex: 0 }, '', '/overview')
    return <Sales />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const main = () => canvasElement.querySelector('main')!
    const link = (href: string) => main().querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!
    const back = () => canvas.getByRole('link', { name: /^Back to/ })
    await canvas.findByRole('heading', { name: 'Sales overview' })

    const overviewTop = await scrollDown(700)
    await userEvent.click(link('/orders/3'))
    await shownAt('/orders/3', 0)
    const orderTop = await scrollDown(50)
    await waitFor(() => expect(main().querySelector('a[href="/companies/1"]')).not.toBeNull())
    await userEvent.click(link('/companies/1'))
    await shownAt('/companies/1', 0)
    const companyTop = await scrollDown(200)

    window.history.back()
    await shownAt('/orders/3', orderTop)
    window.history.back()
    await shownAt('/overview', overviewTop)
    window.history.forward()
    await shownAt('/orders/3', orderTop)
    window.history.forward()
    await shownAt('/companies/1', companyTop)

    // A page seen before, whose records show at once, starts at the top too
    window.history.go(-2)
    await shownAt('/overview', overviewTop)
    await userEvent.click(link('/orders/3'))
    await shownAt('/orders/3', 0)

    // The page before is the overview, not the orders the button leads to: it opens them, at the top
    await scrollDown(50)
    await userEvent.click(back())
    await shownAt('/orders', 0)
    const orders = index()

    // The page before is the orders: the button goes back to them, as the browser's Back does
    await scrollDown(150)
    await userEvent.click(await waitFor(() => link('/orders/3')))
    await shownAt('/orders/3', 0)
    await userEvent.click(back())
    await waitFor(() => expect(window.location.pathname).toBe('/orders'))
    expect(index()).toBe(orders)
    await waitFor(() => expect(page().scrollTop).toBeGreaterThan(100))
    window.history.forward()
    await shownAt('/orders/3', 0)
  },
}
