import { workflowResources } from '@protobase/schema/internal'
import { workflowsSchema, type WorkflowsOptions } from './options'

/**
 * What `workflows` in `protobase.config.ts` adds to the app's resources: Workflows, their versions, runs and steps,
 * over a `workflows` schema that `protobase migration` writes. Who may make, change and run them and read their runs
 * is the resources' access (`workflows.create`, `workflow_runs.create`, `workflow_steps.read`, ...).
 */
export const workflowsModule = (options: WorkflowsOptions = {}) => workflowResources(workflowsSchema(options))
