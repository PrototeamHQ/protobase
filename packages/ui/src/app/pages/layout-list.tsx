import { createContext, useContext, type ReactNode } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { Quiet } from './blocks/card-frame'
import { text } from './messages'

/**
 * The list a `ReferenceManyField`, `ReferenceArrayField`, `ArrayField` or `CardRow` puts around its children, as
 * react-admin's ListContext: records of `model`, or without one the items of a JSON list. A `RecordsIterator` draws its
 * children once per entry, and a `Table` without `resource` draws its records.
 */
export type LayoutList = {
  model?: ResourceModel
  items: readonly unknown[]
  /** Reads the next page into the same list, while there is one; absent when the list takes no more. */
  loadMore?: () => void
  loadingMore?: boolean
}

const LayoutListContext = createContext<LayoutList | undefined>(undefined)

/** Puts `value` around its children; `undefined` ends the list around them, as a record pushed inside it does. */
export const LayoutListScope = ({ value, children }: { value: LayoutList | undefined; children: ReactNode }) => <LayoutListContext.Provider value={value}>{children}</LayoutListContext.Provider>

/** The list around an element, or `undefined` outside one. */
export const useLayoutList = () => useContext(LayoutListContext)

type ReadState = { isPending: boolean; error: Error | null }

/**
 * A read list's children: a skeleton while it loads, the error when it fails, `empty` when it holds nothing and names
 * it, else its children in the list's context, as react-admin's ReferenceManyField does, and a button that reads the
 * next page when it takes more.
 */
export const ListBody = ({ read, list, empty, children }: { read: ReadState; list: LayoutList; empty?: string; children: ReactNode }) => {
  if (read.isPending) return <Skeleton className="h-4 w-full" />
  if (read.error) return <ErrorBanner title={text('couldNotLoad')} error={read.error} />
  if (list.items.length === 0 && empty !== undefined) return <Quiet>{empty}</Quiet>
  return (
    <LayoutListScope value={list}>
      {children}
      {list.loadMore && (
        <Button size="sm" onClick={list.loadMore} loading={list.loadingMore} className="self-start">
          {text('loadMore')}
        </Button>
      )}
    </LayoutListScope>
  )
}
