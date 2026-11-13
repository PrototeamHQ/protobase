import type { LiveUpdater } from './live-update-context'

/** Keeps the page the app shows for the release to return to, and forgets it again. */
export type PageKeeper = { keep: () => void; forget: () => void }

/**
 * Reloads into the release set next, keeping the page the app shows just before, so the release opens on it. False
 * when nothing is set next or the guard refuses the reload; the page kept for a reload that did not happen, refused or
 * failed, is forgotten again.
 */
export const applyOnPage = async (updater: Pick<LiveUpdater, 'applyNext'>, page: PageKeeper) => {
  let kept = false
  let applied = false
  try {
    applied = await updater.applyNext(() => {
      page.keep()
      kept = true
    })
  } finally {
    if (!applied && kept) page.forget()
  }
  return applied
}
