import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/**
 * One of the person's personal access tokens, without the token itself: its name, the role (as its label) and
 * organization (as its name) it works with, and when it was made, expires (never without `expiresAt`) and was last used.
 */
export type PersonalAccessToken = { id: string; name: string; role: string; organization?: string; createdAt: string; expiresAt?: string; lastUsedAt?: string }

/** A token just made: the token, to copy once, since the app keeps only its hash, and its entry in the list. */
export type NewPersonalAccessToken = { token: string; personalAccessToken: PersonalAccessToken }

/** The signed-in person's personal access tokens, on an app that turns them on (`personalAccessTokens` in its status). */
export const accountTokens = (client: BetterAuthClient) => ({
  /** The person's tokens, newest first. */
  personalAccessTokens: async (): Promise<PersonalAccessToken[]> => {
    const { data, error } = await client.$fetch<{ tokens: PersonalAccessToken[] }>('/account/personal-access-tokens')
    if (error || !data) throw authError(error, 'Could not read your access tokens')
    return data.tokens
  },

  /**
   * Makes a token that acts as the person, with the role and organization this session works with, for `expiresInDays`
   * days or, without it, until revoked. An older session confirms it's them first (`STRONG_SIGN_IN_REQUIRED`).
   */
  createPersonalAccessToken: async (input: { name: string; expiresInDays?: number }): Promise<NewPersonalAccessToken> => {
    const { data, error } = await client.$fetch<NewPersonalAccessToken>('/account/personal-access-tokens/create', { method: 'POST', body: input })
    if (error || !data) throw authError(error, 'Could not make the access token')
    return data
  },

  /** Revokes a token: its next request is refused. */
  revokePersonalAccessToken: async (id: string) => {
    const { error } = await client.$fetch('/account/personal-access-tokens/revoke', { method: 'POST', body: { id } })
    if (error) throw authError(error, 'Could not revoke the access token')
  },
})
