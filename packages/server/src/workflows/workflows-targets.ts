import { workflowsCustomStepsOn, workflowsSchema, workflowsStorageOn, type WorkflowsOptions } from './options'

/** The schema modules `workflows` needs, all in the schema it names: the workflows schema, and its storage and custom steps while they are on. */
export const workflowsTargets = (options: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'>) => {
  const input = { names: { schema: workflowsSchema(options) }, resources: {} }
  return {
    workflows: input,
    ...(workflowsStorageOn(options) && { workflow_storage: input }),
    ...(workflowsCustomStepsOn(options) && { workflow_custom_steps: input }),
  }
}
