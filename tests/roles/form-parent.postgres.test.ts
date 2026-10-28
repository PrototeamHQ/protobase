import { sql } from 'kysely'
import { solveChallenge, type Challenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/sha'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource, view } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { testAuthenticator } from '../../test-support/server'

// A visitor's public form that creates a record under a parent (`.parent()`), set by a column default since a form takes
// no relation: the parent is checked with the anonymous role's own access to it, so a visitor who may read a product
// reviews it, and one who may not update it suggests no change.

const products = resource('products').table('products').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id)
const child = (name: string, need: 'read' | 'update') =>
  resource(name).table(name).fields({ id: f.integer().readOnly(), product_id: f.relation('products').dbDefault(), body: f.text() }).primaryKey((r) => r.id).parent((r) => r.product_id, need)
const reviews = child('product_reviews', 'read')
const suggestions = child('product_suggestions', 'update')

const roles = defineRoles<'products' | 'product_reviews' | 'product_suggestions'>({
  admin: ['*'],
  anonymous: [{ 'products.read': ['id', 'name'] }, { 'product_reviews.create': ['body'] }, { 'product_suggestions.create': ['body'] }],
})

const formOf = (name: string, form: string) => view<typeof reviews>(name).form((r) => ({ name: form, title: form, fields: [r.body], thanks: 'Thanks.' }))

describe.skipIf(!(await postgresTemplateReady('empty')))('a public form creating under a parent', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create table products (id integer primary key, name text not null);
      create table product_reviews (id integer generated always as identity primary key, product_id integer not null default 1 references products, body text not null);
      create table product_suggestions (id integer generated always as identity primary key, product_id integer not null default 1 references products, body text not null);
      insert into products (id, name) values (1, 'lamp');`)
    app = createAdmin({
      resources: [products, reviews, suggestions],
      views: [formOf('product_reviews', 'review'), formOf('product_suggestions', 'suggest')],
      db: database.db,
      authenticate: testAuthenticator,
      secret: 'forms secret',
      options: { roles },
      formsDifficulty: { min: 1, max: 20 },
    })
  })
  afterAll(async () => { await database?.close() })

  const submit = async (form: string, values: Record<string, unknown>) => {
    const challenge = (await (await app.request(`/api/forms/${form}:challenge`)).json()) as Challenge
    const proof = { challenge, solution: (await solveChallenge({ challenge, deriveKey }))! }
    return app.request(`/api/forms/${form}`, { method: 'POST', body: JSON.stringify({ values, proof }), headers: { 'content-type': 'application/json' } })
  }
  const count = async (table: string) => (await sql.raw<{ count: number }>(`select count(*)::int as count from ${table}`).execute(database.db)).rows[0]!.count

  it('creates under a parent the visitor may read, when the parent needs read', async () => {
    expect((await submit('review', { body: 'bright' })).status).toBe(204)
    expect(await count('product_reviews')).toBe(1)
  })

  it('refuses, writing nothing, under a parent the visitor may not update, when the parent needs update', async () => {
    const response = await submit('suggest', { body: 'dimmer' })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:access-denied' })
    expect(await count('product_suggestions')).toBe(0)
  })
})
