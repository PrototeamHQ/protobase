import { createRequire } from 'node:module'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { mountStrict } from '../../testing/strict-hooks'
import { ticketsWorkflow } from '../../testing/workflow-fixtures'
import { definitionGraph } from './definition-graph'
import { useLayout } from './use-layout'

vi.mock('react', async () => (await import('../../testing/strict-hooks')).strictReact)

// A browser's Worker running ELK's worker script in this process: once terminated, it answers nothing, as a browser's does.
const { Worker: ElkInProcess } = createRequire(import.meta.url)('elkjs/lib/elk-worker.min.js')
class ElkWorker {
  onmessage?: (event: { data: unknown }) => void
  #elk = new ElkInProcess()
  #terminated = false
  constructor() {
    this.#elk.onmessage = (event: { data: unknown }) => {
      if (!this.#terminated) this.onmessage?.(event)
    }
  }
  postMessage(data: unknown) {
    if (!this.#terminated) this.#elk.postMessage(data)
  }
  terminate() {
    this.#terminated = true
  }
}
vi.stubGlobal('Worker', ElkWorker)
afterAll(() => vi.unstubAllGlobals())

describe('useLayout', () => {
  it('lays the graph out under StrictMode, each node at a position of its own', async () => {
    const graph = definitionGraph(ticketsWorkflow)
    const boxes = mountStrict(() => useLayout(graph))
    await vi.waitFor(() => expect(boxes()?.size).toBe(graph.nodes.length), { timeout: 10_000 })
    const positions = [...boxes()!.values()].map((box) => `${box.x},${box.y}`)
    expect(new Set(positions).size).toBe(positions.length)
  })
})
