import { Flag, Trash2 } from 'lucide-react'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition, State } from '@protobase/workflows'
import { Button } from '../../../primitives/button'
import { allNames, machineAt, pathOf, splitPath, stateAt, triggerId, type StatePath } from './definition'
import { removeState, renameState, replaceState, setTrigger, startAt } from './definition-edits'
import { stateLabel, triggerLabel } from './labels'
import type { NodeProblem } from './problems'
import { ProblemList } from './problem-list'
import { RenameField } from './rename-field'
import { StateFields } from './state-fields'
import { TriggerFields } from './trigger-fields'
import { ValueField } from './value-field'
import { text } from './messages'

export type NodePanelProps = {
  definition: Definition
  /** The app's trigger and step types. */
  types: WorkflowTypeList
  /** The trigger's id or a state's path. */
  selected: string
  problems: readonly NodeProblem[]
  /** Without it, the node is only shown. */
  onChange?: (definition: Definition) => void
  onSelect: (id: string | undefined) => void
}

const isState = (value: unknown): value is State => typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { Type?: unknown }).Type === 'string'

const Heading = ({ kind, name }: { kind: string; name: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{kind}</div>
    <h3 className="truncate font-semibold text-foreground">{name}</h3>
  </div>
)

const StatePanel = ({ definition, types, selected: path, problems, onChange, onSelect }: NodePanelProps) => {
  const state = stateAt(definition, path)
  if (!state) return null
  const { scope, name } = splitPath(path)
  const machine = machineAt(definition, scope)!
  const disabled = !onChange
  const change = (next: Definition) => onChange?.(next)
  return (
    <>
      <Heading kind={stateLabel(state, types)} name={name} />
      <ProblemList problems={problems} />
      <RenameField
        key={path}
        name={name}
        taken={allNames(definition.stateMachine)}
        disabled={disabled}
        onRename={(to) => {
          change(renameState(definition, path, to))
          onSelect(pathOf(scope, to))
        }}
      />
      <StateFields state={state} types={types} names={Object.keys(machine.States)} problems={problems} disabled={disabled} onChange={(next) => change(replaceState(definition, path, next))} />
      <details>
        <summary className="cursor-pointer text-body font-medium text-muted-foreground">{text('asJson')}</summary>
        <div className="mt-3">
          <ValueField
            key={path}
            label={text('stepJson')}
            kind="json"
            help={text('stepJsonHelp')}
            value={state}
            disabled={disabled}
            onChange={(next) => {
              if (isState(next)) change(replaceState(definition, path, next))
            }}
          />
        </div>
      </details>
      {onChange && (
        <div className="flex flex-wrap gap-2">
          {machine.StartAt !== name && (
            <Button size="sm" onClick={() => change(startAt(definition, path))}>
              <Flag className="size-3.5" />
              {text('startHere')}
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              change(removeState(definition, path))
              onSelect(undefined)
            }}
          >
            <Trash2 className="size-3.5" />
            {text('removeStep')}
          </Button>
        </div>
      )}
    </>
  )
}

/** The chosen node's fields beside the canvas: the trigger's, or a state's with its problems, name and actions. */
export const NodePanel = (props: NodePanelProps) => {
  const { definition, types, selected, problems, onChange } = props
  return (
    <section aria-label={text('chosenStep')} className="flex flex-col gap-4 rounded-lg border bg-background p-4">
      {selected === triggerId ? (
        <>
          <Heading kind={text('trigger')} name={triggerLabel(definition.trigger, types)} />
          <ProblemList problems={problems} />
          <TriggerFields trigger={definition.trigger} types={types} problems={problems} disabled={!onChange} onChange={(trigger) => onChange?.(setTrigger(definition, trigger))} />
        </>
      ) : (
        <StatePanel {...props} selected={selected as StatePath} />
      )}
    </section>
  )
}
