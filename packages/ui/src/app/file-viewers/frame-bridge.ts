/** The attribute an `HtmlFrame` page's link carries, the index of its target in the frame's `links`. */
export const linkAttribute = 'data-protobase-link'

/**
 * The script an `HtmlFrame` runs in its page, the only one a page it does not trust runs. A click on a link carrying
 * `linkAttribute` posts its index to the app, with whether it asks for a new tab. A click on a link to a place on the
 * page (`#results`) moves the focus there and posts how far down the page it is, since the app's page scrolls rather
 * than the frame. A
 * click on any other link does nothing, so the page never leaves the frame. It also posts the page's height, so the
 * frame grows with it.
 */
export const frameBridge = `(() => {
  const post = (message) => parent.postMessage({ protobase: 'html-frame', ...message }, '*')
  const place = (hash) => {
    const name = decodeURIComponent(hash.slice(1))
    const target = name === '' || name === 'top' ? null : document.getElementById(name) ?? document.getElementsByName(name)[0]
    if (!target) return 0
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    return target.getBoundingClientRect().top + window.scrollY
  }
  const follow = (event) => {
    const link = event.target instanceof Element ? event.target.closest('a, area') : null
    if (!link) return
    event.preventDefault()
    const index = link.getAttribute('${linkAttribute}')
    const href = link.getAttribute('href') ?? ''
    if (index !== null) post({ link: Number(index), newTab: event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey })
    else if (href.startsWith('#') && event.button === 0) post({ scroll: place(href) })
  }
  document.addEventListener('click', follow, true)
  document.addEventListener('auxclick', (event) => event.button === 1 && follow(event), true)
  const height = () => post({ height: document.documentElement.getBoundingClientRect().height })
  new ResizeObserver(height).observe(document.documentElement)
})()`
