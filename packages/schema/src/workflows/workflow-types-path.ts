/** The path of the app's workflow trigger and step types under the API's system path (`/api`), as the editor reads them. */
export const workflowTypesPath = (systemPath: string) => `${systemPath}/workflows/types`

/**
 * A trigger or step type as the server lists it: `id` is a Task's `Resource` or the key of a definition's `trigger`,
 * `input` the JSON Schema of its input, and `available` false, with the `reason`, when this app cannot run it.
 */
export type WorkflowTypeEntry = { id: string; kind: string; label: string; description: string; input: Record<string, unknown>; available: boolean; reason?: string; cache?: WorkflowCacheAdvice }

/**
 * A step type's cache advice: how much the workflow's author decides (`hidden` nothing, `switch` on or off, `force` and
 * `discouraged` forcing it on, the latter after its `disclaimer`), and the switch's default.
 */
export type WorkflowCacheAdvice = { choice: 'hidden' | 'switch' | 'force' | 'discouraged'; default?: boolean; disclaimer?: string }

/** The app's step types and triggers, `manual` among them, built-in and plugin types alike. */
export type WorkflowTypeList = { step_types: WorkflowTypeEntry[]; triggers: WorkflowTypeEntry[] }
