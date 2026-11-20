/**
 * The event the shell dispatches on `window` once the person has signed out, for a host app around the page, such as
 * one that keeps a list of apps and their sessions and drops the app signed out of, so that reopening it does not sign
 * them back in. A page shown in a frame also posts `{ type: 'protobase:signed-out' }` to the page that frames it.
 */
export const signedOutEvent = 'protobase:signed-out'

/** Tells the page, and the page that frames it, that the person signed out. */
export const tellSignedOut = (page: Window = window) => {
  page.dispatchEvent(new Event(signedOutEvent))
  if (page.parent && page.parent !== page) page.parent.postMessage({ type: signedOutEvent }, '*')
}
