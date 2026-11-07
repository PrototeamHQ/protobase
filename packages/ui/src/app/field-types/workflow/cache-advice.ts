import type { WorkflowTypeList } from '@protobase/client'
import type { State, TaskState } from '@protobase/workflows'

/** The cache advice the type list gives a Task's step type; none for a type that offers no cache. */
export const cacheAdvice = (state: TaskState, types: WorkflowTypeList | undefined) => types?.step_types.find((type) => type.id === state.Resource)?.cache

/** Whether a workflow forced the cache on for a step whose type advises against it, which its node marks. */
export const cacheForcedAgainst = (state: State, types: WorkflowTypeList | undefined) => state.Type === 'Task' && state.Cache === true && cacheAdvice(state, types)?.choice === 'discouraged'

/**
 * The Task form's cache switch, for every type but one whose cache is `hidden`, a type without a cache included, which
 * a workflow may still force on. A `switch` type's is on as the Task says, else as its default, and off sets `Cache`
 * false; any other's is on only while the Task forces it, and off leaves the type to decide (`Cache` unset).
 */
export const cacheSwitch = (state: TaskState, types: WorkflowTypeList | undefined) => {
  const advice = cacheAdvice(state, types)
  if (advice?.choice === 'hidden') return
  if (advice?.choice === 'switch') return { on: state.Cache ?? advice.default === true, forces: false, offValue: false as const, disclaimer: undefined }
  return { on: state.Cache === true, forces: true, offValue: undefined, disclaimer: advice?.choice === 'discouraged' ? advice.disclaimer : undefined }
}
