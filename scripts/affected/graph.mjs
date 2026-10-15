import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * The files `file` imports, statically or dynamically, as Vite resolves them for `project`'s tests, without packages
 * from node_modules: the edges Vitest's `--changed` follows.
 */
export const importsOf = async (project, file) => {
  const environment = project.vite.environments.ssr
  const transformed = environment.moduleGraph.getModuleById(file)?.transformResult ?? (await environment.transformRequest(file))
  if (!transformed) return []
  return [...(transformed.deps ?? []), ...(transformed.dynamicDeps ?? [])]
    .map((dep) => (dep.startsWith('/@fs/') ? dep.slice(4) : path.join(project.config.root, dep)))
    .filter((dep) => !dep.includes('node_modules') && existsSync(dep))
}

export const isModule = (file) => /\.[cm]?[jt]sx?$/.test(file)

/**
 * The way from `edge` to the first changed file, as the files along it, or undefined when it reaches none. An edge
 * reaches a change it reads, and one its `loads` modules reach through what they import and the edges of the modules
 * they pass; its `starts` modules reach one through what they import alone. `isChanged` takes an absolute path,
 * `changedRead` an edge and returns the changed file its reads match.
 */
export const findWay = async ({ project, edge, edgesOf, isChanged, changedRead }) => {
  const from = new Map()
  const queue = []
  const visit = (file, followEdges, previous) => {
    const key = `${followEdges}:${file}`
    if (from.has(key)) return
    from.set(key, previous)
    queue.push({ file, followEdges, key })
  }
  const wayTo = (key, last) => {
    const way = [last]
    for (let step = key; step; step = from.get(step)) way.unshift(step.slice(step.indexOf(':') + 1))
    return way
  }
  const follow = (current, key) => {
    for (const module of current.loads) visit(module, true, key)
    for (const module of current.starts) visit(module, false, key)
  }
  const read = changedRead(edge)
  if (read) return [read]
  follow(edge, undefined)
  while (queue.length > 0) {
    const { file, followEdges, key } = queue.shift()
    if (isChanged(file)) return wayTo(from.get(key), file)
    for (const next of followEdges ? edgesOf(file) : []) {
      const nextRead = changedRead(next)
      if (nextRead) return wayTo(key, nextRead)
      follow(next, key)
    }
    if (isModule(file)) for (const imported of await importsOf(project, file)) visit(imported, followEdges, key)
  }
  return undefined
}
