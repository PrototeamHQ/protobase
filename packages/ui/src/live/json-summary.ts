import { text } from './messages'

/** The most characters a summary keeps; a table cell shows one line, so the rest would never show. */
export const summaryLength = 160

/** The most characters one value inside keeps, so one long value cannot hide the rest. */
export const valueLength = 40

const isPlain = (value: unknown) => value === null || typeof value !== 'object'

const cut = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

// A value inside another as a word: a text without its quotes, an empty one as "", a nested object or list only as a
// mark that it is there.
const inner = (value: unknown) => {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : '[…]'
  if (value !== null && typeof value === 'object') return Object.keys(value).length === 0 ? '{}' : '{…}'
  return value === '' ? '""' : cut(String(value), valueLength)
}

// Joins parts until the summary is full, so a large value costs no more than what shows.
const joined = (parts: Iterable<string>) => {
  let summary = ''
  for (const part of parts) {
    summary = summary === '' ? part : `${summary}, ${part}`
    if (summary.length > summaryLength) break
  }
  return cut(summary, summaryLength)
}

// The plain values first, then the nested ones, each in the value's own order: what a person scans for leads.
function* entries(value: object) {
  const record = value as Record<string, unknown>
  for (const key in record) if (isPlain(record[key])) yield `${key}: ${inner(record[key])}`
  for (const key in record) if (!isPlain(record[key])) yield `${key}: ${inner(record[key])}`
}

function* items(value: unknown[]) {
  for (const item of value) yield inner(item)
}

/**
 * A JSON value on one short line, as a table cell shows it: an object as its keys and their values, plain ones first
 * (`command: ls, env: {…}`), a list of plain values as those values and a list of objects or lists as its length;
 * nested objects and lists show as `{…}` and `[…]`, and each value inside is cut to 40 characters. The record page
 * shows the full value.
 */
export const jsonSummary = (value: unknown) => {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return value.every(isPlain) ? joined(items(value)) : text('jsonItems', { count: value.length })
  }
  if (value !== null && typeof value === 'object') return Object.keys(value).length === 0 ? '{}' : joined(entries(value))
  return cut(String(value), summaryLength)
}
