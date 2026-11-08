import { workflowResources } from '@protobase/schema/internal'
import { workflowsSchema, workflowsStorage, type WorkflowsOptions } from './options'

/**
 * What `workflows` in `protobase.config.ts` adds to the app's resources: Workflows, their versions, runs and triggers,
 * over a `workflows` schema that `protobase migration` writes, and with `storage` their storage configurations. Who may
 * make, change and run them and read their runs and traces is the resources' access (`workflows.create`,
 * `workflow_runs.create`, `workflow_runs.read`, `storage_configurations.read`, ...).
 */
export const workflowsModule = (options: Pick<WorkflowsOptions, 'schema' | 'storage'> = {}) =>
  workflowResources(workflowsSchema(options), { storage: workflowsStorage(options) !== undefined })
