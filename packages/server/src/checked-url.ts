/** `url` without a trailing slash; anything but an http(s) URL stops the server, naming `source`. */
export const checkedUrl = (url: string, source: string) => {
  if (!URL.canParse(url)) throw new Error(`${source} is not a URL; use https://...`)
  const { protocol } = new URL(url)
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`${source} must start with https:// or http://, not ${protocol}//`)
  return url.replace(/\/+$/, '')
}
