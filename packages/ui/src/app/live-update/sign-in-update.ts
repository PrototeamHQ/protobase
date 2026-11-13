import { applyOnPage, type PageKeeper } from './apply-on-page'
import type { LiveUpdater } from './live-update-context'

/**
 * How long a sign-in waits for the server's release. Past it the app opens on the files it runs, and the download goes
 * on in the background, set next for a later start or return.
 */
export const signInUpdateLimitMs = 20_000

/**
 * Right after a sign-in, before the app opens: takes the server's release and reloads into the one set next, on the
 * page the app shows, as a fresh sign-in holds no work to lose. True when it reloads; without storage to keep the page,
 * or once `signInUpdateLimitMs` passes, it only takes the release, as coming back does.
 */
export const updateAfterSignIn = async (updater: Pick<LiveUpdater, 'applyNext' | 'check'>, page: PageKeeper | undefined) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), signInUpdateLimitMs)
  })
  const checked = updater.check()
  const inTime = await Promise.race([checked.then(() => true), late]).finally(() => clearTimeout(timer))
  if (!inTime) {
    // The race handled the check's outcome: a failure after the limit is reported unhandled, as a background check's is
    void checked.then(() => undefined)
    return false
  }
  if (!page) return false
  return applyOnPage(updater, page)
}
