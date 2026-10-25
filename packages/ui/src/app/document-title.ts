import { useEffect } from 'react'
import type { CurrentAddress } from './current-address'
import { text as createText } from './create/messages'

export type TitleInput = {
  /** The address the app shows; none at the root. */
  address: CurrentAddress | undefined
  /** The composed page or account page being shown, with the label of its tab shown when it has tabs. */
  page?: { title: string; tab?: string }
  /** The app's own page being shown, such as "Sign-in policy". */
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

/** What a tab names, most specific first: the record and its list, the new record and its list, the list, or the page (after its tab). */
export const titleParts = ({ address, page, accountPage, resourceLabel, singular, recordTitle, recordLoading }: TitleInput): string[] => {
  if (page) return page.tab ? [page.tab, page.title] : [page.title]
  if (accountPage) return [accountPage]
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
