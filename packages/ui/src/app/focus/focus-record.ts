import { createContext, useContext } from 'react'
import type { RecordPermissions } from '@protobase/client'
import type { AppAddress, ResourceModel } from '@protobase/schema'

/**
 * The record a focus page edits, for what draws its surface: its draft, which the bar's Save writes, and whether the
 * page shows it to change. `save` resolves to whether it saved.
 */
export type FocusRecord = {
  model: ResourceModel
  record: Record<string, unknown>
  key: string
  etag?: string
  permissions?: RecordPermissions
  /** The record cannot be changed here: by permission, or as the address shows an earlier version. */
  readOnly: boolean
  /** The person may change the record, whichever version the address shows. */
  mayUpdate: boolean
  /** The draft of a field. */
  value: (name: string) => unknown
  change: (name: string, value: unknown) => void
  dirty: boolean
  saving: boolean
  /** The last save was refused, which the page's notice says. */
  refused: boolean
  save: () => Promise<boolean>
  discard: () => void
  /** The record's standard form, as `Open details` links to it. */
  details: AppAddress
}

export const FocusRecordContext = createContext<FocusRecord | undefined>(undefined)

/** The record of the focus page around the caller, or `undefined` on a focus page or any page that holds no record. */
export const useFocusRecord = () => useContext(FocusRecordContext)
