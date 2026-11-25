import type { DBAdapter } from 'better-auth'
import { acrossOrganizations, inOrganization } from '../../organization-scope/sign-in-organization'
import { everyRow } from '../organizations/store'

/** Better Auth's model for personal access tokens: one row per token, holding its hash and never the token. */
export const personalAccessTokenModel = 'personalAccessToken'

/**
 * A stored token: whose it is, its name, its hash, the role and organization it works with (those of the session that
 * made it), and when it was made, expires (never without `expiresAt`) and was last used.
 */
export type PersonalAccessTokenRow = {
  id: string
  userId: string
  name: string
  tokenHash: string
  role: string
  organizationId?: string | null
  createdAt: Date
  expiresAt?: Date | null
  lastUsedAt?: Date | null
}

/** A token as its owner sees it on the account page: everything but its hash. */
export type PersonalAccessToken = { id: string; name: string; role: string; organization?: string; createdAt: string; expiresAt?: string; lastUsedAt?: string }

const iso = (date: Date | string) => new Date(date).toISOString()

/** The row as its owner sees it, with the role and organization as `labels` name them. */
export const listedToken = (row: PersonalAccessTokenRow, labels: { role: (role: string) => string; organization: (id: string) => string }): PersonalAccessToken => ({
  id: row.id,
  name: row.name,
  role: labels.role(row.role),
  ...(row.organizationId && { organization: labels.organization(row.organizationId) }),
  createdAt: iso(row.createdAt),
  ...(row.expiresAt && { expiresAt: iso(row.expiresAt) }),
  ...(row.lastUsedAt && { lastUsedAt: iso(row.lastUsedAt) }),
})

type Adapter = Pick<DBAdapter, 'findOne' | 'findMany' | 'create' | 'update' | 'deleteMany'>

// A token's organization as the scope takes it: none for a token made in none.
const organizationOf = (row: Pick<PersonalAccessTokenRow, 'organizationId'>) => row.organizationId ?? undefined

/** The token of a hash, whatever its organization. */
export const findTokenByHash = (adapter: Pick<Adapter, 'findOne'>, tokenHash: string) =>
  acrossOrganizations("a token is looked up by its hash, a key unique across the app, before its organization is known", () =>
    adapter.findOne<PersonalAccessTokenRow>({ model: personalAccessTokenModel, where: [{ field: 'tokenHash', value: tokenHash }] }),
  )

/** The user's tokens, newest first, from every organization. */
export const tokensOf = (adapter: Pick<Adapter, 'findMany'>, userId: string) =>
  acrossOrganizations('a user lists their own tokens, each made in an organization of theirs', () =>
    adapter.findMany<PersonalAccessTokenRow>({ model: personalAccessTokenModel, where: [{ field: 'userId', value: userId }], sortBy: { field: 'createdAt', direction: 'desc' }, limit: everyRow }),
  )

/** Stores a token, in the organization it works in. */
export const storeToken = (adapter: Pick<Adapter, 'create'>, data: Omit<PersonalAccessTokenRow, 'id' | 'lastUsedAt'>) =>
  inOrganization(organizationOf(data), () => adapter.create<Omit<PersonalAccessTokenRow, 'id'>, PersonalAccessTokenRow>({ model: personalAccessTokenModel, data }))

/** Deletes the user's token `id`; one that is not theirs, or gone already, is left as it is. */
export const deleteToken = (adapter: Pick<Adapter, 'deleteMany'>, userId: string, id: string) =>
  acrossOrganizations('a user deletes one of their own tokens, made in any organization of theirs', () =>
    adapter.deleteMany({ model: personalAccessTokenModel, where: [{ field: 'id', value: id }, { field: 'userId', value: userId }] }),
  )

/** How stale `lastUsedAt` may get: a script's many requests update it once a minute, not on each one. */
export const lastUsedPrecisionMs = 60_000

/** Notes that the token was used `now`, unless it was within the last minute. */
export const noteUse = async (adapter: Pick<Adapter, 'update'>, row: PersonalAccessTokenRow, now: Date) => {
  if (row.lastUsedAt && now.getTime() - new Date(row.lastUsedAt).getTime() < lastUsedPrecisionMs) return
  await inOrganization(organizationOf(row), () => adapter.update({ model: personalAccessTokenModel, where: [{ field: 'id', value: row.id }], update: { lastUsedAt: now } }))
}
