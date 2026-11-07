import type { AppAddress } from '@protobase/schema'

/** The resource whose record pages draw a workflow with its versions and runs. */
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

/** The page showing the run on the version it ran on, which is in the address even when it is the latest: a run is only read. */
export const runAddress = (workflow: string, run: string, version: number) => workflowViewAddress({ workflow, version, run })

/** The page once the run shown is closed: the version it ran on stays, unless it is the latest. */
export const closedRunAddress = ({ workflow, version }: WorkflowView, latest: number | undefined) => (version === undefined ? workflowViewAddress({ workflow }) : versionAddress(workflow, version, latest))
