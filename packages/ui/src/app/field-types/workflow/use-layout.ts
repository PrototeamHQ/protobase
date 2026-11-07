/*! @license elkjs (https://github.com/kieler/elkjs), Copyright (c) 2019 TypeFox and others, EPL-2.0 OR GPL-3.0-or-later; its source is at that address. */
import ELK, { type ELK as Engine } from 'elkjs/lib/elk-api.js'
import { useEffect, useMemo, useState } from 'react'
import type { Graph } from './definition-graph'
import { elkGraph, layoutElk, type Box } from './graph-layout'

// ELK in a worker of its own, so laying out a graph never holds up the page; the editor's page alone loads it.
const workerEngine = () => new ELK({ workerFactory: () => new Worker(new URL('./elk-worker.ts', import.meta.url), { type: 'module', name: 'protobase-workflow-layout' }) })

/**
 * One ELK while the canvas is drawn, started by its mount and ended by its unmount; undefined until it has started. In
 * development, StrictMode mounts the canvas, unmounts it and mounts it again: the second mount starts an ELK of its own.
 */
const useEngine = () => {
  const [engine, setEngine] = useState<Engine>()
  useEffect(() => {
    const started = workerEngine()
    setEngine(started)
    return () => started.terminateWorker()
  }, [])
  return engine
}

/**
 * The boxes of the graph's nodes, laid out again each time its nodes or edges change, not when only what a state does
 * changes; until the first layout is done, undefined. A layout that a newer one overtook is dropped.
 */
export const useLayout = (graph: Graph) => {
  const engine = useEngine()
  const [boxes, setBoxes] = useState<Map<string, Box>>()
  const shape = useMemo(() => JSON.stringify(elkGraph(graph)), [graph])
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
