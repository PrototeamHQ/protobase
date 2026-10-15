import path from 'node:path'
import { createVitest } from 'vitest/node'
import { absolute, matches, resolveEdges, root } from './changes.mjs'
import { findWay } from './graph.mjs'

export const relative = (file) => path.relative(root, file)

/**
 * Walks the module graph as Vitest resolves it for the tests, to find which of the given rules (rules.mjs) a change to
 * `changed` reaches. `wayOf(rule)` returns the files from the rule to a changed file, or undefined.
 */
export const openGraph = async (changed) => {
  const vitest = await createVitest('test', { watch: false, project: ['unit'] }, { logLevel: 'silent' })
  const [project] = vitest.projects
  const changedFiles = new Set(changed.map(absolute))
  const { edges, edgesOf } = resolveEdges()
  const changedRead = (edge) => changed.find((file) => matches(file, edge.reads))
  return {
    edges,
    wayOf: (rule) => findWay({ project, edge: rule, edgesOf, isChanged: (file) => changedFiles.has(file), changedRead }),
    close: () => vitest.close(),
  }
}

/** Prints a way as `a → b → c`, from the repository's root. */
export const showWay = (way) => way.map((file) => (path.isAbsolute(file) ? relative(file) : file)).join(' → ')
