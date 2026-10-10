import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { staffSignInMaxAgeSeconds, type StaffClaims } from './staff-checks'

/**
 * The identity provider the operator's staff sign in with to sign in as people of this app: any OpenID Connect
 * provider, with this app registered as a confidential client whose redirect URI is `{baseURL}/api/auth/staff/callback`.
 */
export type OperatorProvider = {
  /** The provider's issuer URL; its settings are read from `{issuer}/.well-known/openid-configuration`. */
  issuer: string
  clientId: string
  clientSecret: string
  /** Shown on the staff sign-in page as "Continue with {name}". Default `the operator`. */
  name?: string
  /** The group in the ID token's `groups` claim that lets staff sign in as people. Default `protobase-staff-access`. */
  group?: string
  /** Scopes asked for besides `openid email profile`, for a provider that puts `groups` in the ID token only for one of its own. */
  scopes?: string[]
  /** `acr` values that count as a strong sign-in, asked for as `acr_values`, for a provider that reports levels instead of `amr`. */
  acrValues?: string[]
  /** How long a staff session lasts, in minutes: default 30, at most 240. It is not extended while in use. */
  sessionMinutes?: number
}

export const operatorIssuerVariable = 'PROTOBASE_OPERATOR_ISSUER'
export const operatorClientIdVariable = 'PROTOBASE_OPERATOR_CLIENT_ID'
export const operatorClientSecretVariable = 'PROTOBASE_OPERATOR_CLIENT_SECRET'
export const operatorNameVariable = 'PROTOBASE_OPERATOR_NAME'
export const operatorGroupVariable = 'PROTOBASE_OPERATOR_GROUP'

/**
 * The operator provider the platform passes in `PROTOBASE_OPERATOR_ISSUER`, `PROTOBASE_OPERATOR_CLIENT_ID` and
 * `PROTOBASE_OPERATOR_CLIENT_SECRET` (with `PROTOBASE_OPERATOR_NAME` and `PROTOBASE_OPERATOR_GROUP` optional);
 * `undefined` when none of the three is set. Some but not all of them, or an issuer that is not a URL, stops the
 * server at startup.
 */
export const readOperatorSettings = (env: Record<string, string | undefined>): OperatorProvider | undefined => {
  const required = [operatorIssuerVariable, operatorClientIdVariable, operatorClientSecretVariable]
  const [issuer, clientId, clientSecret] = required.map((name) => env[name]?.trim() || undefined)
  if (!issuer && !clientId && !clientSecret) return undefined
  if (!issuer || !clientId || !clientSecret) throw new Error(`${required.join(', ')} go together: set all three for staff sign-in, or none`)
  const name = env[operatorNameVariable]?.trim()
  const group = env[operatorGroupVariable]?.trim()
  return { issuer, clientId, clientSecret, ...(name && { name }), ...(group && { group }) }
}

export const defaultStaffGroup = 'protobase-staff-access'
const defaultSessionMinutes = 30
const maxSessionMinutes = 240

/** The provider with its defaults filled in; a session length out of range or an issuer that is not a URL is an error. */
export const resolveOperator = (provider: OperatorProvider) => {
  if (!URL.canParse(provider.issuer)) throw new Error(`The operator provider's issuer must be a URL, not "${provider.issuer}"`)
  const sessionMinutes = provider.sessionMinutes ?? defaultSessionMinutes
  if (!Number.isInteger(sessionMinutes) || sessionMinutes < 1 || sessionMinutes > maxSessionMinutes) {
    throw new Error(`The operator provider's sessionMinutes must be a whole number from 1 to ${maxSessionMinutes}`)
  }
  return { ...provider, name: provider.name ?? 'the operator', group: provider.group ?? defaultStaffGroup, scopes: provider.scopes ?? [], acrValues: provider.acrValues ?? [], sessionMinutes }
}

export type ResolvedOperator = ReturnType<typeof resolveOperator>

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A random value for `state`, `nonce` and the PKCE verifier. */
export const randomValue = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

const challengeOf = async (verifier: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))

/**
 * An OpenID Connect client of the operator provider: the authorization code flow with PKCE, a client secret, and an
 * ID token verified against the provider's keys, issuer, this client and the nonce. The provider's settings and keys
 * are read on first use and kept; settings that fail to load are read again next time.
 */
export const operatorClient = (operator: ResolvedOperator, redirectURI: string) => {
  let discovery: Promise<Discovery> | undefined
  let keys: ReturnType<typeof createRemoteJWKSet> | undefined

  const settings = () => {
    discovery ??= (async () => {
      const response = await fetch(`${operator.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
      if (!response.ok) throw new Error(`The operator provider's settings answered ${response.status}`)
      const found = (await response.json()) as Discovery
      if (found.issuer !== operator.issuer) throw new Error(`The operator provider names its issuer "${found.issuer}", not "${operator.issuer}"`)
      return found
    })().catch((error: unknown) => {
      discovery = undefined
      throw error
    })
    return discovery
  }

  return {
    /** Where to send the staff member's browser; their sign-in there must be at most 15 minutes old. */
    authorizationURL: async ({ state, nonce, verifier }: { state: string; nonce: string; verifier: string }) => {
      const url = new URL((await settings()).authorization_endpoint)
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: operator.clientId,
        redirect_uri: redirectURI,
        scope: ['openid', 'email', 'profile', ...operator.scopes].join(' '),
        state,
        nonce,
        code_challenge: await challengeOf(verifier),
        code_challenge_method: 'S256',
        max_age: String(staffSignInMaxAgeSeconds),
        ...(operator.acrValues.length > 0 && { acr_values: operator.acrValues.join(' ') }),
      }).toString()
      return url.toString()
    },

    /** Trades the code for an ID token and returns its verified claims; rejects when anything does not match. */
    signedInStaff: async ({ code, nonce, verifier }: { code: string; nonce: string; verifier: string }): Promise<StaffClaims> => {
      const found = await settings()
      const response = await fetch(found.token_endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          authorization: `Basic ${btoa(`${encodeURIComponent(operator.clientId)}:${encodeURIComponent(operator.clientSecret)}`)}`,
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectURI, code_verifier: verifier }),
      })
      if (!response.ok) throw new Error(`The operator provider refused the code: ${response.status}`)
      const { id_token: idToken } = (await response.json()) as { id_token?: unknown }
      if (typeof idToken !== 'string') throw new Error('The operator provider sent no ID token')
      keys ??= createRemoteJWKSet(new URL(found.jwks_uri))
      const { payload } = await jwtVerify<JWTPayload & StaffClaims & { nonce?: unknown }>(idToken, keys, { issuer: operator.issuer, audience: operator.clientId })
      if (payload.nonce !== nonce) throw new Error('The ID token is for another sign-in')
      if (typeof payload.sub !== 'string') throw new Error('The ID token has no subject')
      return payload
    },
  }
}

export type OperatorClient = ReturnType<typeof operatorClient>
