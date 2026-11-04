import { useMemo, useState } from 'react'
import type { Definition } from '@protobase/workflows'
import { AddStep } from './add-step'
import { definitionOf, pathOf, stateAt, triggerId } from './definition'
import { addState, freeName, type NewState } from './definition-edits'
import { NodePanel } from './node-panel'
import { ProblemList } from './problem-list'
import { definitionProblems, problemsByNode } from './problems'
import { WorkflowCanvas } from './workflow-canvas'
import { text } from './messages'

export type WorkflowGraphEditorProps = {
  /** The definition as the field holds it; none starts an empty workflow. */
  value: unknown
  /** Without it, the workflow is only shown. */
  onChange?: (definition: Definition) => void
}

// A new state goes into the Map chosen, or the Map the chosen state is in, else into the workflow itself.
const scopeFor = (definition: Definition, selected: string | undefined): string[] => {
  if (selected === undefined || selected === triggerId) return []
  const names = selected.split('/')
  return stateAt(definition, selected)?.Type === 'Map' ? names : names.slice(0, -1)
}

/**
 * A workflow's definition as a graph to see and edit: the menu that adds a state, the canvas, which ELK lays out on
 * each change, and the chosen node's fields under it. Every problem the save's check would refuse it for shows on the
 * node it names as it is edited, and the rest above the canvas.
 */
export const WorkflowGraphEditor = ({ value, onChange }: WorkflowGraphEditorProps) => {
  // The form hands the value over anew on each render: the definition changes only when its JSON does
  const json = JSON.stringify(value ?? null)
  const definition = useMemo(() => definitionOf(JSON.parse(json)), [json])
  const checked = useMemo(() => problemsByNode(definitionProblems(definition)), [definition])
  const [chosen, setChosen] = useState<string>()
  // A node the definition no longer has is no longer chosen
  const selected = chosen === triggerId || (chosen !== undefined && stateAt(definition, chosen)) ? chosen : undefined
  const scope = scopeFor(definition, selected)

  const add = (kind: NewState) => {
    if (!onChange) return
    const name = freeName(definition, text('newStep'))
    onChange(addState(definition, scope, kind, name, text('newStep')))
    setChosen(pathOf(scope, name))
  }

  return (
    <div className="flex flex-col gap-3">
      {onChange && (
        <div className="flex flex-wrap items-center gap-2">
          <AddStep inside={scope.length > 0 ? scope.join('/') : undefined} onAdd={add} />
          <p className="text-xs text-muted-foreground">{text('connectHelp')}</p>
        </div>
      )}
      <ProblemList problems={checked.whole} />
      <div className="h-[28rem] overflow-hidden rounded-lg border max-sm:h-[22rem]">
        <WorkflowCanvas definition={definition} problems={checked.byNode} selected={selected} onSelect={setChosen} onChange={onChange} />
      </div>
      {selected !== undefined && <NodePanel definition={definition} selected={selected} problems={checked.byNode.get(selected) ?? []} onChange={onChange} onSelect={setChosen} />}
    </div>
  )
}
