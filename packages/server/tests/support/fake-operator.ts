import { createHash } from 'node:crypto'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { vi } from 'vitest'

export const operatorIssuer = 'https://id.operator.example'
export const operatorClient = { clientId: 'protobase-app', clientSecret: 'operator-client-secret' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

/**
 * An OpenID Connect provider for the operator's staff, as a stubbed `fetch`: discovery, its keys, and a token endpoint
 * that checks the client secret and PKCE and answers with an ID token signed with its key. `approve` stands for the
 * staff member signing in at the provider: it takes the authorization URL and the claims, and returns the code.
 */
export const startFakeOperator = async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'operator-key', alg: 'ES256', use: 'sig' }
  const grants = new Map<string, { challenge: string; redirectURI: string; claims: Record<string, unknown> }>()
  const exchanged: string[] = []

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.href === `${operatorIssuer}/.well-known/openid-configuration`) {
      return json({ issuer: operatorIssuer, authorization_endpoint: `${operatorIssuer}/authorize`, token_endpoint: `${operatorIssuer}/token`, jwks_uri: `${operatorIssuer}/jwks` })
    }
    if (url.href === `${operatorIssuer}/jwks`) return json({ keys: [jwk] })
    if (url.href === `${operatorIssuer}/token`) {
      const form = new URLSearchParams(await request.text())
      const code = form.get('code') ?? ''
      exchanged.push(code)
      const grant = grants.get(code)
      grants.delete(code)
      const basic = `Basic ${btoa(`${operatorClient.clientId}:${operatorClient.clientSecret}`)}`
      if (request.headers.get('authorization') !== basic) return json({ error: 'invalid_client' }, 401)
      if (!grant || challengeOf(form.get('code_verifier') ?? '') !== grant.challenge || form.get('redirect_uri') !== grant.redirectURI) return json({ error: 'invalid_grant' }, 400)
      const idToken = await new SignJWT(grant.claims)
        .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
        .setIssuer(operatorIssuer)
        .setAudience(operatorClient.clientId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey)
      return json({ access_token: 'operator-access', token_type: 'Bearer', id_token: idToken })
    }
    throw new Error(`Unexpected request to ${url.href}`)
  })

  return {
    exchanged,
    /** The staff member signs in at the provider with these claims; the ID token also carries the request's nonce. */
    approve: (authorizationURL: string, claims: Record<string, unknown>) => {
      const url = new URL(authorizationURL)
      const code = `code-${grants.size + exchanged.length + 1}`
      grants.set(code, {
        challenge: url.searchParams.get('code_challenge') ?? '',
        redirectURI: url.searchParams.get('redirect_uri') ?? '',
        claims: { nonce: url.searchParams.get('nonce'), ...claims },
      })
      return { code, state: url.searchParams.get('state') ?? '' }
    },
  }
}

/** Claims of a staff member who may sign in as people and just signed in with a second step. */
export const permittedStaff = () => ({
  sub: 'staff-42',
  email: 'alex@operator.example',
  name: 'Alex Operator',
  groups: ['support', 'protobase-staff-access'],
  amr: ['pwd', 'mfa'],
  auth_time: Math.floor(Date.now() / 1000) - 30,
})
