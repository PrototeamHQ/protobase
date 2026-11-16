/** The id of the start screen index.html draws over the app until it has drawn its first page. */
export const startScreenId = 'pb-start'

/**
 * Takes away the start screen of index.html, which covers the app from the first paint, so the first page the app drew
 * under it shows in its place with no frame between them. Nothing on a page without one, such as a story.
 */
export const removeStartScreen = (document: Pick<Document, 'getElementById'>) => document.getElementById(startScreenId)?.remove()
