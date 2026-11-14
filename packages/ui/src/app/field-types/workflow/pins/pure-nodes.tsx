import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '../../../../lib/cn'
import type { FlowNode } from '../flow-elements'
import { text } from '../messages'
import type { PureNode } from './data-graph'
import type { InputPin } from './node-pins'
import { FoldRow, InputRow, OutputRow } from './pin-rows'
import { pinColour, typeLabel } from './pin-text'
import { breakIn, makeOut } from './pure-ids'

/** What a Break's or a Make's node draws from: the node, which of its inputs it shows, and whether the canvas is editable. */
export type PureData = { pure: PureNode; shownInputs: InputPin[]; folded: number; open: boolean }

const Title = ({ pure }: { pure: PureNode }) => (
  <div className="truncate border-b px-3 py-1.5 text-xs font-medium text-foreground">{pure.kind === 'break' ? text('breakTitle', { type: typeLabel(pure.type) }) : text('makeTitle', { type: typeLabel(pure.type) })}</div>
)

/**
 * A Break or a Make: a node of the editor's own, with no step at run time, that takes an object apart into a pin per
 * field, or builds one from a pin per field. Its object's own pin is bound to the value it breaks or the argument it makes.
 */
export const PureNodeView = ({ data, selected, isConnectable: editable }: NodeProps<FlowNode>) => {
  const { pureData } = data
  if (!pureData) return null
  const { pure, shownInputs, folded, open } = pureData
  return (
    <div className={cn('h-full rounded-lg border border-dashed border-border-strong bg-background text-body shadow-sm', selected && 'ring-2 ring-primary/40')}>
      <Title pure={pure} />
      {pure.kind === 'break' ? (
        <div className="relative pt-1">
          <Handle id={breakIn} type="target" position={Position.Left} isConnectable={false} className={`pb-pin pb-pin-${pinColour(pure.type)}`} style={{ top: 13 }} />
          {pure.outputs.map((pin) => (
            <OutputRow key={JSON.stringify(pin.path)} pin={pin} connectable={editable} field />
          ))}
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
