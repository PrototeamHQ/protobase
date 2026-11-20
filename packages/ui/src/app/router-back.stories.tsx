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

/**
 * On the real browser history: Back to a page is the browser's Back only where the entry behind is that page, which
 * each entry knows of itself; a page visited twice is never taken for the one behind after a jump of several steps.
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
    window.history.go(-3)
    await shown('/orders/1')
    expect(router!.backIsHistory('/dashboard')).toBe(true)
    expect(router!.backIsHistory('/orders')).toBe(false)
    // One step back from the second /orders/1 is /orders
    window.history.go(2)
    await shown('/orders/1')
    expect(router!.backIsHistory('/orders')).toBe(true)
  },
}
