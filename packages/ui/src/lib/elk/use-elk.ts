/*! @license elkjs (https://github.com/kieler/elkjs), Copyright (c) 2019 TypeFox and others, EPL-2.0 OR GPL-3.0-or-later; its source is at that address. */
import ELK, { type ELK as Engine } from 'elkjs/lib/elk-api.js'
import { useEffect, useState } from 'react'

// ELK in a worker of its own, so laying out a graph never holds up the page; only a page that draws a graph loads it.
const workerEngine = () => new ELK({ workerFactory: () => new Worker(new URL('./elk-worker.ts', import.meta.url), { type: 'module', name: 'protobase-layout' }) })

/**
 * One ELK while the graph is drawn, started by its mount and ended by its unmount; undefined until it has started. In
 * development, StrictMode mounts the graph, unmounts it and mounts it again: the second mount starts an ELK of its own.
 */
export const useElk = () => {
  const [engine, setEngine] = useState<Engine>()
  useEffect(() => {
    const started = workerEngine()
    setEngine(started)
    return () => started.terminateWorker()
  }, [])
  return engine
}
