import { Handle, Position } from '@xyflow/react'
import { useState } from 'react'
import { text } from '../messages'
import type { ConditionNode } from './data-graph'
import { usePinActions } from './pin-actions'
import { InputRow } from './pin-rows'
import { pinColour, typeLabel } from './pin-text'
import { expressionTextHeight } from './pin-layout'
import { conditionOut, inHandle } from './pure-ids'

// An input's name: a Comparison's two are A and B, an All of's and an Any of's A, B, C and on, a Matches node's the text
// and the pattern, a Not's what it turns round
const sideName = (node: ConditionNode, key: string) => {
  if (node.part.kind === 'not') return text('conditionNotSide')
  if (node.part.kind === 'matches') return key === '0' ? text('conditionMatchesText') : text('conditionMatchesPattern')
  if (node.part.kind === 'logic') return String.fromCharCode(65 + (Number(key) % 26))
  return key === '0' ? text('conditionSideA') : text('conditionSideB')
}

// The text of an Expression, kept as typed while it has the focus and written once the focus leaves, so a Condition
// typed into a form the nodes stand for turns into them only then
const ExpressionText = ({ node, source }: { node: ConditionNode; source: string }) => {
  const actions = usePinActions()
  const [typed, setTyped] = useState<string>()
  const shown = source.trim()
  return (
    <textarea
      aria-label={text('conditionExpressionText')}
      className="nodrag nopan nowheel block w-full resize-none rounded border border-border bg-background px-1.5 py-1 font-mono text-xs text-foreground"
      style={{ height: expressionTextHeight }}
      spellCheck={false}
      readOnly={!actions}
      value={typed ?? shown}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={() => {
        setTyped(undefined)
        const next = typed?.trim()
        if (next === undefined || next === shown) return
        actions?.setCondition(node.target, next === '' ? undefined : `{% ${next} %}`)
      }}
    />
  )
}


/**
 * A condition node's pins and inputs: a Comparison's, an And's or an Or's two sides, a Not's one, each wired or
 * holding a value of its own, or an Expression's text with a pin per value it reads, which only the text changes. Its
 * yes or no goes out on the right, to the Only when pin or the side it is part of.
 */
export const ConditionPins = ({ node, editable }: { node: ConditionNode; editable: boolean }) => {
  const actions = usePinActions()
  const out = <Handle id={conditionOut} type="source" position={Position.Right} isConnectable={false} className="pb-pin pb-pin-boolean" style={{ top: 13 }} />
  if (node.part.kind === 'expression') {
    return (
      <div className="relative grid gap-1 px-2 pt-1">
        {out}
        <ExpressionText node={node} source={node.part.source} />
        <div className="-mx-2">
          {node.inputs.map((pin) => (
            <div key={pin.key} className="relative flex h-[26px] items-center pr-2 pl-3">
              <Handle id={inHandle(pin.key)} type="target" position={Position.Left} isConnectable={false} className={`pb-pin pb-pin-${pinColour(pin.type)}`} />
              <span className="min-w-0 truncate font-mono text-xs text-body" title={text('pinTypeTitle', { label: pin.key, type: typeLabel(pin.type) })}>
                {pin.reads?.[0] ?? pin.key}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="relative pt-1">
      {out}
      {node.inputs.map((pin) => (
        <InputRow
          key={pin.key}
          pin={pin}
          step={node.target}
          keys={[]}
          name={sideName(node, pin.key)}
          // The empty input after an All of's or an Any of's last takes a wire or a node, which adds its next condition
          bare={node.part.kind === 'logic' && Number(pin.key) === node.part.sides.length}
          // A Matches node's pattern is written on it, never wired
          connectable={editable && !(node.part.kind === 'matches' && pin.key === '1')}
          // A value cleared is an empty one: a check box gives true or false, so only text or a number is cleared
          onValue={(value) => actions?.setConditionSide(node.target, [...node.at, Number(pin.key)], (value ?? '') as string | number | boolean)}
        />
      ))}
    </div>
  )
}
