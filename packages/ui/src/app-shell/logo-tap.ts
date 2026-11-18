/**
 * The event the shell dispatches on `window` when someone taps the logo at the top of the sidebar, Protobase's or a
 * plugin's `shell.logo`. It is cancelable: a listener that calls `preventDefault()` takes the tap, such as a host app that
 * opens its own switcher. The logo has no action of its own, so with nobody taking it nothing happens. A page shown in a
 * frame also posts `{ type: 'protobase:logo-tap' }` to the page that frames it.
 */
export const logoTapEvent = 'protobase:logo-tap'

/** Tells the page, and the page that frames it, that the logo was tapped; `true` when a listener took the tap. */
export const tellLogoTap = (page: Window = window) => {
  const taken = !page.dispatchEvent(new Event(logoTapEvent, { cancelable: true }))
  if (page.parent && page.parent !== page) page.parent.postMessage({ type: logoTapEvent }, '*')
  return taken
}
