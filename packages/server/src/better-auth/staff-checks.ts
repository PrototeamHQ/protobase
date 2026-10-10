export type StaffRefusal = { code: string; message: string }

/** What a staff member's ID token from the operator provider says about them and how they signed in. */
export type StaffClaims = {
  sub: string
  email?: unknown
  name?: unknown
  groups?: unknown
  amr?: unknown
  acr?: unknown
  auth_time?: unknown
}

export type StaffCheckOptions = {
  /** The group in the `groups` claim that lets staff sign in as people. */
  group: string
  /** `acr` values that count as a strong sign-in, for providers that report levels instead of `amr`. */
  acrValues: string[]
  /** Now, in seconds since the epoch. */
  now: number
}

/** How recent the staff member's own sign-in at the operator provider must be: it is asked for again after that. */
export const staffSignInMaxAgeSeconds = 15 * 60

/** The shortest reason staff can give for signing in as someone; a word or two says nothing to whoever reads the log. */
export const minimumReasonLength = 10

// `amr` values (RFC 8176) that are two factors on their own: a passkey or security key (`hwk`, `swk`), or several (`mfa`).
// They match the app's own rule: a passkey is a strong sign-in, as is a password or code with a second step.
const strongMethods = ['mfa', 'hwk', 'swk']

/**
 * Whether the operator provider says the staff member signed in strongly: with a passkey or a second step (`amr`), or
 * at one of the configured `acr` levels.
 */
export const isStrongSignIn = (claims: Pick<StaffClaims, 'amr' | 'acr'>, acrValues: string[]) => {
  const methods = Array.isArray(claims.amr) ? claims.amr : []
  return methods.some((method) => strongMethods.includes(method)) || (typeof claims.acr === 'string' && acrValues.includes(claims.acr))
}

const groupsOf = (groups: unknown) => (Array.isArray(groups) ? groups : typeof groups === 'string' ? groups.split(/[\s,]+/) : [])

export const permissionMissing: StaffRefusal = { code: 'STAFF_PERMISSION_MISSING', message: 'Your staff account has no permission to sign in as people here.' }
export const signInNotStrong: StaffRefusal = { code: 'STAFF_SIGN_IN_NOT_STRONG', message: 'Sign in to the staff account with a passkey or a second step first.' }
export const signInStale: StaffRefusal = { code: 'STAFF_SIGN_IN_STALE', message: 'Your staff sign-in is too old: sign in to the staff account again.' }

/**
 * Why a verified staff ID token cannot start a session as someone, or `undefined` when it can: the staff member needs
 * the explicit permission (the configured group), a strong sign-in, and one made in the last 15 minutes.
 */
export const staffClaimsRefusal = (claims: StaffClaims, { group, acrValues, now }: StaffCheckOptions): StaffRefusal | undefined => {
  if (!groupsOf(claims.groups).includes(group)) return permissionMissing
  if (!isStrongSignIn(claims, acrValues)) return signInNotStrong
  if (typeof claims.auth_time !== 'number' || now - claims.auth_time > staffSignInMaxAgeSeconds) return signInStale
  return undefined
}

/** Why `reason` cannot be logged as the reason for signing in as someone, or `undefined` when it can. */
export const reasonProblem = (reason: string) =>
  reason.trim().length < minimumReasonLength ? `Say why you sign in as this person, in at least ${minimumReasonLength} characters, for the app's log.` : undefined

/** The staff member as the log and the banner name them: the address, else the provider's subject. */
export const staffLabel = (claims: StaffClaims) => (typeof claims.email === 'string' && claims.email ? claims.email : claims.sub)

// What the person can change about their own sign-in, and the app's sign-in policy: staff can look and help, but not
// take the account over or loosen how people sign in. The paths are Better Auth's, as `ctx.path` names them.
const accountChanges = [
  '/change-password',
  '/set-password',
  '/change-email',
  '/delete-user',
  '/link-social',
  '/unlink-account',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/generate-backup-codes',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/update-passkey',
  '/passkey/delete-passkey',
]

export const staffCannotChange: StaffRefusal = { code: 'STAFF_CANNOT_CHANGE_SIGN_IN', message: "Staff cannot change a person's sign-in or the sign-in policy." }

/** Whether a staff session's request to `path` is refused: changes to the person's sign-in, and saving the sign-in policy. */
export const isRefusedForStaff = (path: string, method: string) => accountChanges.includes(path) || (path === '/policy/sign-in' && method === 'POST')

/** Whether a Better Auth session is one staff started as someone: the admin plugin's `impersonatedBy` names the staff member. */
export const isStaffSession = (session: object) => Boolean((session as { impersonatedBy?: unknown }).impersonatedBy)
