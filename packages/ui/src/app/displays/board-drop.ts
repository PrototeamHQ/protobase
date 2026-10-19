import type { Client } from '@protobase/client'
import type { KeyValue } from '@protobase/schema'

/** What a board drop's write gets: the card's record as listed, its key and ETag, the column it was dropped on, and the API. */
export type BoardDropContext = {
  resource: string
  record: Record<string, unknown>
  /** The record's key as the API takes it. */
  recordKey: KeyValue | readonly KeyValue[]
  etag: string
  /** The value of the column the card was dropped on. */
  to: string
  client: Client
}

/** What undoes a board drop's write, such as deleting the record it created. */
export type BoardDropUndo = () => Promise<void>

/** A board drop's write for one column: what it saves in place of the record's `by`, and what undoes it, when it can be undone. */
export type BoardDropWrite = (context: BoardDropContext) => Promise<BoardDropUndo | void>

/**
 * How cards move between a board's columns, a view's `drag.board` naming it: by the value of each column that takes a
 * card, what a drop there writes, such as creating a record of a related resource when `by` is computed from them. A
 * card in or dropped on any other column stays in its column, as does one dropped on the column of records without a
 * value.
 */
export type BoardDrop = Record<string, BoardDropWrite>

/** The write a drop on the column of `value` performs, if that column takes cards. */
export const dropWrite = (drop: BoardDrop, value: string | null) => (value !== null && Object.hasOwn(drop, value) ? drop[value] : undefined)
