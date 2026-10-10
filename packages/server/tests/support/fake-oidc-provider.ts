import { createHash } from 'node:crypto'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { vi } from 'vitest'

export const operatorIssuer = 'https://id.operator.example'
export const operatorClient = { clientId: 'protobase-app', clientSecret: 'operator-client-secret' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

/** How the provider signs one ID token: with a key it does not publish, as another issuer, or for another sign-in. */
export type TokenTwist = { foreignKey?: boolean; issuer?: string; nonce?: string }

export type FakeOidcProviderOptions = {
  issuer: string
  client: { clientId: string; clientSecret: string }
  /** The issuer its discovery document names; default `issuer`. */
  discoveredIssuer?: string
}

/**
 * An OpenID Connect provider, as a stubbed `fetch`: discovery, its keys, and a token endpoint that checks the client
 * secret and PKCE and answers with an ID token signed with its key. `approve` stands for the person signing in at the
 * provider: it takes the authorization URL and the claims, and returns the code.
 */
export const startFakeOidcProvider = async ({ issuer, client, discoveredIssuer = issuer }: FakeOidcProviderOptions) => {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const foreign = await generateKeyPair('ES256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'provider-key', alg: 'ES256', use: 'sig' }
  const grants = new Map<string, { challenge: string; redirectURI: string; claims: Record<string, unknown>; twist: TokenTwist }>()
  const exchanged: string[] = []
  const authorizations: URL[] = []

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.href === `${issuer}/.well-known/openid-configuration`) {
      return json({
        issuer: discoveredIssuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        id_token_signing_alg_values_supported: ['ES256'],
      })
    }
    if (url.href === `${issuer}/jwks`) return json({ keys: [jwk] })
    if (url.href === `${issuer}/token`) {
      const form = new URLSearchParams(await request.text())
      const code = form.get('code') ?? ''
      exchanged.push(code)
      const grant = grants.get(code)
      grants.delete(code)
      const basic = `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`
      if (request.headers.get('authorization') !== basic) return json({ error: 'invalid_client' }, 401)
      if (!grant || challengeOf(form.get('code_verifier') ?? '') !== grant.challenge || form.get('redirect_uri') !== grant.redirectURI) return json({ error: 'invalid_grant' }, 400)
      const idToken = await new SignJWT({ ...grant.claims, ...(grant.twist.nonce !== undefined && { nonce: grant.twist.nonce }) })
        .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
        .setIssuer(grant.twist.issuer ?? discoveredIssuer)
        .setAudience(client.clientId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(grant.twist.foreignKey ? foreign.privateKey : privateKey)
      return json({ access_token: 'provider-access', token_type: 'Bearer', expires_in: 60, id_token: idToken })
    }
    throw new Error(`Unexpected request to ${url.href}`)
  })

  return {
    exchanged,
    /** Every authorization URL the provider was sent to, in order. */
    authorizations,
    /** The person signs in at the provider with these claims; the ID token also carries the request's nonce. */
    approve: (authorizationURL: string, claims: Record<string, unknown>, twist: TokenTwist = {}) => {
      const url = new URL(authorizationURL)
      authorizations.push(url)
      const code = `code-${grants.size + exchanged.length + 1}`
      grants.set(code, {
        challenge: url.searchParams.get('code_challenge') ?? '',
        redirectURI: url.searchParams.get('redirect_uri') ?? '',
        claims: { nonce: url.searchParams.get('nonce'), ...claims },
        twist,
      })
      return { code, state: url.searchParams.get('state') ?? '' }
    },
  }
}

/** The operator's identity provider, for staff sign-in. */
export const startFakeOperator = () => startFakeOidcProvider({ issuer: operatorIssuer, client: operatorClient })

/** Claims of a staff member who may sign in as people and just signed in with a second step. */
export const permittedStaff = () => ({
  sub: 'staff-42',
  email: 'alex@operator.example',
  name: 'Alex Operator',
  groups: ['support', 'protobase-staff-access'],
  amr: ['pwd', 'mfa'],
  auth_time: Math.floor(Date.now() / 1000) - 30,
})
