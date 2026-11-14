import { lazy, Suspense } from 'react'
import { builtInFieldTypes } from '@protobase/schema/internal'
import type { Definition } from '@protobase/workflows'
import { FieldControlContext } from '../../../primitives/field-control'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import type { FieldWidget, FieldWidgetEditorProps, FieldWidgetProps } from '../field-widget'
import { useFocusRecord } from '../../focus/focus-record'
import { allNames, definitionOf, definitionRecord, recordDefinition } from './definition'
import { useWorkflowView } from '../workflow-page/use-workflow-page'
import { useWorkflowTypes } from './use-workflow-types'
import { text } from './messages'

// React Flow, ELK and the definition's check load with the first workflow drawn, not with the app.
const WorkflowGraphEditor = lazy(() => import('./workflow-graph-editor').then((module) => ({ default: module.WorkflowGraphEditor })))
const WorkflowWorkbench = lazy(() => import('../workflow-page/workflow-workbench').then((module) => ({ default: module.WorkflowWorkbench })))

const Loading = () => <Skeleton className="h-full min-h-[22rem] w-full" />

// The definition fields beside the state machine, which a workflow's page keeps in its record's draft
const otherFields = ['trigger', 'execution_order', 'connections', 'trace'] as const

/**
 * The definition the state machine `value` is part of, and the way to change it: on a workflow's page with the trigger,
 * execution order, connections and trace of the record's draft, each change written to the fields it changed;
 * elsewhere, as on the standard form, the state machine alone, run by hand in sequence.
 */
const useDefinition = (value: unknown, onChange?: (stateMachine: unknown) => void) => {
  const focus = useFocusRecord()
  // A draft keeps a JSON field as its text until it is changed, and an empty field as ''
  const draft = (name: (typeof otherFields)[number]) => {
    const kept = focus?.value(name)
    if (kept === '' || kept === undefined) return null
    if (typeof kept !== 'string' || (name !== 'trigger' && name !== 'connections')) return kept
    try {
      return JSON.parse(kept) as unknown
    } catch {
      return kept
    }
  }
  const definition = focus ? recordDefinition({ ...Object.fromEntries(otherFields.map((name) => [name, draft(name)])), state_machine: value }) : definitionOf({ stateMachine: value })
  const change =
    onChange &&
    ((next: Definition) => {
      const fields = definitionRecord(next)
      onChange(fields.state_machine)
      if (!focus) return
      for (const name of otherFields) if (JSON.stringify(fields[name]) !== JSON.stringify(draft(name))) focus.change(name, fields[name])
    })
  return { definition, change }
}

// The graph once the app's trigger and step types are read, which its menus, forms and check are drawn from: on a
// focus page with the workflow's versions and runs, elsewhere, as on the create form, on its own
const Graph = ({ value: stateMachine, onChange: changeMachine }: { value: unknown; onChange?: (stateMachine: unknown) => void }) => {
  const types = useWorkflowTypes()
  const view = useWorkflowView()
  const { definition: value, change: onChange } = useDefinition(stateMachine, changeMachine)
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
const WorkflowCell = ({ value }: FieldWidgetProps) => <span className="tabular-nums">{text('stateCount', { count: allNames(definitionOf({ stateMachine: value }).stateMachine).length })}</span>

/**
 * The built-in `workflow` field type, for a JSON field holding a workflow's state machine, as the `workflows` resource
 * does: `r.state_machine.widget('workflow')`. The record page draws the definition as a graph to edit, with the
 * workflow's versions and runs to show on it. See the workflows reference.
 */
export const workflowField: FieldWidget = { of: [...builtInFieldTypes.workflow], display: WorkflowDisplay, editor: WorkflowEditor, cell: WorkflowCell, wide: true }
