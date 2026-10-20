import { describe, expect, it } from 'vitest'
import { importPlan, probedExtensions } from './import-plan'

const extensions = [
  { name: 'pg_net', schema: 'extensions' },
  { name: 'pg_trgm', schema: 'extensions' },
  { name: 'pgmq', schema: 'pgmq' },
  { name: 'plv8', schema: 'pg_catalog' },
  { name: 'supabase_vault', schema: 'vault' },
]
const webhook = { schema: 'public', table: 'orders', trigger: 'order_placed', function: 'supabase_functions.http_request' }

describe('probedExtensions', () => {
  it("asks about the app's extensions and Vault", () => {
    expect(probedExtensions([...extensions, { name: 'pg_graphql', schema: 'graphql' }])).toEqual(['pg_net', 'pg_trgm', 'pgmq', 'plv8', 'supabase_vault'])
  })
})

describe('importPlan', () => {
  it('carries over what a database with Supabase extensions can create', () => {
    const plan = importPlan({ extensions, httpTriggers: [webhook] }, new Set(['pg_net', 'pg_trgm', 'pgmq', 'supabase_vault']))
    expect(plan.extensions.map((extension) => extension.name)).toEqual(['pg_net', 'pg_trgm', 'pgmq', 'supabase_vault'])
    expect(plan.leftOut).toEqual([{ name: 'plv8', schema: 'pg_catalog' }])
    expect(plan).toMatchObject({ vault: true, queues: true, webhooks: true, httpSent: true })
    expect(plan.missing).toEqual({ triggerSchemas: ['_timescaledb_functions', '_timescaledb_internal'], languages: ['plv8'] })
  })

  it('leaves the rest to the report on a database with only trusted extensions', () => {
    const plan = importPlan({ extensions, httpTriggers: [webhook] }, new Set(['pg_trgm']))
    expect(plan.extensions.map((extension) => extension.name)).toEqual(['pg_trgm'])
    expect(plan).toMatchObject({ vault: false, queues: false, webhooks: false, httpSent: false })
    expect(plan.missing.triggerSchemas).toContain('supabase_functions')
  })

  it('makes no webhooks shim for an app without webhooks', () => {
    expect(importPlan({ extensions, httpTriggers: [] }, new Set(['pg_net'])).webhooks).toBe(false)
  })
})
