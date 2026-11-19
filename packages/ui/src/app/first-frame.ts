import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { guarded } from '../lib/guarded'

/** The session flag that makes the app show its first frame and stop there, for the one-frame test. */
export const firstFrameFlag = 'protobase:first-frame'

/** Whether this tab asked for its first frame alone (`firstFrameFlag` in its session storage). */
export const judgesFirstFrame = (page: Pick<Window, 'sessionStorage'>) => guarded(() => page.sessionStorage.getItem(firstFrameFlag) === '1', false)

/**
 * The first frame the app draws, frozen: one synchronous render and commit, its markup kept, the app unmounted, which
 * ends its timers, subscriptions and pending updates, and the markup put back. What shows is all the first commit drew
 * from what the app had before it rendered, such as the start cache.
 */
export const showFirstFrame = (container: HTMLElement, app: ReactNode) => {
  const root = createRoot(container)
  flushSync(() => root.render(app))
  const frozen = container.innerHTML
  root.unmount()
  container.innerHTML = frozen
  container.dataset['firstFrame'] = 'frozen'
}
