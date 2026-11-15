import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CircleAlert } from 'lucide-react'
import { useContext, type KeyboardEvent, type MouseEvent } from 'react'
import type { State } from '@protobase/workflows'
import { cn } from '../../../lib/cn'
import { Badge } from '../../../primitives/badge'
import { AddAtContext } from './add-at-context'
import type { AddAt } from './definition-edits'
import type { EdgeKind } from './definition-graph'
import type { FlowNode } from './flow-elements'
import { nodeStatusLabel } from './labels'
import { nodeTones, type NodeTrace } from './node-trace'
import { holdsSteps } from './definition'
import { text } from './messages'
import { GroupPins, PinColumns } from './pins/pin-rows'

type Source = { kind: EdgeKind; top: number; label?: string }

// Where the execution handles sit on a node's right edge, in its header, as Blueprints draw them
const execTops = [18, 38]

// The handles an edge leaves a state from, by its type, down the header's right edge: on to the next state, or a
// Choice's rules and then its Default, and below it the error path of a Task, Map or Block.
const sourcesOf = (state: State): Source[] => {
  if (state.Type === 'Choice') {
    return [
      { kind: 'rule', top: execTops[0]!, label: text('when') },
      { kind: 'default', top: execTops[1]!, label: text('otherwise') },
    ]
  }
  const next: Source[] = ['Task', 'Pass', 'Wait', 'Map', 'Block'].includes(state.Type) ? [{ kind: 'next', top: execTops[0]! }] : []
  const caught: Source[] = state.Type === 'Task' || state.Type === 'Map' || state.Type === 'Block' ? [{ kind: 'catch', top: execTops[next.length]!, label: text('onErrorHandle') }] : []
  return [...next, ...caught]
}

// A click on a handle, rather than a drag from it, adds a step there; the node itself is not chosen by it
const useAddAt = (at: AddAt, editable: boolean, handle?: string) => {
  const addAt = useContext(AddAtContext)
  if (!addAt || !editable) return {}
  const open = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation()
    addAt(at)
  }
  const label = handle ? text('addStepAtNamedHandle', { handle }) : text('addStepAtHandle')
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    title: label,
    onClick: open,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open(event)
      }
    },
  }
}

const SourceHandle = ({ source, path, editable }: { source: Source; path: string; editable: boolean }) => (
  <Handle id={source.kind} type="source" position={Position.Right} isConnectable={editable} style={{ top: source.top }} className={cn('pb-workflow-exec', `pb-workflow-handle-${source.kind}`)} {...useAddAt({ kind: source.kind, source: path }, editable, source.label)}>
    {source.label && <span className="pb-workflow-handle-label">{source.label}</span>}
  </Handle>
)

const Sources = ({ state, path, editable }: { state: State; path: string; editable: boolean }) => sourcesOf(state).map((source) => <SourceHandle key={source.kind} source={source} path={path} editable={editable} />)

const ProblemCount = ({ count }: { count: number }) =>
  count > 0 && (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger-text" title={text('problemCount', { count })}>
      <CircleAlert className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{text('problemCount', { count })}</span>
      <span aria-hidden="true">{count}</span>
    </span>
  )

// What a step should be looked at for though it saves, plain to see on a screenshot: its cache forced on against its
// type's advice, or what the check warns of
const WarningMark = ({ label }: { label: string }) => (
  <span className="inline-flex shrink-0 items-center text-warning-text" title={label}>
    <CircleAlert className="size-3.5" aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </span>
)

// How the state did in a run, and how many steps it took when more than one
const TraceMark = ({ trace }: { trace: NodeTrace }) => (
  <span className="flex shrink-0 flex-col items-end gap-0.5">
    {trace.changed ? <span title={text('changedSinceRun')} className="rounded-full border border-dashed px-1.5 text-xs text-muted-foreground">{text('changedShort')}</span> : <Badge tone={nodeTones[trace.status]}>{nodeStatusLabel(trace.status)}</Badge>}
    {trace.steps > 1 && <span className="text-xs tabular-nums text-muted-foreground">{text('traceSteps', { count: trace.steps })}</span>}
  </span>
)

const boxClass = (selected: boolean, problems: number, trace?: NodeTrace) =>
  cn('rounded-lg border bg-background text-body shadow-sm', problems > 0 || trace?.status === 'failed' ? 'border-danger' : 'border-border-strong', selected && 'ring-2 ring-primary/40')

// What the state is, with the count of its problems or its mark in a run, over its name, which keeps the whole width
const Title = ({ name, kind, problems, first, trace, warnings = [] }: { name: string; kind: string; problems: number; first?: boolean; trace?: NodeTrace; warnings?: readonly string[] }) => (
  <div className="min-w-0">
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0 truncate text-xs text-muted-foreground">
        {kind}
        {first && <span className="text-primary-text"> · {text('startsHere')}</span>}
      </div>
      {warnings.length > 0 && <WarningMark label={warnings.join('\n')} />}
      <ProblemCount count={problems} />
      {trace && <TraceMark trace={trace} />}
    </div>
    <div className="truncate font-medium text-foreground">{name}</div>
  </div>
)

/** A state: a box with its name, what it is and the handles its edges leave from; a Map's or Block's holds the states inside it. */
// In data order a node has no execution handles: the edges drawn between nodes, in the simple view, are what they read,
// from one's side to the other's
const DataSides = () => (
  <>
    <Handle id="in" type="target" position={Position.Left} isConnectable={false} className="pb-workflow-side" style={{ top: execTops[0] }} />
    <Handle id="out" type="source" position={Position.Right} isConnectable={false} className="pb-workflow-side" style={{ top: execTops[0] }} />
  </>
)

// The Condition a state runs under in data order, shortly, whole on hover
const OnlyWhen = ({ condition }: { condition: string | undefined }) =>
  condition !== undefined && (
    <span className="absolute top-1 right-6 max-w-[45%] truncate rounded bg-muted px-1 text-[0.625rem] text-muted-foreground" title={condition}>
      {text('onlyWhenBadge')}
    </span>
  )

export const StateNode = ({ data, selected, isConnectable }: NodeProps<FlowNode>) => {
  const { node, kind, problems, trace, cacheWarning, warnings = [], pins, dataOrder } = data
  if (node.kind !== 'state') return null
  return (
    <div className={cn(boxClass(selected, problems.length, trace), 'h-full', holdsSteps(node.state) && 'bg-muted/40')}>
      <div className="relative h-[52px] py-2 pr-6 pl-4">
        {dataOrder ? <DataSides /> : <Handle id="in" type="target" position={Position.Left} isConnectable={isConnectable} className="pb-workflow-exec" style={{ top: execTops[0] }} />}
        {dataOrder && <OnlyWhen condition={node.state.Condition} />}
        <Title name={node.name} kind={kind} problems={problems.length} first={node.first && node.parent !== undefined} trace={trace} warnings={[...(cacheWarning ? [text('cacheForcedAgainst')] : []), ...warnings.map((warning) => warning.message)]} />
        {!dataOrder && <Sources state={node.state} path={node.id} editable={isConnectable} />}
        {pins && holdsSteps(node.state) && <GroupPins inputs={pins.inputs} outputs={pins.outputs} connectable={isConnectable} />}
      </div>
      {pins && !holdsSteps(node.state) && <PinColumns node={node.id} inputs={pins.inputs} outputs={pins.outputs} folded={pins.folded} open={pins.open} editable={isConnectable} />}
    </div>
  )
}

/** The trigger: what starts a run, leading to the first state. */
export const TriggerNode = ({ data, selected, isConnectable }: NodeProps<FlowNode>) => {
  const { node, kind, problems, pins, dataOrder } = data
  // In data order no state is first, so the trigger's handle adds no step
  const addAt = useAddAt({ kind: 'start', source: node.id }, isConnectable && !dataOrder)
  if (node.kind !== 'trigger') return null
  return (
    <div className={cn(boxClass(selected, problems.length), 'h-full border-dashed')}>
      <div className="relative h-[52px] py-2 pr-6 pl-4">
        <Title name={kind} kind={text('trigger')} problems={problems.length} />
        {dataOrder ? (
          <Handle id="out" type="source" position={Position.Right} isConnectable={false} className="pb-workflow-side" style={{ top: execTops[0] }} />
        ) : (
          <Handle id="start" type="source" position={Position.Right} isConnectable={isConnectable} className="pb-workflow-exec" style={{ top: execTops[0] }} {...addAt} />
        )}
      </div>
      {pins && <PinColumns node={node.id} inputs={[]} outputs={pins.outputs} folded={0} open={false} editable={isConnectable} trigger />}
    </div>
  )
}
