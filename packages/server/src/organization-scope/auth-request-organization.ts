import { everyOrganization, type EveryOrganization, type Organization } from '@protobase/query'
import { authBasePath } from '../better-auth/auth-base-path'
import type { AdminAuth } from '../better-auth/create-auth'
import { inSignInScope } from './sign-in-organization'

// Better Auth's organization endpoints that read across organizations, each with why; their own checks then keep the
// caller to what is theirs.
const acrossPaths: Record<string, string> = {
  '/organization/list': 'a user lists the organizations they are a member of',
  '/organization/list-user-invitations': 'a user lists the invitations to their address, from every organization',
  '/organization/get-invitation': 'an invitation is found by its id for the person it invites, before they are a member',
  '/organization/reject-invitation': 'an invitation is found by its id for the person it invites, before they are a member',
  '/organization/cancel-invitation': "an invitation is found by its id, before the caller's right is checked in its organization",
  '/organization/create': "creating an organization counts the creator's organizations and makes them the new one's first member",
}

// The organization a request names as `organizationId`, in its query or its JSON body.
const namedOrganization = async (request: Request) => {
  const inQuery = new URL(request.url).searchParams.get('organizationId')
  if (inQuery) return inQuery
  if (request.method !== 'POST' || !request.headers.get('content-type')?.includes('application/json')) return
  let body: unknown
  try {
    body = await request.clone().json()
  } catch (error) {
    // Better Auth answers a body that is no JSON itself.
    if (error instanceof SyntaxError) return
    throw error
  }
  const named = (body as { organizationId?: unknown } | null)?.organizationId
  return typeof named === 'string' && named !== '' ? named : undefined
}

/**
 * The organization an `/api/auth/*` request works in: every organization for the endpoints that read across them, saying
 * why; the one it names as `organizationId`, where Better Auth checks the caller's membership itself; for another
 * organization endpoint, the session's active organization (`activeOrganization`, read only then); none for the rest,
 * sign-in, sessions and tokens among them, whose reads of the organization's tables name the organization they read in
 * or why they cross organizations.
 */
export const authRequestOrganization = async (request: Request, activeOrganization: () => Promise<Organization>): Promise<Organization | EveryOrganization> => {
  const path = new URL(request.url).pathname.slice(authBasePath.length)
  const across = acrossPaths[path]
  if (across) return everyOrganization(across)
  const named = await namedOrganization(request)
  if (named !== undefined) return named
  if (path.startsWith('/organization/')) return activeOrganization()
  return
}

/**
 * `answer`, Better Auth's handler, with each request's sign-in queries in the organization it works in
 * (`authRequestOrganization`); promises it starts, its background tasks too, stay there.
 */
export const answerInOrganization =
  (answer: (request: Request) => Promise<Response>, activeOrganization: (request: Request) => Promise<Organization>) =>
  async (request: Request) =>
    inSignInScope(await authRequestOrganization(request, () => activeOrganization(request)), () => answer(request))

/** The active organization of the request's session, read without refreshing it; none without a session. */
export const sessionActiveOrganization = (auth: AdminAuth) => async (request: Request): Promise<Organization> => {
  const found = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } })
  return (found?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? undefined
}
