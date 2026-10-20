import { goTrueAudience } from './keys'
import { appMetadata, userMetadata, type GoTrueUser, type StoredAccount, type StoredUser } from './user-json'

/** How long an access token works, in seconds: an hour, as Supabase's do by default. */
export const accessTokenSeconds = 60 * 60

export type TokenInput = { user: StoredUser; accounts: StoredAccount[]; sessionId: string; issuer: string; now: number }

/**
 * The claims of a signed-in user's access token, Supabase's: `role` is the database role, `authenticated`, never the
 * user's roles in the app, which Protobase's own tokens carry. `aal1`, as nobody signs in with a second factor here.
 */
export const accessClaims = ({ user, accounts, sessionId, issuer, now }: TokenInput) => ({
  iss: issuer,
  sub: user.id,
  aud: goTrueAudience,
  iat: now,
  exp: now + accessTokenSeconds,
  email: user.email,
  app_metadata: appMetadata(accounts),
  user_metadata: userMetadata(user.metadata),
  role: 'authenticated',
  aal: 'aal1',
  session_id: sessionId,
  is_anonymous: false,
})

/** The session GoTrue answers a sign-in or a refresh with. */
export const goTrueSession = ({ accessToken, refreshToken, issuedAt, user }: { accessToken: string; refreshToken: string; issuedAt: number; user: GoTrueUser }) => ({
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: accessTokenSeconds,
  expires_at: issuedAt + accessTokenSeconds,
  refresh_token: refreshToken,
  user,
})

export type GoTrueSession = ReturnType<typeof goTrueSession>
