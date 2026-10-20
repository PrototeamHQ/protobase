import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { everyRow } from '../organizations/store'
import type { RoleDefinitions } from '../organizations/role-definitions'
import { consentModel } from './consent-check'
import { readGrantReference } from './grant-reference'
import { revokeMcpGrants } from './revoke-grants'

/** A consent row of the OAuth provider: one client allowed by one user with one grant (`referenceId`). */
export type ConsentRow = { clientId: string; referenceId?: string | null; createdAt: Date | string; updatedAt?: Date | string | null }
/** The part of a client row the list shows: its id and the name it gave itself. */
export type ClientRow = { clientId: string; name?: string | null }

/** An app the person allowed: the client, the name it gave itself, when they last allowed it, and as what. */
export type ConnectedApp = { clientId: string; name?: string; allowedAt: string; access: { role: string; organization?: string }[] }

const allowedAt = (consent: ConsentRow) => new Date(consent.updatedAt ?? consent.createdAt)

/**
 * The person's consents as the apps they allowed, newest first: one entry per client, with the role (as its label)
 * and organization (as its name) of each consent it holds. A consent whose client is gone is left out.
 */
export const connectedApps = (
  consents: readonly ConsentRow[],
  clients: readonly ClientRow[],
  { roleLabel, organizationName }: { roleLabel: (role: string) => string; organizationName: (id: string) => string },
): ConnectedApp[] => {
  const byClient = new Map<string, ConsentRow[]>()
  for (const consent of consents) byClient.set(consent.clientId, [...(byClient.get(consent.clientId) ?? []), consent])
  return clients
    .filter((client) => byClient.has(client.clientId))
    .map((client) => {
      const own = byClient.get(client.clientId)!.toSorted((a, b) => allowedAt(b).getTime() - allowedAt(a).getTime())
      const access = own.map((consent) => readGrantReference(consent.referenceId)).map(({ role, organization }) => ({
        role: role ? roleLabel(role) : '',
        ...(organization && { organization: organizationName(organization) }),
      }))
      return { clientId: client.clientId, ...(client.name && { name: client.name }), allowedAt: allowedAt(own[0]!).toISOString(), access }
    })
    .toSorted((a, b) => b.allowedAt.localeCompare(a.allowedAt))
}

const idsIn = (field: string, values: string[]) => [{ field, value: values, operator: 'in' as const }]

/**
 * `GET /account/connected-apps`: the apps the signed-in person allowed to act as them (`connectedApps`).
 * `POST /account/connected-apps/disconnect { clientId }`: disconnects one, forgetting its consents and revoking its
 * tokens (`revokeMcpGrants`); one with nothing left is no error. Both act on the session's own person only.
 */
export const mcpConnectedApps = ({ definitions }: { definitions: RoleDefinitions }) =>
  ({
    id: 'protobase-mcp-connected-apps',
    endpoints: {
      listConnectedApps: createAuthEndpoint('/account/connected-apps', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const { adapter } = ctx.context
        const consents = await adapter.findMany<ConsentRow>({ model: consentModel, where: [{ field: 'userId', value: ctx.context.session.user.id }], limit: everyRow })
        const clientIds = [...new Set(consents.map((consent) => consent.clientId))]
        const clients = clientIds.length === 0 ? [] : await adapter.findMany<ClientRow>({ model: 'oauthClient', where: idsIn('clientId', clientIds), limit: everyRow })
        const organizationIds = [...new Set(consents.map((consent) => readGrantReference(consent.referenceId).organization).filter((id) => id !== undefined))]
        const organizations = organizationIds.length === 0 ? [] : await adapter.findMany<{ id: string; name: string }>({ model: 'organization', where: idsIn('id', organizationIds), limit: everyRow })
        const names = new Map(organizations.map((organization) => [organization.id, organization.name]))
        const apps = connectedApps(consents, clients, { roleLabel: (role) => definitions.labels[role] ?? role, organizationName: (id) => names.get(id) ?? id })
        return ctx.json({ apps })
      }),

      disconnectApp: createAuthEndpoint(
        '/account/connected-apps/disconnect',
        { method: 'POST', use: [sessionMiddleware], body: z.object({ clientId: z.string().min(1) }) },
        async (ctx) => {
          await revokeMcpGrants(ctx.context.adapter, ctx.context.session.user.id, ctx.body.clientId)
          return ctx.json({ disconnected: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
