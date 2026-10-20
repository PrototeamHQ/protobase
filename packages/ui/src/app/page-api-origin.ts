import { apiOriginMeta } from '@protobase/schema/internal'

/**
 * The API origin the page's `<meta name="protobase-api-origin">` tags name: `undefined` without one. Anything but one
 * tag holding exactly an http or https origin, such as `https://shop.example.com`, is an error.
 */
export const apiOriginOf = (contents: string[]) => {
  if (contents.length === 0) return undefined
  if (contents.length > 1) throw new Error(`The page has ${contents.length} ${apiOriginMeta} meta tags; it may have one`)
  const value = contents[0]!
  const url = URL.canParse(value) ? new URL(value) : undefined
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== value) {
    throw new Error(`The page's ${apiOriginMeta} meta tag holds "${value}", which is not an http or https origin such as https://shop.example.com`)
  }
  return value
}

/** The API origin this page names in its `<meta name="protobase-api-origin">` (see `apiOriginOf`). */
export const pageApiOrigin = () =>
  apiOriginOf([...document.querySelectorAll<HTMLMetaElement>(`meta[name="${apiOriginMeta}"]`)].map((meta) => meta.content))
