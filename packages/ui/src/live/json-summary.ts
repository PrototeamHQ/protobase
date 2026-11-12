import { text } from './messages'

/** The most characters a summary keeps; a table cell shows one line, so the rest would never show. */
export const summaryLength = 160

const isPlain = (value: unknown) => value === null || typeof value !== 'object'

// A value inside another as a word: a text without its quotes, a nested object or list only as a mark that it is there.
const inner = (value: unknown) => {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : '[…]'
  if (value !== null && typeof value === 'object') return Object.keys(value).length === 0 ? '{}' : '{…}'
  return String(value)
}

const cut = (summary: string) => (summary.length > summaryLength ? `${summary.slice(0, summaryLength - 1)}…` : summary)

// Joins parts until the summary is full, so a large value costs no more than what shows.
const joined = (parts: Iterable<string>) => {
  let summary = ''
  for (const part of parts) {
    summary = summary === '' ? part : `${summary}, ${part}`
    if (summary.length > summaryLength) break
  }
  return cut(summary)
}

function* entries(value: object) {
  for (const key in value) yield `${key}: ${inner((value as Record<string, unknown>)[key])}`
}

function* items(value: unknown[]) {
  for (const item of value) yield inner(item)
}

/**
 * A JSON value on one short line, as a table cell shows it: an object as its keys and their values (`command: ls,
 * cwd: /tmp`), a list of plain values as those values and a list of objects or lists as its length; nested objects and
 * lists show as `{…}` and `[…]`. The record page shows the full value.
 */
export const jsonSummary = (value: unknown) => {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return value.every(isPlain) ? joined(items(value)) : text('jsonItems', { count: value.length })
  }
  if (value !== null && typeof value === 'object') return Object.keys(value).length === 0 ? '{}' : joined(entries(value))
  return cut(String(value))
}
