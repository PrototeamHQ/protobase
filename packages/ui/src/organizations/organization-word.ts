import { useMemo } from 'react'
import { useAuth } from '../auth/auth-provider'
import type { MessageValue } from '../locale/messages'
import { text } from './messages'

/** What the app calls an organization, capitalised as a view's names are (`auth.organizations.names`). */
export type OrganizationNames = { singular: string; plural: string }

export type OrganizationText = (id: Parameters<typeof text>[0], values?: Record<string, MessageValue>) => string

/** The organization texts with the app's word for an organization in them, or the built-in "Organization". */
export const wordedText = (names?: OrganizationNames): OrganizationText => {
  const word = { word: names?.singular ?? text('word'), words: names?.plural ?? text('words') }
  return (id, values) => text(id, { ...word, ...values })
}

/** The organization texts in the words the app sets for an organization. */
export const useOrganizationText = () => {
  const names = useAuth().organizations?.names
  return useMemo(() => wordedText(names), [names])
}
