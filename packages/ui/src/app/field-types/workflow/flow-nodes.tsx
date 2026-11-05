import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CircleAlert } from 'lucide-react'
import type { State } from '@protobase/workflows'
import { cn } from '../../../lib/cn'
import { Badge } from '../../../primitives/badge'
import type { EdgeKind } from './definition-graph'
import type { FlowNode } from './flow-elements'
import { nodeStatusLabel, stateLabel, triggerLabel } from './labels'
import { nodeTones, type NodeTrace } from './node-trace'
import { text } from './messages'

type Source = { kind: EdgeKind; position: Position; left?: string; label?: string }

// The handles an edge leaves a state from, by its type: on to the next state at the bottom, a Choice's rules and its
// Default side by side there, and the error path of a Task or Map on the right.
const sourcesOf = (state: State): Source[] => {
  if (state.Type === 'Choice') {
    return [
      { kind: 'rule', position: Position.Bottom, left: '30%', label: text('when') },
      { kind: 'default', position: Position.Bottom, left: '70%', label: text('otherwise') },
    ]
  }
  const next: Source[] = ['Task', 'Pass', 'Wait', 'Map'].includes(state.Type) ? [{ kind: 'next', position: Position.Bottom }] : []
  const caught: Source[] = state.Type === 'Task' || state.Type === 'Map' ? [{ kind: 'catch', position: Position.Right, label: text('onErrorHandle') }] : []
  return [...next, ...caught]
}

const Sources = ({ state, editable }: { state: State; editable: boolean }) =>
  sourcesOf(state).map((source) => (
    <Handle key={source.kind} id={source.kind} type="source" position={source.position} isConnectable={editable} style={source.left ? { left: source.left } : undefined} className={cn(`pb-workflow-handle-${source.kind}`)}>
      {source.label && <span className="pb-workflow-handle-label">{source.label}</span>}
    </Handle>
  ))

const ProblemCount = ({ count }: { count: number }) =>
  count > 0 && (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger-text" title={text('problemCount', { count })}>
      <CircleAlert className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{text('problemCount', { count })}</span>
      <span aria-hidden="true">{count}</span>
    </span>
  )

// How the state did in a run, and how many steps it took when more than one
const TraceMark = ({ trace }: { trace: NodeTrace }) => (
  <span className="flex shrink-0 flex-col items-end gap-0.5">
    <Badge tone={nodeTones[trace.status]}>{nodeStatusLabel(trace.status)}</Badge>
    {trace.steps > 1 && <span className="text-xs tabular-nums text-muted-foreground">{text('traceSteps', { count: trace.steps })}</span>}
  </span>
)

const boxClass = (selected: boolean, problems: number, trace?: NodeTrace) =>
  cn('rounded-lg border bg-background text-body shadow-sm', problems > 0 || trace?.status === 'failed' ? 'border-danger' : 'border-border-strong', selected && 'ring-2 ring-primary/40')

// The name and what the state is, over each other, with the count of its problems or its mark in a run
const Title = ({ name, kind, problems, first, trace }: { name: string; kind: string; problems: number; first?: boolean; trace?: NodeTrace }) => (
  <div className="flex min-w-0 items-start justify-between gap-2">
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">
        {kind}
        {first && <span className="text-primary-text"> · {text('startsHere')}</span>}
      </div>
      <div className="truncate font-medium text-foreground">{name}</div>
    </div>
    <ProblemCount count={problems} />
    {trace && <TraceMark trace={trace} />}
  </div>
)

/** A state: a box with its name, what it is and the handles its edges leave from; a Map's holds the states inside it. */
export const StateNode = ({ data, selected, isConnectable }: NodeProps<FlowNode>) => {
  const { node, problems, trace } = data
  if (node.kind !== 'state') return null
  return (
    <div className={cn(boxClass(selected, problems.length, trace), 'h-full px-3 py-2', node.state.Type === 'Map' && 'bg-muted/40')}>
      <Handle id="in" type="target" position={Position.Top} isConnectable={isConnectable} />
      <Title name={node.name} kind={stateLabel(node.state)} problems={problems.length} first={node.first && node.parent !== undefined} trace={trace} />
      <Sources state={node.state} editable={isConnectable} />
    </div>
  )
}

/** The trigger: what starts a run, leading to the first state. */
export const TriggerNode = ({ data, selected, isConnectable }: NodeProps<FlowNode>) => {
  const { node, problems } = data
  if (node.kind !== 'trigger') return null
  return (
    <div className={cn(boxClass(selected, problems.length), 'h-full border-dashed px-3 py-2')}>
      <Title name={triggerLabel(node.trigger)} kind={text('trigger')} problems={problems.length} />
      <Handle id="start" type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  )
}
