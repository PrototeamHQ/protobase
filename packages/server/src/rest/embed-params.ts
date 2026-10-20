import { parseFilter, type Filter } from './parse-filter'
import { parseOrder, type OrderTerm } from './parse-order'
import { embedKey, type SelectItem } from './parse-select'
import { restError } from './rest-error'
import { wholeNumber } from './whole-number'

/** The filters, order and range of one embed's rows, from the parameters under its path. */
export type EmbedParams = { filters: Filter[]; order: OrderTerm[]; range: { offset: number; limit?: number } }

/**
 * The embed path a parameter's key is under, and its own name: `comments.author.username` is `username` under
 * `comments.author`, `comments.not.or` is `not.or` under `comments`. A key outside any embed has no path. A JSON path's
 * keys may hold dots, so only the part before its first arrow is split.
 */
export const splitEmbedKey = (key: string): { path?: string; name: string } => {
  const arrow = key.indexOf('->')
  const head = arrow < 0 ? key : key.slice(0, arrow)
  const tail = arrow < 0 ? '' : key.slice(arrow)
  const segments = head.split('.')
  const own = segments.length >= 2 && segments.at(-2) === 'not' && /^(and|or)$/.test(segments.at(-1)!) ? 2 : 1
  if (segments.length <= own) return { name: key }
  return { path: segments.slice(0, -own).join('.'), name: segments.slice(-own).join('.') + tail }
}

/** The path of every embed of `select`, nested ones as `comments.author`, by the names they go by. */
const embedPaths = (select: readonly SelectItem[], prefix = ''): string[] =>
  select.flatMap((item) => {
    if (item.kind !== 'embed') return []
    const path = prefix + embedKey(item)
    return [path, ...embedPaths(item.select, `${path}.`)]
  })

/**
 * The parameters under an embed's path, by path: `comments.likes=gte.2` filters the comments, `comments.order`,
 * `comments.limit` and `comments.offset` sort and page them. A path no embed of `select` has is PGRST108.
 */
export const parseEmbedParams = (params: readonly [string, string][], select: readonly SelectItem[]) => {
  const known = new Set(embedPaths(select))
  const byPath = new Map<string, EmbedParams>()
  for (const [key, value] of params) {
    const { path, name } = splitEmbedKey(key)
    if (path === undefined) continue
    if (!known.has(path)) {
      const resource = path.split('.').at(-1)
      throw restError(400, 'PGRST108', `'${resource}' is not an embedded resource in this request`, null, `Verify that '${resource}' is included in the 'select' query parameter.`)
    }
    const embed = byPath.get(path) ?? { filters: [], order: [], range: { offset: 0 } }
    byPath.set(path, embed)
    if (name === 'order') embed.order = parseOrder(value)
    else if (name === 'limit') embed.range = { ...embed.range, limit: wholeNumber(key, value) }
    else if (name === 'offset') embed.range = { ...embed.range, offset: wholeNumber(key, value) }
    else embed.filters.push(parseFilter(name, value))
  }
  return byPath
}
