// Records the answers of a real PostgREST to the `/rest/v1` cases into postgrest.json, the oracle rest.test.ts holds
// Protobase to. It needs a fresh database built from test-support/fixtures/rest-ddl.ts, with a login role for PostgREST,
// and PostgREST run as Supabase runs it (the version Supabase's docker-compose pins, anon role `anon`, max rows 1000):
//
//   bun -e "import { restDdl } from './test-support/fixtures/rest-ddl.ts'; console.log(restDdl)" > rest.sql
//   docker run -d --name rest-pg -p 55802:5432 -e POSTGRES_PASSWORD=oracle postgres:18
//   docker exec rest-pg createdb -U postgres rest && docker exec -i rest-pg psql -U postgres -d rest -v ON_ERROR_STOP=1 < rest.sql
//   docker exec rest-pg psql -U postgres -d rest -c "vacuum analyze" \
//     -c "create role authenticator login noinherit password 'oracle'" -c "grant anon, authenticated, service_role to authenticator"
//   docker run -d --name rest-api --network host -e PGRST_DB_URI=postgres://authenticator:oracle@localhost:55802/rest \
//     -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_DB_MAX_ROWS=1000 -e PGRST_DB_USE_LEGACY_GUCS=false \
//     -e PGRST_JWT_SECRET=<32 characters or more> -e PGRST_SERVER_PORT=55801 postgrest/postgrest:v14.18
//   POSTGREST_URL=http://localhost:55801 POSTGREST_JWT_SECRET=<the same> POSTGREST_VERSION='PostgREST 14.18' \
//     bun packages/server/tests/rest/record-postgrest.ts
//
// The cases write, so each recording needs a fresh database. Then `bun run test:record` records rest.test.ts.
import { createHmac } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { restUsers } from '../../../../test-support/fixtures/rest-ddl'
import { restCases, type RestCase } from './cases'
import { recordedHeaders, type RecordedAnswer } from './answers'

const url = process.env.POSTGREST_URL
const secret = process.env.POSTGREST_JWT_SECRET
if (!url || !secret) throw new Error('Set POSTGREST_URL and POSTGREST_JWT_SECRET')

const base64url = (value: string) => Buffer.from(value).toString('base64url')

const token = (claims: Record<string, unknown>) => {
  const unsigned = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 }))}`
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`
}

// The claims Supabase's gateway gives each caller.
const tokens: Record<RestCase['as'], string> = {
  anon: token({ role: 'anon' }),
  alice: token({ sub: restUsers.alice, role: 'authenticated', aud: 'authenticated' }),
  service: token({ role: 'service_role' }),
}

const answers: RecordedAnswer[] = []
for (const one of restCases) {
  const query = one.query ? `?${new URLSearchParams(one.query)}` : ''
  const response = await fetch(`${url}${one.path}${query}`, {
    method: one.method,
    headers: { authorization: `Bearer ${tokens[one.as]}`, ...(one.body !== undefined && { 'content-type': 'application/json' }), ...one.headers },
    ...(one.body !== undefined && { body: JSON.stringify(one.body) }),
  })
  const text = await response.text()
  answers.push({ name: one.name, status: response.status, headers: recordedHeaders(response.headers), body: text === '' ? null : JSON.parse(text) })
}
await writeFile(new URL('./postgrest.json', import.meta.url), `${JSON.stringify({ server: process.env.POSTGREST_VERSION ?? 'unknown', answers }, null, 2)}\n`)
