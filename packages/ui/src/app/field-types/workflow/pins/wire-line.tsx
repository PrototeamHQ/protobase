import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react'
import { createContext, useContext } from 'react'
import type { FlowNode } from '../flow-elements'

/** Why a wire from one handle to another would be refused, in words; undefined when it would not be, or is no wire. */
export type WireCheck = (from: { node: string; handle: string }, to: { node: string; handle: string }) => string | undefined

export const WireCheckContext = createContext<WireCheck | undefined>(undefined)

/**
 * The line drawn while a wire is dragged: over a pin that refuses it, it turns red and says why, such as that text
 * does not fit a whole number, as Blueprints do.
 */
export const WireLine = ({ fromX, fromY, toX, toY, fromPosition, toPosition, connectionStatus, fromNode, fromHandle, toNode, toHandle }: ConnectionLineComponentProps<FlowNode>) => {
  const check = useContext(WireCheckContext)
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition, targetX: toX, targetY: toY, targetPosition: toPosition })
  const refused = connectionStatus === 'invalid' && toNode && toHandle?.id && fromHandle.id ? check?.({ node: fromNode.id, handle: fromHandle.id }, { node: toNode.id, handle: toHandle.id }) : undefined
  return (
    <g className={refused ? 'pb-wire-refused' : undefined}>
      <path d={path} fill="none" className="react-flow__connection-path" />
      {refused && (
        <foreignObject x={toX + 12} y={toY - 30} width={260} height={28} className="overflow-visible">
          <div className="inline-block rounded border border-danger bg-danger-soft px-1.5 py-0.5 text-xs whitespace-nowrap text-danger-text shadow">{refused}</div>
        </foreignObject>
      )}
    </g>
  )
}
