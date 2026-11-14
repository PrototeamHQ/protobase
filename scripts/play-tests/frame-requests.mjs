/**
 * The requests frames inside `page` send out, for a "sealed-frames" story. A request counts once it is issued, so one
 * still pending when the story ends counts too; one its Content-Security-Policy stopped (`csp`) never left, and a
 * `data:` URL is none. Returns a function that lists the counted requests' URLs.
 */
export const trackFrameRequests = (page) => {
  const issued = new Set()
  page.on('request', (request) => {
    if (request.frame() !== page.mainFrame() && !request.url().startsWith('data:')) issued.add(request)
  })
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'csp') issued.delete(request)
  })
  return () => [...issued].map((request) => request.url())
}
