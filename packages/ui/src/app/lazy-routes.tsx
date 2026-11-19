import { lazyComponent } from './lazy-component'
import { ListSkeleton } from './list-skeleton'
import { RecordSkeleton } from './record-skeleton'
import { RevealSkeleton } from './reveal-when-loaded'

// The app's pages, each loaded as it first opens, with the skeleton it draws while its data loads in its place until then.

export const ListPage = lazyComponent(() => import('./list-page').then((module) => module.ListPage), () => <ListSkeleton />)
export const RecordPage = lazyComponent(() => import('./record-page').then((module) => module.RecordPage), () => <RecordSkeleton />)
export const CreateRoute = lazyComponent(() => import('./create/create-route').then((module) => module.CreateRoute), () => <RecordSkeleton />)
export const ComposedPage = lazyComponent(() => import('./pages/composed-page').then((module) => module.ComposedPage), () => <RevealSkeleton />)
export const AccountPage = lazyComponent(() => import('../account/account-page').then((module) => module.AccountPage), () => <RevealSkeleton />)
export const SignInPolicyPage = lazyComponent(() => import('../account/sign-in-policy-page').then((module) => module.SignInPolicyPage), () => <RevealSkeleton />)
export const OrganizationPage = lazyComponent(() => import('../organizations/organization-page').then((module) => module.OrganizationPage), () => <RevealSkeleton />)
export const OrganizationsPage = lazyComponent(() => import('../organizations/organizations-page').then((module) => module.OrganizationsPage), () => <RevealSkeleton />)
export const MembersPage = lazyComponent(() => import('../organizations/members-page').then((module) => module.MembersPage), () => <RevealSkeleton />)
export const InvitationsPage = lazyComponent(() => import('../organizations/invitations-page').then((module) => module.InvitationsPage), () => <RevealSkeleton />)

// What stands apart from the shell: the connect page, a public form and a guest's call.
export const ConnectRoute = lazyComponent(() => import('../connect/connect-route').then((module) => module.ConnectRoute))
export const PublicFormPage = lazyComponent(() => import('../forms/public-form-page').then((module) => module.PublicFormPage))
export const GuestCallPage = lazyComponent(() => import('../calls/guest-call-page').then((module) => module.GuestCallPage))

// What the shell draws only for some apps or people: the assistant, calls and the runtime's update.
export const AssistantPanel = lazyComponent(() => import('./assistant-shell').then((module) => module.AssistantPanel))
export const CallRings = lazyComponent(() => import('../calls/call-rings').then((module) => module.CallRings))
export const RuntimeUpdateButton = lazyComponent(() => import('./runtime/runtime-update').then((module) => module.RuntimeUpdateButton))

let pages: Promise<unknown> | undefined

/**
 * Starts loading the pages a start mostly opens, a list, a record and a composed page, while the start waits for the
 * sign-in check and `/meta`, so the page's code is there when the shell draws it. Once; a page whose load fails is
 * tried again as it opens.
 */
export const preloadPages = () => (pages ??= Promise.all([ListPage.preload(), RecordPage.preload(), ComposedPage.preload()]).catch(() => undefined))
