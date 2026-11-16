/** The id of the start screen index.html draws over the app until it has drawn its first page. */
export const startScreenId = 'pb-start'

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
