import { useList } from '../../../data/use-list'
import { useRecord } from '../../../data/use-record'
import { useAppAddress } from '../../use-app-address'
import { useRunTrace } from '../workflow-run/use-run-trace'
import { workflowsResource, type WorkflowView } from './workflow-view'

/** The most versions the version selector offers, the latest first: one page of the API. */
export const versionLimit = 100

/** The most runs the run selector offers, the latest first, besides the run shown. */
export const runLimit = 20

const numberOf = (value: unknown) => (value === null || value === undefined ? undefined : Number(value))

/** The workflow's page the address shows, as logical values, or none on another page, such as the create form. */
export const useWorkflowView = (): WorkflowView | undefined => {
  const { address } = useAppAddress()
  if (address?.kind !== 'record' || address.resource !== workflowsResource) return
  return { workflow: address.key, ...(address.version !== undefined && { version: address.version }), ...(address.run && { run: address.run }) }
}

/**
 * What a workflow's page draws besides its definition: its latest and enabled version, its versions and latest runs for
 * the selectors, the run shown with its trace, and the version shown, the run's own while one is shown, with its
 * definition when it is not the latest.
 */
export const useWorkflowPage = (view: WorkflowView) => {
  const workflow = useRecord(workflowsResource, view.workflow)
  const latest = numberOf(workflow.data?.record.version)
  const enabled = numberOf(workflow.data?.record.enabled_version)
  const byWorkflow = `workflow_id = ${JSON.stringify(view.workflow)}`
  const versions = useList('workflow_versions', { filter: byWorkflow, orderBy: 'version desc', pageSize: versionLimit, fields: ['version', 'saved_at'] })
  const runs = useList('workflow_runs', { filter: byWorkflow, orderBy: 'created_at desc', pageSize: runLimit, fields: ['id', 'status', 'version', 'created_at'] })
  const trace = useRunTrace(view.run)
  const runVersion = numberOf(trace.run?.version)
  const shown = view.run !== undefined ? runVersion : view.version
  // A version shown without a run is drawn from its own record; a run's trace reads the version it ran on itself
  const past = useRecord('workflow_versions', [view.workflow, shown ?? 0], view.run === undefined && shown !== undefined)
  return {
    latest,
    enabled,
    versions: versions.items.map((row) => ({ version: Number(row.version), savedAt: String(row.saved_at) })),
    runs: runs.items,
    trace,
    shown,
    pastDefinition: past.data?.record.definition,
    versionsError: versions.error,
    runsError: runs.error,
    pastError: past.error,
  }
}

export type WorkflowPage = ReturnType<typeof useWorkflowPage>
