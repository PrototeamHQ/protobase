import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { RecordPermissions } from '@protobase/client'
import type { ValueScope } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { parseTemplatePath } from '@protobase/schema/internal'

/** The record a RecordCard, or one card of a CardRow, shows; Fields, Actions and forms inside it work on it. */
export type LayoutRecord = {
  model: ResourceModel
  record: Record<string, unknown>
  /** The key as the URL carries it. */
  key: string
  etag?: string
  permissions?: RecordPermissions
}

/** An item of an `ArrayField`'s JSON list, which no model describes: an object read by key, or a text read as `this`. */
export type ItemFrame = { item: unknown }

/** A record or an item of the stack, with its place among its rows when it is one card of a CardRow or RecordsIterator. */
export type ScopeFrame = (LayoutRecord | ItemFrame) & { row?: { index: number; count: number } }

const isItem = (frame: LayoutRecord | ItemFrame): frame is ItemFrame => 'item' in frame

const RecordScopeContext = createContext<LayoutRecord | undefined>(undefined)

const ScopeStackContext = createContext<readonly ScopeFrame[]>([])

/**
 * Puts `value` around its children, on top of the records already around them. An item is no record a form or action
 * can work on, so inside one `useLayoutRecord` gives none.
 */
export const RecordScope = ({ value, row, children }: { value: LayoutRecord | ItemFrame; row?: ScopeFrame['row']; children: ReactNode }) => {
  const below = useContext(ScopeStackContext)
  const index = row?.index
  const count = row?.count
  const stack = useMemo(() => [...below, index === undefined || count === undefined ? value : { ...value, row: { index, count } }], [below, value, index, count])
  return (
    <ScopeStackContext.Provider value={stack}>
      <RecordScopeContext.Provider value={isItem(value) ? undefined : value}>{children}</RecordScopeContext.Provider>
    </ScopeStackContext.Provider>
  )
}

/** The record around a custom component in a composed page, or `undefined` outside a RecordCard or CardRow. */
export const useLayoutRecord = () => useContext(RecordScopeContext)

/** Every record around an element, outermost first. */
export const useScopeStack = () => useContext(ScopeStackContext)

/** The records around an element as the layout's fillers read them. */
export const valueScopeOf = (stack: readonly ScopeFrame[]): ValueScope => ({ stack: stack.map((frame) => ({ record: isItem(frame) ? frame.item : frame.record, ...(frame.row && { row: frame.row }) })) })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// The rest of a path in an item, from the value its first name found only
const readItem = (item: unknown, names: string[]) => names.reduce<unknown>((at, name) => (isObject(at) && Object.hasOwn(at, name) ? at[name] : undefined), item)

/** Where a path reads: a record's field, which may go on through relations, or the value an item holds there. */
export type PathSource = { frame: LayoutRecord; path: string } | { item: unknown }

/**
 * The record a field path reads from, by the Mustache lookup: a bare name's first part from the nearest record whose
 * resource has that field, or item that holds that key, `../` and `this.` from one; and the path from there. An item
 * gives the value itself, `this` alone too. `undefined` for a data variable or a path that is none.
 */
export const frameFor = (stack: readonly ScopeFrame[], path: string): PathSource | undefined => {
  const parsed = parseTemplatePath(path)
  if (!parsed || parsed.kind === 'data') return
  const at = (frame: ScopeFrame | undefined): PathSource | undefined => {
    if (!frame) return
    if (isItem(frame)) return { item: readItem(frame.item, parsed.names) }
    return parsed.names.length === 0 ? undefined : { frame, path: parsed.names.join('.') }
  }
  if (parsed.explicit) return at(stack[stack.length - 1 - parsed.up])
  const first = parsed.names[0]!
  return at(stack.findLast((entry) => (isItem(entry) ? isObject(entry.item) && Object.hasOwn(entry.item, first) : Object.hasOwn(entry.model.fields, first))) ?? stack.at(-1))
}
