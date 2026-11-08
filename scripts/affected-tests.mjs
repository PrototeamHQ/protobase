// Runs the tests of the Vitest projects named by --project, as `vitest run --project` takes them, that a change
// affects. With CHECK_BASE set to a commit, a test runs when it, or a module it imports, changed since then, as
// `vitest related` selects them, or when a rule in scripts/affected/rules.mjs ties it to a change the module graph does
// not show; a change to what every test depends on runs them all, and so does an unset CHECK_BASE. It prints the
// changes, why each test runs and which tests it skips. With --shard <index>/<count>, as `vitest run --shard` takes it,
// it runs only that part of the selected tests, for one of several CI legs.
import { parseArgs } from 'node:util'
import { createVitest } from 'vitest/node'
import { absolute, changedSince, checkBase, everythingReason, printGroup, trackedFiles } from './affected/changes.mjs'
import { findWay } from './affected/graph.mjs'
import { openGraph, relative, showWay } from './affected/related.mjs'
import { alwaysRun } from './affected/rules.mjs'

const { values } = parseArgs({ options: { project: { type: 'string', multiple: true }, shard: { type: 'string' } } })
const project = values.project ?? []
const projects = project.join(', ') || 'every project'

// The files whose importers run, each with why it is one, or why everything runs.
const selection = async () => {
  const base = checkBase()
  if (!base) return { everything: 'CHECK_BASE is not set' }
  const changed = changedSince(base)
  printGroup(`${changed.length} files changed since ${base}`, changed)
  const reason = everythingReason(changed)
  if (reason) return { everything: reason }

  const related = new Map(changed.map((file) => [absolute(file), 'changed']))
  for (const file of trackedFiles(alwaysRun)) related.set(absolute(file), 'runs on every push')
  const graph = await openGraph(changed)
  for (const edge of graph.edges) {
    const way = await graph.wayOf(edge)
    if (!way) continue
    for (const file of edge.from) if (!related.has(file)) related.set(file, `by scripts/affected/rules.mjs: ${showWay([file, ...way])}`)
  }
  await graph.close()
  return { related }
}

const { everything, related } = await selection()

// As `vitest run` sets them before it starts.
process.env.TEST = 'true'
process.env.VITEST = 'true'
process.env.NODE_ENV ??= 'test'
// A leg whose shard gets no test file passes, as one with no selected test does.
const vitest = await createVitest('test', { run: true, watch: false, project, ...(related && { related: [...related.keys()] }), ...(values.shard && { shard: values.shard, passWithNoTests: true }) })
const all = await vitest.globTestSpecifications()
const selected = everything ? all : await vitest.getRelevantTestSpecifications()
const name = (spec) => `|${spec.project.name}| ${relative(spec.moduleId)}`

if (everything) {
  console.log(`Running all ${all.length} test files of ${projects}: ${everything}`)
} else {
  console.log(`Running ${selected.length} of ${all.length} test files of ${projects}, each with the change it imports first:`)
  for (const spec of selected) {
    const way = await findWay({ project: spec.project, edge: { loads: [spec.moduleId], starts: [], reads: [] }, edgesOf: () => [], isChanged: (file) => related.has(file), changedRead: () => undefined })
    // Vitest runs every test when a file of its forceRerunTriggers changed.
    const reached = way?.at(-1)
    console.log(`  ${name(spec)} ← ${reached ? `${relative(reached)}, ${related.get(reached)}` : 'a file Vitest reruns every test for changed'}`)
  }
  const chosen = new Set(selected.map(name))
  printGroup(`Skipping ${all.length - selected.length} test files, which import none of the changes`, all.map(name).filter((spec) => !chosen.has(spec)))
}

// The files Vitest's own sharding gives this leg, out of those selected.
if (vitest.config.shard) {
  const { index, count } = vitest.config.shard
  const sequencer = new vitest.config.sequence.sequencer(vitest)
  const leg = selected.length > 0 ? await sequencer.shard([...selected]) : []
  printGroup(`Shard ${index}/${count} runs ${leg.length} of the ${selected.length} selected test files`, leg.map(name))
}

if (selected.length > 0) await vitest.start()
await vitest.exit()
