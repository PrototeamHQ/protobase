/** The id of the start screen index.html draws over the app until it has drawn its first page. */
export const startScreenId = 'pb-start'

/**
 * The empty element on the start screen a host may fill, as it serves index.html, with the markup of the page the app
 * showed last, for example the official app on a switch back to a workspace. It then shows in place of the spinner,
 * inert, until the app has drawn its first page with its first data, so the screen changes once. A plain string
 * replace of exactly this text fills it; with nothing in it the start is as before.
 */
export const snapshotPlaceholder = '<div id="pb-snapshot"></div>'

/** Whether the start screen shows a host's snapshot (`snapshotPlaceholder` filled). */
export const startsFromSnapshot = (document: Pick<Document, 'getElementById'>) => (document.getElementById('pb-snapshot')?.childNodes.length ?? 0) > 0

/** The event the app fires at the start screen as it takes it away, which ends index.html's watch for a failed start. */
export const startScreenHandOff = 'pb-start-hand-off'

/**
 * Takes away the start screen of index.html, which covers the app from the first paint, so the first page the app drew
 * under it shows in its place with no frame between them; a failed start's message goes with it. Nothing on a page
 * without one, such as a story.
 */
export const removeStartScreen = (document: Pick<Document, 'getElementById'>) => {
  const start = document.getElementById(startScreenId)
  if (!start) return
  start.dispatchEvent(new Event(startScreenHandOff))
  start.remove()
}
