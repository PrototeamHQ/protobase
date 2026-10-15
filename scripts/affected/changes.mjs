import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { isModule } from './graph.mjs'
import { edges, readByNoTest, runEverything } from './rules.mjs'

export const root = path.resolve(import.meta.dirname, '..', '..')

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)

export const matches = (file, globs) => globs.some((glob) => path.matchesGlob(file, glob))

export const absolute = (file) => path.join(root, file)

export const tracked = git('ls-files')

/**
 * The files changed since `base`, a commit, up to the working tree: what the commits since their merge base and the
 * uncommitted changes add, change, delete or rename, both names of a rename.
 */
export const changedSince = (base) => {
  const [mergeBase] = git('merge-base', base, 'HEAD')
  return [...new Set([...git('diff', '--name-only', '--no-renames', mergeBase), ...git('ls-files', '--others', '--exclude-standard')])].sort()
}

/**
 * The globs a rule names, as the tracked files they match. A glob that matches none fails, so a rule cannot go quiet
 * when the files it names move.
 */
export const trackedFiles = (globs) =>
  globs.flatMap((glob) => {
    const files = tracked.filter((file) => path.matchesGlob(file, glob))
    if (files.length === 0) throw new Error(`${glob} in scripts/affected/rules.mjs matches no file`)
    return files
  })

/** The edges of rules.mjs with their modules as absolute paths, and a lookup of a module's edges. */
export const resolveEdges = (list = edges) => {
  const resolved = list.map((edge) => {
    trackedFiles(edge.reads ?? [])
    return {
      from: new Set(trackedFiles(edge.from).map(absolute)),
      loads: trackedFiles(edge.loads ?? []).map(absolute),
      starts: trackedFiles(edge.starts ?? []).map(absolute),
      reads: edge.reads ?? [],
    }
  })
  return { edges: resolved, edgesOf: (file) => resolved.filter((edge) => edge.from.has(file)) }
}

/** Why `changed` runs every test, or undefined: a file all tests depend on, or one no rule says which tests read. */
export const everythingReason = (changed) => {
  const config = changed.find((file) => matches(file, runEverything))
  if (config) return `${config} changed, which every test depends on`
  const unread = changed.find((file) => !isModule(file) && !matches(file, readByNoTest) && !edges.some((edge) => matches(file, edge.reads ?? [])))
  if (unread) return `${unread} changed, which is no module and which no rule in scripts/affected/rules.mjs says which tests read`
  return undefined
}

/** The base CHECK_BASE names, or undefined to run everything; it fails on a base git does not know. */
export const checkBase = () => {
  const base = process.env.CHECK_BASE
  if (!base) return undefined
  git('rev-parse', '--verify', `${base}^{commit}`)
  return base
}

/** Prints `lines` as a group the GitHub Actions log folds, or plainly elsewhere. */
export const printGroup = (title, lines) => {
  const folded = process.env.GITHUB_ACTIONS === 'true'
  console.log(folded ? `::group::${title}` : title)
  for (const line of lines) console.log(`  ${line}`)
  if (folded) console.log('::endgroup::')
}
