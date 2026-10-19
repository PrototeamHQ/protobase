import { KeyRound, ShieldCheck } from 'lucide-react'
import type { ProfileMenuItem } from '../app-shell'
import { text } from './messages'

// Under `/-/`: page names start with a letter, and a resource would need a table named `-`.
export const accountSecurityPath = '/-/account'
export const signInPolicyPath = '/-/sign-in-policy'

/** The app's own pages for the signed-in person, at the end of the profile menu: their sign-in, and for admins the policy. */
export const accountMenuItems = (basePath: string, path: string, admin: boolean): ProfileMenuItem[] => [
  { id: 'account-security', label: text('signInSecurity'), icon: KeyRound, href: `${basePath}${accountSecurityPath}`, active: path === accountSecurityPath },
  ...(admin ? [{ id: 'sign-in-policy', label: text('signInPolicy'), icon: ShieldCheck, href: `${basePath}${signInPolicyPath}`, active: path === signInPolicyPath }] : []),
]
