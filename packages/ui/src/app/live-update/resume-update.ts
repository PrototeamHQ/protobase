import { applyAfterAwayMs, createAwayClock } from './away-clock'
import type { LiveUpdater } from './live-update-context'

export type ResumeUpdateInput = {
  updater: Pick<LiveUpdater, 'applyNext' | 'check'>
  /** Whether a guard holds unsaved changes, which a reload would lose. */
  holdsChanges: () => boolean
  /** Keeps the page the app shows for the release to return to, and forgets it again; none without storage. */
  page: { keep: () => void; forget: () => void } | undefined
  now?: () => number
}

/**
 * What the app does around the background: `leave()` as it goes, `back()` as it returns. Back after `applyAfterAwayMs`
 * or more, it reloads into a release it downloaded, on the page it showed, unless a guard holds unsaved changes or it
 * cannot keep the page; otherwise it checks for a release in the background.
 */
export const createResumeUpdate = ({ updater, holdsChanges, page, now }: ResumeUpdateInput) => {
  const clock = createAwayClock(now)
  return {
    leave: clock.leave,
    back: async () => {
      const away = clock.back()
      if (page && away >= applyAfterAwayMs && !holdsChanges()) {
        let kept = false
        const keep = () => {
          page.keep()
          kept = true
        }
        if (await updater.applyNext(keep)) return
        if (kept) page.forget()
      }
      await updater.check(false)
    },
  }
}
