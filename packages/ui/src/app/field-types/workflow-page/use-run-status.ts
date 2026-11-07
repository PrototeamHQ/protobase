import { enumLabel } from '@protobase/schema'
import { useAdminMeta } from '../../meta-gate'

/** A run's status as the runs' view labels it, with the view's hints for its badge. */
export const useRunStatus = () => {
  const hints = useAdminMeta().views.workflow_runs?.fields.status
  return { hints, label: (status: unknown) => enumLabel(String(status), hints?.valueLabels) }
}
