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

/** A record of the stack, with its place among its rows when it is one card of a CardRow. */
export type ScopeFrame = LayoutRecord & { row?: { index: number; count: number } }

const RecordScopeContext = createContext<LayoutRecord | undefined>(undefined)

const ScopeStackContext = createContext<readonly ScopeFrame[]>([])

/** Puts `value` around its children, on top of the records already around them. */
export const RecordScope = ({ value, row, children }: { value: LayoutRecord; row?: ScopeFrame['row']; children: ReactNode }) => {
  const below = useContext(ScopeStackContext)
  const index = row?.index
  const count = row?.count
  const stack = useMemo(() => [...below, index === undefined || count === undefined ? value : { ...value, row: { index, count } }], [below, value, index, count])
  return (
    <ScopeStackContext.Provider value={stack}>
      <RecordScopeContext.Provider value={value}>{children}</RecordScopeContext.Provider>
    </ScopeStackContext.Provider>
  )
}

/** The record around a custom component in a composed page, or `undefined` outside a RecordCard or CardRow. */
export const useLayoutRecord = () => useContext(RecordScopeContext)

/** Every record around an element, outermost first. */
export const useScopeStack = () => useContext(ScopeStackContext)

/** The records around an element as the layout's fillers read them. */
export const valueScopeOf = (stack: readonly ScopeFrame[]): ValueScope => ({ stack: stack.map((frame) => ({ record: frame.record, ...(frame.row && { row: frame.row }) })) })

/**
 * The record a field path reads from, by the Mustache lookup: a bare name's first part from the nearest record whose
 * resource has that field, `../` and `this.` from one record; and the path from there. `undefined` for a data variable
 * or a path that is none.
 */
export const frameFor = (stack: readonly ScopeFrame[], path: string): { frame: LayoutRecord; path: string } | undefined => {
  const parsed = parseTemplatePath(path)
  if (!parsed || parsed.kind === 'data' || parsed.names.length === 0) return
  const rest = parsed.names.join('.')
  if (parsed.explicit) {
    const frame = stack[stack.length - 1 - parsed.up]
    return frame && { frame, path: rest }
  }
  const frame = stack.findLast((entry) => Object.hasOwn(entry.model.fields, parsed.names[0]!)) ?? stack.at(-1)
  return frame && { frame, path: rest }
}
