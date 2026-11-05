import { lazy, Suspense } from 'react'
import { builtInFieldTypes } from '@protobase/schema/internal'
import { Skeleton } from '../../../primitives/skeleton'
import type { FieldWidget, FieldWidgetProps } from '../field-widget'

// React Flow and ELK load with the first run drawn, not with the app.
const RunTrace = lazy(() => import('./run-trace-view').then((module) => ({ default: module.RunTrace })))

const RunDisplay = ({ value }: FieldWidgetProps<string>) =>
  value === null ? null : (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-sm:h-[22rem]" />}>
      <RunTrace runId={value} />
    </Suspense>
  )

const RunCell = ({ value }: FieldWidgetProps<string>) => <span className="font-mono text-xs">{value}</span>

/**
 * The built-in `workflow_run` field type, for a run's id, as the `workflow_runs` resource shows its own:
 * `r.id.widget('workflow_run')`. The record page draws the run's steps on its workflow's graph, followed live while the
 * run goes on, and the chosen step's input, output, logs, timing, tries and error under it. See the workflows reference.
 */
export const workflowRunField: FieldWidget = { of: [...builtInFieldTypes.workflow_run], display: RunDisplay, cell: RunCell, wide: true }
