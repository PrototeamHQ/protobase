import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AuthUser } from '@protobase/client'
import { useOptionalAuth } from '../../auth/auth-provider'
import { useMembers } from '../../people/use-members'
import { useAdminMeta } from '../meta-gate'
import { useProjectUi } from '../pages/project-ui'
import { recordTitleOf, type RecordTitleOf } from './record-title-of'
import type { TitleRule } from './title-rule'

const noMember = () => undefined

const RecordTitleContext = createContext<RecordTitleOf>(recordTitleOf({}, { user: undefined, member: noMember }))

/** How the framework titles a record for the person reading it: a view's derived title, else its stored one. */
export const useRecordTitle = () => useContext(RecordTitleContext)

type Props = { rules: Record<string, TitleRule>; user: AuthUser | undefined; children: ReactNode }

const WithoutMembers = ({ rules, user, children }: Props) => {
  const titleOf = useMemo(() => recordTitleOf(rules, { user, member: noMember }), [rules, user])
  return <RecordTitleContext.Provider value={titleOf}>{children}</RecordTitleContext.Provider>
}

// The organization's members, read once for every derived title; a change of their names titles the records anew.
const WithMembers = ({ rules, user, children }: Props) => {
  const { member } = useMembers()
  const titleOf = useMemo(() => recordTitleOf(rules, { user, member }), [rules, user, member])
  return <RecordTitleContext.Provider value={titleOf}>{children}</RecordTitleContext.Provider>
}

/**
 * Titles records with the project UI's `titles` rules for the signed-in reader, who gets the organization's members
 * when the app has organizations and a view derives its titles; `useRecordTitle()` gives it to whatever titles a record.
 */
export const RecordTitles = ({ children }: { children: ReactNode }) => {
  const { views } = useAdminMeta()
  const { titles } = useProjectUi()
  const auth = useOptionalAuth()
  const user = auth?.state.kind === 'signed-in' ? auth.state.user : undefined
  const rules = titles ?? {}
  const derives = Object.values(views).some((view) => view.titleFrom !== undefined)
  if (derives && user && auth?.organizations) return <WithMembers rules={rules} user={user}>{children}</WithMembers>
  return <WithoutMembers rules={rules} user={user}>{children}</WithoutMembers>
}
