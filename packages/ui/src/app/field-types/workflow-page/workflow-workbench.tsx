import { useEffect } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { useAppAddress } from '../../use-app-address'
import { RunTraceView } from '../workflow-run/run-trace-view'
import { WorkflowGraphEditor } from '../workflow/workflow-graph-editor'
import { RunActions } from './run-actions'
import { RunSummary } from './run-summary'
import { ShownNotice } from './shown-notice'
import { useWorkflowPage } from './use-workflow-page'
import { WorkbenchToolbar } from './workbench-toolbar'
import { runAddress, type WorkflowView } from './workflow-view'
import { text } from './messages'

export type WorkflowWorkbenchProps = {
  view: WorkflowView
  /** The definition as the record holds it, its latest version. */
  value: unknown
  types: WorkflowTypeList
  /** Without it, the latest version is only shown, as to someone who may not change it. */
  onChange?: (definition: Definition) => void
}

/**
 * A workflow's page around its graph: the version and run selectors, then the latest version to edit; an older one,
 * read-only; or a run on the version it ran on, marked live while it goes on. A bar above the graph and the side panel
 * say in words what is shown when it is not the latest version.
 */
export const WorkflowWorkbench = ({ view, value, types, onChange }: WorkflowWorkbenchProps) => {
  const page = useWorkflowPage(view)
  const { go } = useAppAddress()
  // A run opened by its own address, such as /workflow_runs/<id>, puts the version it ran on in the address too
  useEffect(() => {
    if (view.run !== undefined && page.shown !== undefined && view.version !== page.shown) go(runAddress(view.workflow, view.run, page.shown), { replace: true })
  }, [view.run, view.version, page.shown])
  const notice = <ShownNotice view={view} page={page} />
  const graph = () => {
    if (view.run !== undefined) {
      const panelTop = (
        <>
          {notice}
          <RunActions trace={page.trace} />
        </>
      )
      return <RunTraceView key={view.run} trace={page.trace} types={types} notice={panelTop} idle={<RunSummary trace={page.trace} />} />
    }
    if (view.version === undefined) return <WorkflowGraphEditor value={value} types={types} {...(onChange && { onChange })} />
    if (page.pastError) return <ErrorBanner title={text('versionFailed')} error={page.pastError} />
    if (page.pastDefinition === undefined) return <Skeleton className="h-[28rem] w-full max-sm:h-[22rem]" />
    return <WorkflowGraphEditor key={view.version} value={page.pastDefinition} types={types} notice={notice} />
  }
  return (
    <div className="flex flex-col gap-3">
      <WorkbenchToolbar view={view} page={page} />
      {notice}
      {graph()}
    </div>
  )
}
