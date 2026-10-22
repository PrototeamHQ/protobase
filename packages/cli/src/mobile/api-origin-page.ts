import { apiOriginMeta } from '@protobase/schema/internal'

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The page naming the API origin the shell calls, in the `<meta>` tag the shell reads (see `apiOriginMeta`). */
export const withApiOrigin = (html: string, origin: string) => {
  const at = html.indexOf('</head>')
  if (at < 0) throw new Error('The shell\'s index.html has no </head> to name the API origin in')
  return `${html.slice(0, at)}<meta name="${apiOriginMeta}" content="${escapeAttribute(origin)}">${html.slice(at)}`
}
