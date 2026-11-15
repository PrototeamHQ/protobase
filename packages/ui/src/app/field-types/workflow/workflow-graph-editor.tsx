import { useMemo, useState, type ReactNode } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { Plus } from 'lucide-react'
import { Button } from '../../../primitives/button'
import { SearchPicker } from '../../../search-picker'
import { pickedState, stepGroups } from '../workflow-page/step-catalog'
import { definitionOf, holdsSteps, pathOf, stateAt, triggerId } from './definition'
import { addState, addStateAt, freeName, scopeAt, type AddAt, type NewState } from './definition-edits'
import { GraphFrame, PanelHint } from './graph-frame'
import { NodePanel } from './node-panel'
import { ProblemList } from './problem-list'
import { definitionProblems, problemsByNode, warningsByNode } from './problems'
import { canvasEdits } from './canvas-edits'
import { WorkflowCanvas } from './workflow-canvas'
import { usePinSchemas } from './pins/pin-schemas'
import type { WorkflowLayout } from './manual-layout'
import { text } from './messages'

export type WorkflowGraphEditorProps = {
  /** The definition as the field holds it; none starts an empty workflow. */
  value: unknown
  /** The app's trigger and step types, its plugins' included, as the server lists them. */
  types: WorkflowTypeList
  /** Without it, the workflow is only shown. */
  onChange?: (definition: Definition) => void
  /** What the side panel says first, such as that the version shown is only read. */
  notice?: ReactNode
  /** Where nodes were moved by hand in each view. */
  layout?: WorkflowLayout
  /** Without it, nodes are not moved by hand. */
  onLayoutChange?: (layout: WorkflowLayout) => void
}

// A new state goes into the Map or Block chosen, or the one the chosen state is in, else into the workflow itself.
const scopeFor = (definition: Definition, selected: string | undefined): string[] => {
  if (selected === undefined || selected === triggerId) return []
  const names = selected.split('/')
  return holdsSteps(stateAt(definition, selected)) ? names : names.slice(0, -1)
}

/**
 * A workflow's definition as a graph to see and edit where it is one field of a form: the picker that adds a state, the canvas, which ELK lays out on
 * each change, and the chosen node's fields in the side panel beside it. Every problem the save's check would refuse it for shows on the
 * node it names as it is edited, and the rest above the canvas.
 */
export const WorkflowGraphEditor = ({ value, types, onChange, notice, layout, onLayoutChange }: WorkflowGraphEditorProps) => {
  // The form hands the value over anew on each render: the definition changes only when its JSON does
  const json = JSON.stringify(value ?? null)
  const definition = useMemo(() => definitionOf(JSON.parse(json)), [json])
  const schemas = usePinSchemas(types)
  const checked = useMemo(() => problemsByNode(definitionProblems(definition, types, schemas)), [definition, types, schemas])
  const warned = useMemo(() => warningsByNode(definition), [definition])
  const [chosen, setChosen] = useState<string>()
  // The step picker has the side panel, for a step at the handle clicked or, from Add step, in the scope chosen
  const [adding, setAdding] = useState<{ at?: AddAt }>()
  const groups = useMemo(() => stepGroups(types), [types])
  // A node the definition no longer has is no longer chosen
  const selected = chosen === triggerId || (chosen !== undefined && stateAt(definition, chosen)) ? chosen : undefined
  const scope = scopeFor(definition, selected)

  const add = (kind: NewState, at?: AddAt) => {
    if (!onChange) return
    const name = freeName(definition, text('newStep'))
    onChange(at ? addStateAt(definition, kind, name, text('newStep'), at) : addState(definition, scope, kind, name, text('newStep')))
    setChosen(pathOf(at ? scopeAt(at) : scope, name))
    setAdding(undefined)
  }

  return (
    <div className="flex flex-col gap-3">
      {onChange && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAdding(adding ? undefined : {})} aria-expanded={Boolean(adding)}>
            <Plus className="size-3.5" aria-hidden />
            {scope.length > 0 ? text('addStepInside', { map: scope.join('/') }) : text('addStep')}
          </Button>
          <p className="text-xs text-muted-foreground">{text('connectHelp')}</p>
        </div>
      )}
      <ProblemList problems={checked.whole} />
      <GraphFrame
        canvas={<WorkflowCanvas definition={definition} problems={checked.byNode} warnings={warned} selected={selected} onSelect={setChosen} onChange={onChange} edits={canvasEdits} onAddAt={(at) => setAdding({ at })} types={types} schemas={schemas} layout={layout} onLayoutChange={onLayoutChange} />}
        panel={
          <>
            {notice}
            {adding ? (
              <SearchPicker autoFocus groups={groups} onPick={(item) => add(pickedState(item.id), adding.at)} />
            ) : selected === undefined ? (
              <PanelHint>{text('pickNode')}</PanelHint>
            ) : (
              <NodePanel definition={definition} types={types} selected={selected} problems={checked.byNode.get(selected) ?? []} warnings={warned.get(selected) ?? []} onChange={onChange} onSelect={setChosen} />
            )}
          </>
        }
      />
    </div>
  )
}
