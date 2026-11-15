import { quoteIdent } from '../changes/capture-sql'

/**
 * A custom step's test run: a run of no workflow, which runs one custom step version (`test_step`,
 * `custom:<name>:<version>`) alone, on the run's input as its arguments, as the user who started it in their tenant.
 * Only the engine starts one; the API keeps the column out of reach, so every run it starts names its workflow. Every
 * statement is idempotent.
 */
export const testRunsSql = (schema: string) => {
  const s = quoteIdent(schema)
  return `alter table ${s}."runs" add column if not exists "test_step" text;
alter table ${s}."runs" alter column "workflow_id" drop not null;
alter table ${s}."runs" drop constraint if exists "runs_workflow_or_test";
alter table ${s}."runs" add constraint "runs_workflow_or_test" check (("workflow_id" is null) = ("test_step" is not null))`
}
