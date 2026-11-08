import { workflowResources } from '@protobase/schema/internal'
import { workflowsSchema, type WorkflowsOptions } from './options'

/**
 * What `workflows` in `protobase.config.ts` adds to the app's resources: Workflows, their versions, runs and triggers,
 * over a `workflows` schema that `protobase migration` writes. Who may make, change and run them and read their runs
 * and traces is the resources' access (`workflows.create`, `workflow_runs.create`, `workflow_runs.read`, ...).
 */
export const workflowsModule = (options: Pick<WorkflowsOptions, 'schema'> = {}) => workflowResources(workflowsSchema(options))
