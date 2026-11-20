import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { Router, useRouter } from './router'

const meta = { title: 'Shell/Router back', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// The router the probe sees, read by the checks
let router: ReturnType<typeof useRouter> | undefined

const Probe = () => {
  router = useRouter()
  return <p>{router.path}</p>
}

const shown = (path: string) => waitFor(() => expect(router?.path).toBe(path))

// A step through the browser history, landed once the browser says so: the page may show the same path before and after
const traverse = (delta: number) =>
  new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
    window.history.go(delta)
  })

/**
 * On the real browser history: Back to a page is the browser's Back only where the entry behind is that page, which
 * each entry knows of itself; a page visited twice is never taken for the one behind after a jump of several steps, nor
 * an entry replaced since for the page it was.
 */
export const BackIsHistoryChecks: StoryObj = {
  name: 'Back is the browser Back only to the entry behind (checks)',
  tags: ['play', '!dev'],
  render: () => {
    window.history.replaceState(null, '', '/dashboard')
    return (
      <Router>
        <Probe />
      </Router>
    )
  },
  play: async () => {
    await shown('/dashboard')
    for (const path of ['/orders/1', '/orders', '/orders/1', '/orders']) {
      router!.navigate(path)
      await shown(path)
    }
    expect(router!.backIsHistory('/orders/1')).toBe(true)
    expect(router!.backIsHistory('/dashboard')).toBe(false)
    // Three steps back lands on the first /orders/1, whose entry behind is /dashboard, not /orders
    await traverse(-3)
    await shown('/orders/1')
    expect(router!.backIsHistory('/dashboard')).toBe(true)
    expect(router!.backIsHistory('/orders')).toBe(false)
    // One step back from the second /orders/1 is /orders
    await traverse(2)
    await shown('/orders/1')
    expect(router!.backIsHistory('/orders')).toBe(true)
    // The entry behind, replaced by another page since, leads back to that page
    await traverse(-1)
    router!.navigate('/customers', { replace: true })
    await shown('/customers')
    await traverse(1)
    await shown('/orders/1')
    expect(router!.backIsHistory('/orders')).toBe(false)
    expect(router!.backIsHistory('/customers')).toBe(true)
  },
}
