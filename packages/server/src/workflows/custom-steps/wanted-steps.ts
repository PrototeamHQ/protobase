import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { customStepOf, resources, type Definition } from '@protobase/workflows'

/**
 * Keeps the custom step versions the workflow's published definition uses as wanted, in place of the ones it wanted
 * before, so runners that build are sent `prepare` for them; a workflow turned off (`definition` undefined) wants none.
 */
export const wantCustomSteps = async (trx: Db, schema: string, workflow: string, definition: Definition | undefined) => {
  const wanted = sql.id(schema, 'custom_step_wanted')
  await sql`delete from ${wanted} where workflow_id = ${workflow}`.execute(trx)
  const steps = [...new Set(definition ? resources(definition.stateMachine) : [])].flatMap((type) => {
    const step = customStepOf(type)
    return step ? [step] : []
  })
  if (steps.length === 0) return
  await sql`insert into ${wanted} (workflow_id, version_id, tenant_id)
    select w.id, v.id, w.tenant_id from ${sql.id(schema, 'workflows')} w
    cross join unnest(${steps.map((step) => step.name)}::text[], ${steps.map((step) => step.version)}::integer[]) as s(name, version)
    join ${sql.id(schema, 'custom_step_versions')} v on coalesce(v.tenant_id, '') = coalesce(w.tenant_id, '') and v.name = s.name and v.version = s.version
    where w.id = ${workflow} and v.custom_step_id is not null
    on conflict do nothing`.execute(trx)
}
