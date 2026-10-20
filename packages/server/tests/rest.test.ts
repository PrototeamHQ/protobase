import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { jwtVerifier } from '../src/auth/jwt'
import { createAdmin } from '../src/create-admin'
import { testAuthenticator } from '../../../test-support/server'
import { restUsers } from '../../../test-support/fixtures/rest-ddl'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'
import { recordedHeaders, type RecordedAnswer } from './rest/answers'
import { restCases, type RestCase } from './rest/cases'

// The tables as the app declares them: `/rest/v1` serves the tables of its resources.
const profiles = resource('profiles')
  .table('profiles')
  .fields({ id: f.uuid(), username: f.text().filterable().sortable(), full_name: f.text().optional(), website: f.text().optional() })
  .primaryKey((r) => r.id)
const todos = resource('todos')
  .table('todos')
  .fields({ id: f.bigint().readOnly(), user_id: f.uuid().dbDefault(), title: f.text(), done: f.boolean().dbDefault(), priority: f.integer().optional(), notes: f.text().optional() })
  .primaryKey((r) => r.id)

const publishable = 'sb_publishable_rest_test'
const secret = 'sb_secret_rest_test'
const signingKey = new TextEncoder().encode('rest-test-signing-key-rest-test-signing-key')

const signedIn = (sub: string) => new SignJWT({ email: 'alice@example.com' }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setExpirationTime('5m').sign(signingKey)

let app: ReturnType<typeof createAdmin>
let headersOf: Record<RestCase['as'], Record<string, string>>

beforeAll(async () => {
  const pg = await openSnapshotDb('rest')
  app = createAdmin({
    resources: [profiles, todos],
    db: pg.db,
    authenticate: testAuthenticator,
    verifyToken: jwtVerifier({ keys: async () => signingKey, algorithms: ['HS256'] }),
    options: { apiKeys: { publishable_key: publishable, secret_key: secret } },
  })
  // As supabase-js sends them: the key, and the user's token or else the key again as the bearer.
  headersOf = {
    anon: { apikey: publishable, authorization: `Bearer ${publishable}` },
    alice: { apikey: publishable, authorization: `Bearer ${await signedIn(restUsers.alice)}` },
    service: { apikey: secret, authorization: `Bearer ${secret}` },
  }
})

const send = async (one: Pick<RestCase, 'as' | 'method' | 'path' | 'query' | 'headers' | 'body'>): Promise<Omit<RecordedAnswer, 'name'>> => {
  const query = one.query ? `?${new URLSearchParams(one.query)}` : ''
  const response = await app.request(`/rest/v1${one.path}${query}`, {
    method: one.method,
    headers: { ...headersOf[one.as], ...(one.body !== undefined && { 'content-type': 'application/json' }), ...one.headers },
    ...(one.body !== undefined && { body: JSON.stringify(one.body) }),
  })
  const text = await response.text()
  return { status: response.status, headers: recordedHeaders(response.headers), body: text === '' ? null : JSON.parse(text) }
}

const oracle = JSON.parse(readFileSync(new URL('./rest/postgrest.json', import.meta.url), 'utf8')) as { answers: RecordedAnswer[] }
const recorded = new Map(oracle.answers.map((answer) => [answer.name, answer]))

describe('/rest/v1 answers as PostgREST does', () => {
  it('has an answer of PostgREST for every case', () => {
    expect(restCases.map((one) => one.name)).toEqual([...recorded.keys()])
  })

  for (const one of restCases) {
    it(one.name, async () => {
      const { name: _, ...expected } = recorded.get(one.name)!
      const answer = await send(one)
      if (!one.loose) return expect(answer).toEqual(expected)
      expect({ status: answer.status, code: (answer.body as { code: string }).code }).toEqual({ status: expected.status, code: (expected.body as { code: string }).code })
    })
  }
})

describe('/rest/v1 beyond PostgREST', () => {
  it('refuses a filter on a column no index serves, with the index to add', async () => {
    const answer = await send({ as: 'alice', method: 'GET', path: '/todos', query: [['notes', 'eq.soon']] })
    expect(answer).toMatchObject({ status: 400, body: { code: 'expensive-query', message: 'Filtering on "notes" needs an index that serves it', hint: 'create index on "todos" ("notes")' } })
  })

  it('refuses a sort and a pattern no index serves, and a write filtering on such a column', async () => {
    expect((await send({ as: 'alice', method: 'GET', path: '/todos', query: [['order', 'notes']] })).body).toMatchObject({ message: 'Sorting by "notes" needs an index that serves it' })
    expect((await send({ as: 'alice', method: 'GET', path: '/todos', query: [['notes', 'ilike.*tap*']] })).body).toMatchObject({ hint: 'create index on "todos" using gin ("notes" gin_trgm_ops)' })
    expect((await send({ as: 'alice', method: 'DELETE', path: '/todos', query: [['notes', 'eq.soon']] })).status).toBe(400)
  })

  it('refuses a request without the app\'s key, or with a token that does not verify', async () => {
    const response = await app.request('/rest/v1/todos')
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'PGRST301', details: null, hint: null, message: 'Send the app\'s publishable or secret key in the apikey header' })
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(restUsers.bob).sign(new TextEncoder().encode('another-key-another-key-another-key-0'))
    expect((await app.request('/rest/v1/todos', { headers: { apikey: publishable, authorization: `Bearer ${forged}` } })).status).toBe(401)
  })
})
