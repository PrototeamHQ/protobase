import type { State } from './types'

/**
 * The States Language's suffix for a Task that hands its work off and waits for an outside result: its step type gets
 * the try's token as `$states.context.Task.Token`, and the Task ends when someone sends that token back with a result
 * or a failure, or when its `TimeoutSeconds` or `HeartbeatSeconds` pass.
 */
export const waitSuffix = '.waitForTaskToken'

/** A Task's step type, and whether it waits for an outside result once that type handed the work off. */
export const taskResource = (resource: string) => (resource.endsWith(waitSuffix) ? { type: resource.slice(0, -waitSuffix.length), waits: true } : { type: resource, waits: false })

/** Whether a state is a Task that waits for an outside result. */
export const waitsForToken = (state: State) => state.Type === 'Task' && taskResource(state.Resource).waits
