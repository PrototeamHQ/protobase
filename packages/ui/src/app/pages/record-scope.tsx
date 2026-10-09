import { createContext, useContext, type ReactNode } from 'react'
import type { RecordPermissions } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'

/** The record a RecordCard, or one card of a CardRow, shows; Fields, Actions and forms inside it work on it. */
export type LayoutRecord = {
  model: ResourceModel
  record: Record<string, unknown>
  /** The key as the URL carries it. */
  key: string
  etag?: string
  permissions?: RecordPermissions
}

const RecordScopeContext = createContext<LayoutRecord | undefined>(undefined)

export const RecordScope = ({ value, children }: { value: LayoutRecord; children: ReactNode }) => <RecordScopeContext.Provider value={value}>{children}</RecordScopeContext.Provider>

/** The record around a custom component in a composed page, or `undefined` outside a RecordCard or CardRow. */
export const useLayoutRecord = () => useContext(RecordScopeContext)
