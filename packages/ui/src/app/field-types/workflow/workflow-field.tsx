import { lazy, Suspense } from 'react'
import { builtInFieldTypes } from '@protobase/schema/internal'
import type { Definition } from '@protobase/workflows'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import type { FieldWidget, FieldWidgetEditorProps, FieldWidgetProps } from '../field-widget'
import { allNames, definitionOf } from './definition'
import { useWorkflowTypes } from './use-workflow-types'
import { text } from './messages'

// React Flow, ELK and the definition's check load with the first workflow drawn, not with the app.
const WorkflowGraphEditor = lazy(() => import('./workflow-graph-editor').then((module) => ({ default: module.WorkflowGraphEditor })))

const Loading = () => <Skeleton className="h-[28rem] w-full max-sm:h-[22rem]" />

// The graph once the app's trigger and step types are read, which its menus, forms and check are drawn from
const Graph = ({ value, onChange }: { value: unknown; onChange?: (definition: Definition) => void }) => {
  const types = useWorkflowTypes()
  if (types.error) return <ErrorBanner title={text('typesFailed')} error={types.error} />
  if (!types.data) return <Loading />
  return (
    <Suspense fallback={<Loading />}>
      <WorkflowGraphEditor value={value} types={types.data} {...(onChange && { onChange })} />
    </Suspense>
  )
}

/** A workflow's graph, to look at: the chosen node's fields show under it, unchangeable. */
const WorkflowDisplay = ({ value }: FieldWidgetProps) => <Graph value={value} />

/** A workflow's graph to edit: each change is the definition the form saves. */
const WorkflowEditor = ({ value, onChange }: FieldWidgetEditorProps) => <Graph value={value} onChange={onChange} />

/** In a list, how many states the workflow has. */
const WorkflowCell = ({ value }: FieldWidgetProps) => <span className="tabular-nums">{text('stateCount', { count: allNames(definitionOf(value).stateMachine).length })}</span>

/**
 * The built-in `workflow` field type, for a JSON field holding a workflow's definition, as the `workflows` resource
 * does: `r.definition.widget('workflow')`. The record page draws the definition as a graph to edit. See the workflows
 * reference.
 */
export const workflowField: FieldWidget = { of: [...builtInFieldTypes.workflow], display: WorkflowDisplay, editor: WorkflowEditor, cell: WorkflowCell, wide: true }
