import { Handle, Position } from '@xyflow/react'
import { text } from '../messages'
import type { InputPin, OutputPin } from './node-pins'
import { usePinActions } from './pin-actions'
import { inputPinLabel, outputLabel, pinColour, typeLabel } from './pin-text'
import { PinValue } from './pin-value'
import { inHandle, outHandle } from './pure-ids'

const pinClass = (pin: { type: InputPin['type'] }) => `pb-pin pb-pin-${pinColour(pin.type)}`

/**
 * An input pin's row: its dot on the left edge, which a wire ends at, its name with its type on hover, and what it
 * holds. `step` and `keys` say which argument it sets, such as a Make's field of `data`.
 */
export const InputRow = ({ pin, step, keys, connectable }: { pin: InputPin; step: string; keys: readonly string[]; connectable: boolean }) => {
  const actions = usePinActions()
  const label = inputPinLabel(pin.key)
  return (
    <div className="relative flex h-[26px] items-center gap-1.5 pr-2 pl-3">
      <Handle id={inHandle(pin.key)} type="target" position={Position.Left} isConnectable={connectable} className={pinClass(pin)} />
      <span className="min-w-0 shrink truncate text-xs text-body" title={text('pinTypeTitle', { label, type: typeLabel(pin.type) })}>
        {label}
        {pin.required && <span aria-hidden="true" className="text-danger-text">*</span>}
      </span>
      <PinValue pin={pin} label={label} {...(actions && connectable && { onChange: (value: unknown) => actions.setArgument(step, keys, value) })} />
    </div>
  )
}

/** An output pin's row: its name with its type on hover, and its dot on the right edge, which wires start from. */
export const OutputRow = ({ pin, connectable, trigger = false, field = false }: { pin: OutputPin; connectable: boolean; trigger?: boolean; field?: boolean }) => {
  const label = outputLabel(pin.path, trigger, field)
  return (
    <div className="relative flex h-[26px] items-center justify-end pr-3 pl-2">
      <span className="min-w-0 truncate text-xs text-body" title={text('pinTypeTitle', { label, type: typeLabel(pin.type) })}>
        {label}
      </span>
      <Handle id={outHandle(pin.path)} type="source" position={Position.Right} isConnectable={connectable} className={pinClass(pin)} />
    </div>
  )
}

/**
 * The pins of a Map or a Block, whose box holds its own steps: a dot on its header's edge for each, its name and type on
 * hover, so the wires to and from the step have their ends, as its steps fill the rest.
 */
export const GroupPins = ({ inputs, outputs, connectable }: { inputs: readonly InputPin[]; outputs: readonly OutputPin[]; connectable: boolean }) => {
  const top = (index: number, count: number) => ({ top: `${((index + 1) * 100) / (count + 1)}%` })
  return (
    <>
      {inputs.map((pin, index) => (
        <Handle key={pin.key} id={inHandle(pin.key)} type="target" position={Position.Left} isConnectable={connectable} className={pinClass(pin)} style={top(index, inputs.length)} title={text('pinTypeTitle', { label: inputPinLabel(pin.key), type: typeLabel(pin.type) })} />
      ))}
      {outputs.map((pin, index) => (
        <Handle key={pin.path.join('/')} id={outHandle(pin.path)} type="source" position={Position.Right} isConnectable={connectable} className={pinClass(pin)} style={top(index, outputs.length)} title={text('pinTypeTitle', { label: outputLabel(pin.path), type: typeLabel(pin.type) })} />
      ))}
    </>
  )
}

/** The button that opens a node's optional inputs, or folds them again. */
export const FoldRow = ({ node, folded, open }: { node: string; folded: number; open: boolean }) => {
  const actions = usePinActions()
  if (folded === 0 && !open) return null
  return (
    <button type="button" className="nodrag h-6 w-full px-3 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => actions?.toggleOpen(node)} disabled={!actions}>
      {open ? text('foldLess') : text('foldMore', { count: folded })}
    </button>
  )
}

/** A node's pins: its inputs on the left and its outputs on the right, side by side, then the row that folds its optional inputs. */
export const PinColumns = ({ node, inputs, outputs, folded, open, editable, trigger = false }: { node: string; inputs: readonly InputPin[]; outputs: readonly OutputPin[]; folded: number; open: boolean; editable: boolean; trigger?: boolean }) => (
  <>
    <div className="grid grid-cols-[3fr_2fr]">
      <div className="min-w-0">
        {inputs.map((pin) => (
          <InputRow key={pin.key} pin={pin} step={node} keys={[pin.key]} connectable={editable} />
        ))}
      </div>
      <div className="min-w-0">
        {outputs.map((pin) => (
          <OutputRow key={JSON.stringify(pin.path)} pin={pin} connectable={editable} trigger={trigger} />
        ))}
      </div>
    </div>
    <FoldRow node={node} folded={folded} open={open} />
  </>
)
