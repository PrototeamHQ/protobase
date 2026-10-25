import { ShieldCheck, UserRound } from 'lucide-react'
import type { ProfileMenuItem } from '../app-shell'
import { text } from './messages'

// Under `/-/`: page names start with a letter, and a resource would need a table named `-`.
export const accountPath = '/-/account'
export const signInPolicyPath = '/-/sign-in-policy'

/** The tab of the account page `path` shows, `{}` for its first, or `undefined` for a path outside it. */
export const readAccountPath = (path: string): { tab?: string } | undefined => {
  if (path === accountPath) return {}
  if (!path.startsWith(`${accountPath}/`)) return undefined
  const tab = path.slice(accountPath.length + 1)
  if (tab === '' || tab.includes('/')) return undefined
  try {
    return { tab: decodeURIComponent(tab) }
  } catch (error) {
    if (error instanceof URIError) return undefined
    throw error
  }
}

/** The path of the account page's tab `tab`, or of the page itself (its first tab). */
export const accountTabPath = (tab: string | undefined) => (tab ? `${accountPath}/${encodeURIComponent(tab)}` : accountPath)

/** The app's own pages for the signed-in person, at the end of the profile menu: their account, and for admins the policy. */
export const accountMenuItems = (basePath: string, path: string, admin: boolean): ProfileMenuItem[] => [
  { id: 'account', label: text('account'), icon: UserRound, href: `${basePath}${accountPath}`, active: readAccountPath(path) !== undefined },
  ...(admin ? [{ id: 'sign-in-policy', label: text('signInPolicy'), icon: ShieldCheck, href: `${basePath}${signInPolicyPath}`, active: path === signInPolicyPath }] : []),
]
