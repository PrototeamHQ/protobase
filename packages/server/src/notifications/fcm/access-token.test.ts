import { verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { fcmAccessToken, FcmTokenError, fcmScope, tokenUrl } from './access-token'
import { loadRecording } from './testing/recordings'
import { testServiceAccount } from './testing/service-account'

const account = testServiceAccount()
const settings = account.settings()
const recorded = loadRecording('token-ok')
const refused = loadRecording('token-invalid-grant')

type Exchange = { url: string; form: URLSearchParams; redirect: RequestRedirect }

// A token endpoint that answers each exchange with the next answer, by default the recorded 200 with a numbered token.
const tokenEndpoint = (answers: (() => Response)[] = []) => {
  const exchanges: Exchange[] = []
  const fetch = async (request: Request) => {
    exchanges.push({ url: request.url, form: new URLSearchParams(await request.text()), redirect: request.redirect })
    const answer = answers[exchanges.length - 1]
    return answer ? answer() : Response.json({ ...(recorded.response.body as object), access_token: `token-${exchanges.length}` }, { status: recorded.response.status })
  }
  return { exchanges, fetch: fetch as typeof globalThis.fetch }
}

const partsOf = (assertion: string) => {
  const [header, claims, signature] = assertion.split('.')
  return { header: JSON.parse(Buffer.from(header!, 'base64url').toString()), claims: JSON.parse(Buffer.from(claims!, 'base64url').toString()), input: `${header}.${claims}`, signature: Buffer.from(signature!, 'base64url') }
}

const clock = (start: number) => {
  let ms = start
  return { now: () => ms, advance: (seconds: number) => (ms += seconds * 1000) }
}

describe('fcmAccessToken', () => {
  it('trades an RS256 assertion for the service account, scoped to FCM, at Google\'s token endpoint only', async () => {
    const endpoint = tokenEndpoint()
    const time = clock(1_800_000_000_000)
    expect(await fcmAccessToken(settings, { fetch: endpoint.fetch, now: time.now }).token()).toBe('token-1')

    const [exchange] = endpoint.exchanges
    expect(exchange!.url).toBe(tokenUrl)
    expect(exchange!.url).toBe(recorded.request.url)
    expect(exchange!.redirect).toBe('manual')
    expect([...exchange!.form.keys()]).toEqual(Object.keys(recorded.request.body))
    expect(exchange!.form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const { header, claims, input, signature } = partsOf(exchange!.form.get('assertion')!)
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(claims).toEqual({ iss: 'fcm-sender@example.com', scope: fcmScope, aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600 })
    expect(fcmScope).toBe('https://www.googleapis.com/auth/firebase.messaging')
    expect(verify('sha256', Buffer.from(input), account.publicKey, signature)).toBe(true)
  })

  it('reuses the recorded token for its lifetime and mints a new one inside the last five minutes', async () => {
    const endpoint = tokenEndpoint()
    const time = clock(1_800_000_000_000)
    const tokens = fcmAccessToken(settings, { fetch: endpoint.fetch, now: time.now })
    expect(await tokens.token()).toBe('token-1')
    time.advance(3599 - 301)
    expect(await tokens.token()).toBe('token-1')
    time.advance(1)
    expect(await tokens.token()).toBe('token-2')
    time.advance(7200)
    expect(await tokens.token()).toBe('token-3')
    expect(endpoint.exchanges).toHaveLength(3)
  })

  it('mints once for calls that come while a token is minted', async () => {
    const endpoint = tokenEndpoint()
    const tokens = fcmAccessToken(settings, { fetch: endpoint.fetch })
    expect(await Promise.all([tokens.token(), tokens.token(), tokens.token()])).toEqual(['token-1', 'token-1', 'token-1'])
    expect(endpoint.exchanges).toHaveLength(1)
  })

  it('drops a refused token, but not a newer one that replaced it', async () => {
    const endpoint = tokenEndpoint()
    const tokens = fcmAccessToken(settings, { fetch: endpoint.fetch })
    expect(await tokens.token()).toBe('token-1')
    tokens.invalidate('token-1')
    expect(await tokens.token()).toBe('token-2')
    tokens.invalidate('token-1')
    expect(await tokens.token()).toBe('token-2')
  })

  it('keeps no failed mint: the next call mints again and gets a token', async () => {
    const { status, headers, body } = refused.response
    const endpoint = tokenEndpoint([() => Response.json(body, { status, headers })])
    const tokens = fcmAccessToken(settings, { fetch: endpoint.fetch })
    await expect(tokens.token()).rejects.toThrow('The FCM token exchange failed with status 400')
    expect(await tokens.token()).toBe('token-2')
  })

  it('fails every call that shared a failed mint, and mints again on the next', async () => {
    const endpoint = tokenEndpoint([() => new Response(null, { status: 503 })])
    const tokens = fcmAccessToken(settings, { fetch: endpoint.fetch })
    const shared = await Promise.allSettled([tokens.token(), tokens.token()])
    expect(shared.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(await tokens.token()).toBe('token-2')
    expect(endpoint.exchanges).toHaveLength(2)
  })

  it('fails naming the status alone, for any answer that is no bearer token', async () => {
    const answers = [
      () => new Response('<html>oops</html>', { status: 200 }),
      () => Response.json({ access_token: 'secret-token', token_type: 'mac', expires_in: 3599 }),
      () => Response.json({ access_token: 'secret-token', token_type: 'Bearer' }),
      () => Response.json({ access_token: 'secret-token', token_type: 'Bearer', expires_in: 3599 }, { status: 302, headers: { location: 'https://elsewhere.example' } }),
    ]
    const endpoint = tokenEndpoint(answers)
    const tokens = fcmAccessToken(settings, { fetch: endpoint.fetch })
    for (const _ of answers) {
      const error = await tokens.token().catch((caught: Error) => caught)
      expect(error).toBeInstanceOf(FcmTokenError)
      expect((error as Error).message).toMatch(/^The FCM token exchange failed with status \d+$/)
      expect((error as Error).message).not.toContain('secret-token')
    }
  })

  it('fails as a failed mint when the token endpoint does not answer, and passes on any other error', async () => {
    const timeout = (async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    }) as typeof fetch
    await expect(fcmAccessToken(settings, { fetch: timeout }).token()).rejects.toBeInstanceOf(FcmTokenError)
    const broken = (async () => {
      throw new RangeError('unexpected')
    }) as typeof fetch
    await expect(fcmAccessToken(settings, { fetch: broken }).token()).rejects.toBeInstanceOf(RangeError)
  })

  it('takes a token type in any case', async () => {
    const endpoint = tokenEndpoint([() => Response.json({ access_token: 'lower', token_type: 'bearer', expires_in: 3599 })])
    expect(await fcmAccessToken(settings, { fetch: endpoint.fetch }).token()).toBe('lower')
  })
})
