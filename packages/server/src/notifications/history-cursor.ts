import { badRequest } from '../problem'
import { historyIdPattern, type HistoryPosition } from './history'

const base64url = /^[A-Za-z0-9_-]{1,200}$/

/** The cursor of the page after `position`: its time and id as base64url JSON, nothing of the user or the page size. */
export const historyCursor = (position: HistoryPosition) => Buffer.from(JSON.stringify({ t: position.createdAt.getTime(), i: position.id })).toString('base64url')

const refused = () => badRequest('invalid-cursor', 'The cursor is not one a history page gave')

// The JSON the cursor holds, or `undefined` when it is none.
const decoded = (cursor: string) => {
  if (!base64url.test(cursor)) return undefined
  const bytes = Buffer.from(cursor, 'base64url')
  // Only the cursor `historyCursor` writes: no padding, no other spelling of the same bytes.
  if (bytes.toString('base64url') !== cursor) return undefined
  const text = bytes.toString('utf8')
  if (!text.startsWith('{')) return undefined
  return JSON.parse(text) as unknown
}

/** The position a cursor holds, or a 400 that says nothing of what was wrong with it: exactly a time and an entry id. */
export const historyPosition = (cursor: string): HistoryPosition => {
  let value: unknown
  try {
    value = decoded(cursor)
  } catch (error) {
    if (error instanceof SyntaxError) throw refused()
    throw error
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw refused()
  const keys = Object.keys(value).sort()
  const { t, i } = value as { t?: unknown; i?: unknown }
  if (keys.join() !== 'i,t' || !Number.isSafeInteger(t) || (t as number) < 0 || typeof i !== 'string' || !historyIdPattern.test(i)) throw refused()
  const createdAt = new Date(t as number)
  if (Number.isNaN(createdAt.getTime())) throw refused()
  return { createdAt, id: i }
}
