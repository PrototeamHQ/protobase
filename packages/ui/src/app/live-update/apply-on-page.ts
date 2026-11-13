import type { LiveUpdater } from './live-update-context'

/** Keeps the page the app shows for the release to return to, and forgets it again. */
export type PageKeeper = { keep: () => void; forget: () => void }

/**
 * Reloads into the release set next, keeping the page the app shows just before, so the release opens on it. False
 * when nothing is set next or the guard refuses the reload, and the page kept for it is then forgotten again.
 */
export const applyOnPage = async (updater: Pick<LiveUpdater, 'applyNext'>, page: PageKeeper) => {
  let kept = false
  const applied = await updater.applyNext(() => {
    page.keep()
    kept = true
  })
  if (!applied && kept) page.forget()
  return applied
}
