import { requiredStepInputs, workflowStepTypes } from '@protobase/schema/internal'
import { checkDefinition, type Definition, type Problem } from '@protobase/workflows'
import { triggerId } from './definition'

/** A problem as its node shows it: the field it is about, if any, and what is wrong. */
export type NodeProblem = { field?: string; message: string }

/**
 * The problems the server's save would refuse the definition for, by the node each is about: a state's own, and the
 * trigger's and the first state's on the trigger; any other is about the whole definition, in `whole`.
 */
export const problemsByNode = (problems: readonly Problem[]) => {
  const byNode = new Map<string, NodeProblem[]>()
  const whole: NodeProblem[] = []
  const add = (id: string, problem: NodeProblem) => byNode.set(id, [...(byNode.get(id) ?? []), problem])
  for (const { state, field, message } of problems) {
    const shown = { ...(field !== undefined && { field }), message }
    if (state !== undefined) add(state, shown)
    else if (field?.startsWith('trigger') || field === 'StartAt' || field === 'stateMachine.StartAt') add(triggerId, shown)
    else whole.push(shown)
  }
  return { byNode, whole }
}

/** The check every save of a workflow runs on the server, with the step types the app has. */
export const definitionProblems = (definition: Definition) => checkDefinition(definition, { resources: Object.keys(workflowStepTypes), required: requiredStepInputs })
