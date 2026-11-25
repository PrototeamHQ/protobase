import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import type { Deps } from '../src/deps'
import { connectionUses } from '../src/workflows/connections/connection-uses'
import { runnersOnline } from '../src/workflows/custom-steps/custom-step-tests'
import { wantCustomSteps } from '../src/workflows/custom-steps/wanted-steps'
import { workflowsSchemaSql } from '../src/schema-modules/feature-schemas-sql'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { largeTable, seqScansOf, watchStatements } from '../../../test-support/query-plans'

// The workflows schema's lookups, as they are sent, on as many rows as a busy app holds: each finds its rows by an
// index. Plans a recording cannot make.
vi.setConfig({ testTimeout: 120_000 })

const ready = await postgresTemplateReady('jobs')

const serve = async () => {
  const store = await openPostgresDatabase('jobs')
  await store.exec(workflowsSchemaSql({ customSteps: true }))
  const watched = watchStatements(store)
  const db = new Kysely<any>({ dialect: watched.dialect })
  // The rows, then the statistics the planner reads them by, as autovacuum would keep them.
  const fill = async (statements: string) => {
    await store.exec(`${statements}; analyze`)
    watched.forget()
  }
  return { store, db, fill, ...watched }
}

const manifest = `'Step', '{"image": "step"}', '{}', '{}'`

describe.skipIf(!ready)('the workflows lookups', () => {
  it('find the workflows a person turned on among 100,000 versions', async () => {
    const { db, fill, plansOf } = await serve()
    await fill(`${largeTable('workflows.workflows', ['id'])}; ${largeTable('workflows.versions', ['enabled_by'])};
      insert into workflows.workflows (name, state_machine, trigger) select 'Workflow ' || i, '{}', '{}' from generate_series(1, 100000) i;
      insert into workflows.versions (workflow_id, version, state_machine, trigger, enabled_by)
        select id, 1, '{}', '{}', 'user-' || abs(hashtext(id::text) % 5000) from workflows.workflows`)
    const uses = connectionUses({ deps: () => ({ db }) as unknown as Deps, schema: 'workflows', roles: { roles: async () => [] } as never })
    expect(await uses('user-nobody', ['account-1'])).toEqual({})
    const plans = await plansOf('versions')
    expect(seqScansOf(plans, 'versions')).toEqual([])
    expect(plans).toHaveLength(1)
  })

  it("find a tenant's runners among 20,000 of 2,000 tenants, and the custom step versions a workflow wants", async () => {
    const { db, fill, plansOf } = await serve()
    await fill(`insert into workflows.runners (name, tenant_id, token_hash) select 'Runner ' || i, case when i % 2000 = 0 then null else 'tenant-' || (i % 2000) end, 'hash-' || i from generate_series(1, 20000) i;
      insert into workflows.custom_steps (name, tenant_id, version, label, container, input, output) select 'step_' || i, 'tenant-' || (i % 2000), 2, ${manifest} from generate_series(1, 10000) i;
      insert into workflows.custom_step_versions (custom_step_id, version, tenant_id, name, label, container, input, output)
        select s.id, v, s.tenant_id, s.name, ${manifest} from workflows.custom_steps s, generate_series(1, 2) v;
      insert into workflows.workflows (id, name, state_machine, trigger, tenant_id) values ('00000000-0000-4000-8000-000000000001', 'Uses steps', '{}', '{}', 'tenant-7')`)
    expect(await runnersOnline(db, 'workflows', 'tenant-5')).toEqual({ ids: [], builds: false })
    expect(await runnersOnline(db, 'workflows', undefined)).toEqual({ ids: [], builds: false })
    expect(seqScansOf(await plansOf('runners'), 'runners')).toEqual([])
    const definition = { stateMachine: { StartAt: 'a', States: { a: { Type: 'Task', Resource: 'custom:step_7:2', Next: 'b' }, b: { Type: 'Task', Resource: 'custom:step_8:1', End: true } } } }
    await wantCustomSteps(db, 'workflows', '00000000-0000-4000-8000-000000000001', definition as never)
    const wanted = await db.selectFrom('workflows.custom_step_wanted as w').innerJoin('workflows.custom_step_versions as v', 'v.id', 'w.version_id').select(['v.name', 'v.version']).execute()
    // step_8 is another tenant's.
    expect(wanted).toEqual([{ name: 'step_7', version: 2 }])
    // Each version is found on every key of (coalesce(tenant_id, ''), name, version), not read with the tenant's others.
    const plans = await plansOf('custom_step_versions')
    expect(seqScansOf(plans, 'custom_step_versions')).toEqual([])
    expect(plans[0]).toMatch(/Index Cond: \(\(COALESCE\(tenant_id, ''::text\) = .*\(name = s\.name\) AND \(version = s\.version\)\)/)
  })
})
