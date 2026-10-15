const attribute = 'data-pb-scroll-locked'

/**
 * Stops the page scrolling behind a modal until the returned function is called. Where the page shows a scrollbar that
 * takes room, the page keeps that room meanwhile (`styles.css` reserves it for this attribute), so hiding the scrollbar
 * does not widen the page and move everything behind the modal sideways.
 */
export const lockPageScroll = () => {
  const { body, documentElement: root } = document
  const overflow = body.style.overflow
  const locked = root.hasAttribute(attribute)
  if (window.innerWidth > root.clientWidth) root.setAttribute(attribute, '')
  body.style.overflow = 'hidden'
  return () => {
    body.style.overflow = overflow
    if (!locked) root.removeAttribute(attribute)
  }
}
