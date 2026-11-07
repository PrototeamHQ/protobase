import { builtInFieldTypes } from '@protobase/schema/internal'
import { StatusDot } from '../../../app-shell/status-dot'
import { useRecord } from '../../../data/use-record'
import { Button } from '../../../primitives/button'
import { AppLink } from '../../use-app-address'
import type { FieldWidget, FieldWidgetProps } from '../field-widget'
import { useWorkflowView } from '../workflow-page/use-workflow-page'
import { workflowsResource, workflowViewAddress } from '../workflow-page/workflow-view'
import { ResolvedBy } from './resolved-by'
import { statusReason } from './status-reason'
import { useResolve } from './use-resolve'
import { text } from './messages'

// The status of the workflow the page shows, said in words that link to the run they name, with Mark as resolved while
// failures count and who last marked it.
const StatusOf = ({ workflow, value }: { workflow: string; value: string }) => {
  const stored = useRecord(workflowsResource, workflow).data
  const record = stored?.record
  const resolver = useResolve(workflow, stored?.permissions?.update !== false)
  const reason = record && statusReason({ ...record, run_status: value })
  if (!record || !reason) return null
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-body" data-status={reason.status}>
          <StatusDot tone={reason.tone} />
          {reason.run ? (
            <AppLink to={workflowViewAddress({ workflow, run: reason.run })} className="font-medium text-primary-text hover:underline">
              {reason.words}
            </AppLink>
          ) : (
            <span>{reason.words}</span>
          )}
        </span>
        {reason.resolvable && resolver.permitted && (
          <Button size="sm" loading={resolver.busy} onClick={() => void resolver.resolve()}>
            {text('resolve')}
          </Button>
        )}
      </div>
      {record.resolved_at != null && <ResolvedBy by={record.resolved_by == null ? null : String(record.resolved_by)} at={String(record.resolved_at)} />}
    </div>
  )
}

const StatusDisplay = ({ value }: FieldWidgetProps<string>) => {
  const view = useWorkflowView()
  return value === null || !view ? null : <StatusOf workflow={view.workflow} value={value} />
}

/**
 * The built-in `workflow_status` field type, for a workflow's status from its last runs, as the `workflows` resource
 * shows its own: `r.run_status.widget('workflow_status')`. A workflow's page says the reason in words, linking to the
 * run it names, with Mark as resolved while a failure counts for whoever may change the workflow, and who last marked
 * it and when. See the workflows reference.
 */
export const workflowStatusField: FieldWidget = { of: [...builtInFieldTypes.workflow_status], display: StatusDisplay }
