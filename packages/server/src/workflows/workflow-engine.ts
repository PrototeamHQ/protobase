import { httpStep } from './http-step'
import { workflowsSchema, type WorkflowsOptions } from './options'
import { workflowSaveHook } from './save-hook'
import { workflowsRunner } from './segment-job'
import { runStartHook } from './start-hook'

/** What `createAdmin` needs for `workflows`: the step types, the hooks that check saves and start runs, and the segment job. */
export const workflowEngine = (options: WorkflowsOptions) => {
  const schema = workflowsSchema(options)
  const tasks = { http: httpStep({ allowPrivateAddresses: Boolean(options.allowPrivateAddresses) }) }
  const { runner, job } = workflowsRunner(schema, tasks)
  return { hooks: [workflowSaveHook(schema, Object.keys(tasks)), runStartHook(schema, runner)], job }
}
