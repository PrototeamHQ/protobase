import type { AppAddress } from '@protobase/schema'

/** The resource of a workflow's record. */
export const workflowsResource = 'workflows'

/**
 * What a workflow's page shows on its graph: the workflow, by key, the saved version chosen, the latest when omitted,
 * and the run opened on it, by key.
 */
export type WorkflowView = { workflow: string; version?: number; run?: string }

/** The address of a workflow's page showing `view`. */
export const workflowViewAddress = ({ workflow, version, run }: WorkflowView): AppAddress => ({
  kind: 'record',
  resource: workflowsResource,
  key: workflow,
  ...(version !== undefined && { version }),
  ...(run && { run }),
})

/** The page showing `version` with no run, the address leaving out the latest, which the page shows by itself. */
export const versionAddress = (workflow: string, version: number, latest: number | undefined) => workflowViewAddress({ workflow, ...(version !== latest && { version }) })

/** The page showing a run: on the latest version, to edit, when it ran on that one; else on the version it ran on, read-only. */
export const runAddress = (workflow: string, run: string, version: number, latest: number | undefined) => workflowViewAddress({ workflow, ...(version !== latest && { version }), run })

/** The page with the run shown hidden: the version shown stays, unless it is the latest. */
export const closedRunAddress = ({ workflow, version }: WorkflowView, latest: number | undefined) => (version === undefined ? workflowViewAddress({ workflow }) : versionAddress(workflow, version, latest))
