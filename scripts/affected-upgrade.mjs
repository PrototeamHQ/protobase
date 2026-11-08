// Says whether a change needs the upgrade check: with CHECK_BASE set to a commit, when a file changed since then is one
// it runs or reads (`upgradeCheck` in scripts/affected/rules.mjs) or one every test depends on; without CHECK_BASE,
// always. It prints why, and writes run=true or run=false to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs'
import { absolute, changedSince, checkBase, everythingReason, matches, printGroup, trackedFiles } from './affected/changes.mjs'
import { openGraph, showWay } from './affected/related.mjs'
import { upgradeCheck } from './affected/rules.mjs'

// Why the upgrade check runs, or undefined when nothing it runs or reads changed.
const reason = async () => {
  const base = checkBase()
  if (!base) return 'CHECK_BASE is not set'
  const changed = changedSince(base)
  printGroup(`${changed.length} files changed since ${base}`, changed)
  const everything = everythingReason(changed)
  if (everything) return everything
  const read = changed.find((file) => matches(file, upgradeCheck.reads))
  if (read) return `${read} changed`
  const graph = await openGraph(changed)
  const way = await graph.wayOf({ loads: [], starts: trackedFiles(upgradeCheck.starts).map(absolute), reads: [] })
  await graph.close()
  return way && `${showWay(way)} changed`
}

const why = await reason()
console.log(why ? `Running the upgrade check: ${why}` : 'Skipping the upgrade check: nothing it runs or reads changed')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${Boolean(why)}\n`)
