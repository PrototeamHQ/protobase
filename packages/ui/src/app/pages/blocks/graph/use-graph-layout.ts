import { useEffect, useMemo, useState } from 'react'
import type { GraphShape } from '@protobase/layout'
import { useElk } from '../../../../lib/elk/use-elk'
import { graphElk, placeGraph, type GraphLayout, type LayoutInput } from './graph-layout'

/**
 * Where the graph's groups and nodes sit, laid out again when its nodes, edges, sizes or positions change; undefined
 * until the first layout is done. A layout that a newer one overtook is dropped. Without a node to lay out, the engine
 * is never asked.
 */
export const useGraphLayout = (shape: GraphShape, input: LayoutInput): GraphLayout | undefined => {
  const elk = graphElk(shape, input)
  const engine = useElk()
  // One text for what the layout is made from, so a new shape of the same records lays nothing out again
  const signature = JSON.stringify([elk, shape.nodes.map((node) => node.id), shape.groups.map((group) => group.id), [...input.positions], [...input.sizes]])
  const placedOnly = useMemo(() => (elk ? undefined : placeGraph(shape, input)), [signature])
  const [laidOut, setLaidOut] = useState<{ signature: string; layout: GraphLayout }>()
  useEffect(() => {
    if (!engine || !elk) return
    let current = true
    void engine.layout(elk).then((result) => {
      if (current) setLaidOut({ signature, layout: placeGraph(shape, input, result) })
    })
    return () => {
      current = false
    }
  }, [engine, signature])
  if (placedOnly) return placedOnly
  // The last layout stands while the next one is made, so a live update does not blank the graph
  return laidOut?.layout
}
