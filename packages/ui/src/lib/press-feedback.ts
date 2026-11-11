/**
 * Lets the pressed look in `press.css` show on iOS, whose WebKit applies `:active` on touch only while a touch listener
 * is on the page. The listener does nothing and is passive, so scrolling never waits for it.
 */
export const listenForPresses = (doc: Document) => doc.addEventListener('touchstart', noop, { passive: true })

const noop = () => {}
