import { useState } from 'react'
import { guarded } from '../../../../lib/guarded'

/**
 * How the editor draws a workflow: `pins`, every step's inputs and outputs as typed pins with the wires between them,
 * as Blueprints do; or `simple`, the steps and the lines between them alone, as n8n does, their inputs edited in the
 * step's form. Both are views of the same document: switching changes nothing in it.
 */
export type GraphView = 'pins' | 'simple'

export const graphViewStorageKey = 'protobase:workflow-graph-view'

/** The view chosen in this browser; pins, the default, when none was or storage is unavailable. */
export const readGraphView = (storage: Pick<Storage, 'getItem'>): GraphView => (guarded(() => storage.getItem(graphViewStorageKey), null) === 'simple' ? 'simple' : 'pins')

/** Remembers a view, and the default by forgetting the choice, so the default costs no storage. */
export const writeGraphView = (storage: Pick<Storage, 'setItem' | 'removeItem'>, view: GraphView) =>
  guarded(() => (view === 'pins' ? storage.removeItem(graphViewStorageKey) : storage.setItem(graphViewStorageKey, view)), undefined)

/** The view the person chose last in this browser, and the way to choose another, which this browser remembers. */
export const useGraphView = () => {
  const [view, setView] = useState<GraphView>(() => readGraphView(localStorage))
  const choose = (next: GraphView) => {
    setView(next)
    writeGraphView(localStorage, next)
  }
  return [view, choose] as const
}
