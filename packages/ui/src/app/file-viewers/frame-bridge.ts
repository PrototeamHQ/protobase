/** The attribute an `HtmlFrame` page's link carries, the index of its target in the frame's `links`. */
export const linkAttribute = 'data-protobase-link'

/**
 * The script an `HtmlFrame` runs in its page, the only one a page it does not trust runs. A click on a link carrying
 * `linkAttribute` posts its index to the app, with whether it asks for a new tab; a click on any other link, but one to
 * a place on the page (`#top`), does nothing, so the page never leaves the frame. It also posts the page's height, so
 * the frame grows with it and the app's page scrolls instead of the frame.
 */
export const frameBridge = `(() => {
  const post = (message) => parent.postMessage({ protobase: 'html-frame', ...message }, '*')
  const follow = (event) => {
    const link = event.target instanceof Element ? event.target.closest('a, area') : null
    if (!link) return
    const index = link.getAttribute('${linkAttribute}')
    if (index === null && (link.getAttribute('href') ?? '').startsWith('#')) return
    event.preventDefault()
    if (index !== null) post({ link: Number(index), newTab: event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey })
  }
  document.addEventListener('click', follow, true)
  document.addEventListener('auxclick', (event) => event.button === 1 && follow(event), true)
  const height = () => post({ height: document.documentElement.getBoundingClientRect().height })
  new ResizeObserver(height).observe(document.documentElement)
})()`
