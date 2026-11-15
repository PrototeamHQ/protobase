import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '../../../../lib/cn'
import type { FlowNode, PureData } from '../flow-elements'
import { text } from '../messages'
import type { PureNode } from './data-graph'
import { ConditionPins } from './condition-nodes'
import { SelectRows } from './select-node'
import { FoldRow, InputRow, OutputRow } from './pin-rows'
import { conditionNodeTitle, pinColour, typeLabel } from './pin-text'
import { breakIn, makeOut } from './pure-ids'
import { MovedMark } from '../moved-mark'

const titleOf = (pure: PureNode) => {
  if (pure.kind === 'condition') return conditionNodeTitle(pure)
  if (pure.kind === 'select') return text('selectTitle')
  return pure.kind === 'break' ? text('breakTitle', { type: typeLabel(pure.type) }) : text('makeTitle', { type: typeLabel(pure.type) })
}

const Title = ({ pure }: { pure: PureNode }) => <div className="truncate border-b px-3 py-1.5 text-xs font-medium text-foreground">{titleOf(pure)}</div>

/**
 * A Break, a Make or a condition node: a node of the editor's own, with no step at run time, that takes an object apart
 * into a pin per field, builds one from a pin per field, or is part of a step's Condition. Its object's own pin is bound
 * to the value it breaks or the argument it makes, a condition node's to the Only when pin or side it is part of.
 */
export const PureNodeView = ({ id, data, selected, isConnectable: editable }: NodeProps<FlowNode>) => {
  const { pureData, moved } = data
  if (!pureData) return null
  const { pure, shownInputs, shownOutputs, folded, open, foldable } = pureData
  return (
    <div className={cn('h-full rounded-lg border border-dashed border-border-strong bg-background text-body shadow-sm', selected && 'ring-2 ring-primary/40')}>
      {moved && <MovedMark node={id} name={titleOf(pure)} />}
      <Title pure={pure} />
      {pure.kind === 'condition' ? (
        <ConditionPins node={pure} editable={editable} />
      ) : pure.kind === 'select' ? (
        <SelectRows node={pure} editable={editable} />
      ) : pure.kind === 'break' ? (
        <div className="relative pt-1">
          <Handle id={breakIn} type="target" position={Position.Left} isConnectable={false} className={`pb-pin pb-pin-${pinColour(pure.type)}`} style={{ top: 13 }} />
          {shownOutputs.map((pin) => (
            <OutputRow key={JSON.stringify(pin.path)} pin={pin} connectable={editable} field />
          ))}
          {foldable && <FoldRow node={pure.id} folded={folded} open={open} fields />}
        </div>
      ) : (
        <div className="relative pt-1">
          <Handle id={makeOut} type="source" position={Position.Right} isConnectable={false} className={`pb-pin pb-pin-${pinColour(pure.type)}`} style={{ top: 13 }} />
          {shownInputs.map((pin) => (
            <InputRow key={pin.key} pin={pin} step={pure.target} keys={[pure.key, pin.key]} connectable={editable} />
          ))}
          <FoldRow node={pure.id} folded={folded} open={open} />
        </div>
      )}
    </div>
  )
}
