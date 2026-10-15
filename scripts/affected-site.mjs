// Says whether a change needs the documentation site and Storybook built and checked: with CHECK_BASE set to a
// commit, when a file changed since then is one they are built from (`site` in scripts/affected/rules.mjs) or one every
// test depends on; without CHECK_BASE, always. It prints why, and writes run=true or run=false to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs'
import { changedSince, checkBase, everythingReason, matches, printGroup, trackedFiles, absolute } from './affected/changes.mjs'
import { openGraph, showWay } from './affected/related.mjs'
import { site } from './affected/rules.mjs'

// Why the site runs, or undefined when nothing it is built from changed.
const reason = async () => {
  const base = checkBase()
  if (!base) return 'CHECK_BASE is not set'
  const changed = changedSince(base)
  printGroup(`${changed.length} files changed since ${base}`, changed)
  const everything = everythingReason(changed)
  if (everything) return everything
  const read = changed.find((file) => matches(file, site.reads))
  if (read) return `${read} changed`
  const graph = await openGraph(changed)
  const way = await graph.wayOf({ loads: trackedFiles(site.loads).map(absolute), starts: [], reads: [] })
  await graph.close()
  return way && `${showWay(way)} changed`
}

const why = await reason()
console.log(why ? `Building and checking the site and Storybook: ${why}` : 'Skipping the site and Storybook: nothing they are built from changed')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${Boolean(why)}\n`)
