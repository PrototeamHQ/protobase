/*! @license elkjs (https://github.com/kieler/elkjs), Copyright (c) 2019 TypeFox and others, EPL-2.0 OR GPL-3.0-or-later; its source is at that address. */
import { useEffect, useMemo, useState } from 'react'
import { useElk } from '../../../lib/elk/use-elk'
import type { Graph } from './definition-graph'
import { elkGraph, layoutElk, type Box, type LayoutExtras } from './graph-layout'

/**
 * The boxes of the graph's nodes, laid out again each time its nodes, edges, sizes or wires change, not when only what
 * a state does changes; until the first layout is done, undefined. A layout that a newer one overtook is dropped.
 */
export const useLayout = (graph: Graph, extras?: LayoutExtras) => {
  const engine = useElk()
  const [boxes, setBoxes] = useState<Map<string, Box>>()
  const shape = useMemo(() => JSON.stringify(elkGraph(graph, extras)), [graph, extras])
  useEffect(() => {
    if (!engine) return
    let current = true
    void layoutElk(engine, JSON.parse(shape)).then((laidOut) => {
      if (current) setBoxes(laidOut)
    })
    return () => {
      current = false
    }
  }, [engine, shape])
  return boxes
}
