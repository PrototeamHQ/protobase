import { applyOnPage, type PageKeeper } from './apply-on-page'
import type { LiveUpdater } from './live-update-context'

/**
 * Right after a sign-in, before the app opens: takes the server's release and reloads into the one set next, on the
 * page the app shows, as a fresh sign-in holds no work to lose. True when it reloads; without storage to keep the page
 * it only takes the release, as coming back does.
 */
export const updateAfterSignIn = async (updater: Pick<LiveUpdater, 'applyNext' | 'check'>, page: PageKeeper | undefined) => {
  await updater.check()
  if (!page) return false
  return applyOnPage(updater, page)
}
