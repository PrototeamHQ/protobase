/**
 * Keeps a tool result within what a model's client takes: over the budget, its longest string values are trimmed, each
 * named in `cut_fields` with its full length, and a `note` says how to read the rest. A tool with a list returns fewer
 * items when trimming alone does not fit (see `leadingFit`).
 */

/** The characters of JSON one tool result may hold. */
export const resultBudget = 40_000

/** A trimmed string value: where it is in the result, such as `items[3].body`, and its full length. */
export type Cut = { field: string; length: number }

// Strings are trimmed to no fewer characters than this before a list returns fewer items.
const stringFloor = 500

// Tokens and etags are useless cut, and never long.
const neverCut = new Set(['next_page_token', 'etag'])

const pathOf = (path: string, key: string) => (path ? `${path}.${key}` : key)

const trimmed = (value: unknown, cap: number, path: string, cuts: Cut[]): unknown => {
  if (typeof value === 'string') {
    if (value.length <= cap) return value
    cuts.push({ field: path, length: value.length })
    return `${value.slice(0, cap)}…`
  }
  if (Array.isArray(value)) return value.map((item, index) => trimmed(item, cap, `${path}[${index}]`, cuts))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, !path && neverCut.has(key) ? item : trimmed(item, cap, pathOf(path, key), cuts)]))
  }
  return value
}

const longestString = (value: unknown): number => {
  if (typeof value === 'string') return value.length
  if (value !== null && typeof value === 'object') return Math.max(0, ...Object.values(value).map(longestString))
  return 0
}

const cutAt = (result: Record<string, unknown>, cap: number, note: string) => {
  const cuts: Cut[] = []
  const value = trimmed(result, cap, '', cuts) as Record<string, unknown>
  return JSON.stringify(cuts.length ? { ...value, cut_fields: cuts, note } : value)
}

/**
 * `result` as JSON within `budget`, its strings trimmed as little as fits but to no fewer than `floor` characters;
 * undefined when even that does not fit. `note` says how to read a cut field's rest.
 */
export const budgetedJson = (result: Record<string, unknown>, note: string, budget = resultBudget, floor = stringFloor) => {
  const json = JSON.stringify(result)
  if (json.length <= budget) return json
  // Plain JSON values from here on, such as a date as its text, so trimming sees what the model would.
  const plain = JSON.parse(json) as Record<string, unknown>
  let low = floor
  let high = longestString(plain)
  if (low >= high) return undefined
  if (cutAt(plain, low, note).length > budget) return undefined
  // The longest cap that fits, `low` fitting throughout.
  while (high - low > 1) {
    const cap = Math.floor((low + high) / 2)
    if (cutAt(plain, cap, note).length <= budget) low = cap
    else high = cap
  }
  return cutAt(plain, low, note)
}

/** `result` as JSON within `budget` if it can be, its strings trimmed down to nothing when they must; never undefined. */
export const forcedJson = (result: Record<string, unknown>, note: string, budget = resultBudget) =>
  budgetedJson(result, note, budget) ?? budgetedJson(result, note, budget, 0) ?? cutAt(JSON.parse(JSON.stringify(result)), 0, note)

/** The most leading items of `count`, at least 1, for which `fits` holds, `fits` holding for fewer when it does for more. */
export const leadingFit = (count: number, fits: (count: number) => boolean) => {
  let low = 1
  let high = count
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fits(middle)) low = middle
    else high = middle - 1
  }
  return low
}
