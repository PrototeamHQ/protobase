import { lazy, Suspense } from 'react'
import { builtInFieldTypes } from '@protobase/schema/internal'
import type { Definition } from '@protobase/workflows'
import { FieldControlContext } from '../../../primitives/field-control'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import type { FieldWidget, FieldWidgetEditorProps, FieldWidgetProps } from '../field-widget'
import { allNames, definitionOf } from './definition'
import { useWorkflowView } from '../workflow-page/use-workflow-page'
import { useWorkflowTypes } from './use-workflow-types'
import { text } from './messages'

// React Flow, ELK and the definition's check load with the first workflow drawn, not with the app.
const WorkflowGraphEditor = lazy(() => import('./workflow-graph-editor').then((module) => ({ default: module.WorkflowGraphEditor })))
const WorkflowWorkbench = lazy(() => import('../workflow-page/workflow-workbench').then((module) => ({ default: module.WorkflowWorkbench })))

const Loading = () => <Skeleton className="h-[28rem] w-full max-sm:h-[22rem]" />

// The graph once the app's trigger and step types are read, which its menus, forms and check are drawn from: on a
// workflow's page with its versions and runs, elsewhere, as on the create form, on its own
const Graph = ({ value, onChange }: { value: unknown; onChange?: (definition: Definition) => void }) => {
  const types = useWorkflowTypes()
  const view = useWorkflowView()
  if (types.error) return <ErrorBanner title={text('typesFailed')} error={types.error} />
  if (!types.data) return <Loading />
  // The graph holds many controls, each with a label of its own: none of them is the field's one control
  return (
    <FieldControlContext.Provider value={undefined}>
      <Suspense fallback={<Loading />}>
        {view ? <WorkflowWorkbench view={view} value={value} types={types.data} {...(onChange && { onChange })} /> : <WorkflowGraphEditor value={value} types={types.data} {...(onChange && { onChange })} />}
      </Suspense>
    </FieldControlContext.Provider>
  )
}

/** A workflow's graph, to look at: the chosen node's fields show beside it, unchangeable. */
const WorkflowDisplay = ({ value }: FieldWidgetProps) => <Graph value={value} />

/** A workflow's graph to edit: each change is the definition the form saves. */
const WorkflowEditor = ({ value, onChange }: FieldWidgetEditorProps) => <Graph value={value} onChange={onChange} />

/** In a list, how many states the workflow has. */
const WorkflowCell = ({ value }: FieldWidgetProps) => <span className="tabular-nums">{text('stateCount', { count: allNames(definitionOf(value).stateMachine).length })}</span>

/**
 * The built-in `workflow` field type, for a JSON field holding a workflow's definition, as the `workflows` resource
 * does: `r.definition.widget('workflow')`. The record page draws the definition as a graph to edit, with the
 * workflow's versions and runs to show on it. See the workflows reference.
 */
export const workflowField: FieldWidget = { of: [...builtInFieldTypes.workflow], display: WorkflowDisplay, editor: WorkflowEditor, cell: WorkflowCell, wide: true }
