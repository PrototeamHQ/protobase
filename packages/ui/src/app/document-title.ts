import { useEffect } from 'react'
import type { CurrentAddress } from './current-address'
import { text as createText } from './create/messages'

export type TitleInput = {
  /** The address the app shows; none at the root. */
  address: CurrentAddress | undefined
  /** The composed page being shown, when the address is one. */
  page?: { title: string }
  /** The app's own page being shown, such as "Sign-in & security". */
  accountPage?: string
  /** The resource's plural name, for example "Companies". */
  resourceLabel?: string
  /** The resource's singular name, for example "Company". */
  singular?: string
  /** The open record's title. */
  recordTitle?: string
  /** The open record is still loading, so it has no title yet. */
  recordLoading?: boolean
}

/** What a tab names, most specific first: the record and its list, the new record and its list, the list, or the page. */
export const titleParts = ({ address, page, accountPage, resourceLabel, singular, recordTitle, recordLoading }: TitleInput): string[] => {
  if (accountPage) return [accountPage]
  if (page) return [page.title]
  if (!address || address.kind === 'page') return []
  const list = resourceLabel ? [resourceLabel] : []
  if (address.kind === 'list') return list
  if (address.kind === 'create') return [...(singular ? [createText('title', singular)] : []), ...list]
  const record = recordTitle ?? (recordLoading ? undefined : address.key)
  return [...(record ? [record] : []), ...list]
}

/** A tab's title: its parts, then the app's name, as in "Nordlicht GmbH · Companies · Protobase". */
export const documentTitle = (parts: string[], appName: string) => [...parts.filter(Boolean), appName].join(' · ')

/** Shows `text` as the tab's title while mounted, then puts back the title it found. */
export const useDocumentTitle = (text: string) => {
  useEffect(() => {
    const before = document.title
    document.title = text
    return () => {
      document.title = before
    }
  }, [text])
}
