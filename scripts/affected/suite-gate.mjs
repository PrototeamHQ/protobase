import { appendFileSync } from 'node:fs'
import { changedSince, checkBase, matches, printGroup } from './changes.mjs'
import { runEverything } from './rules.mjs'

// Says whether a CI job that runs one suite must run: with CHECK_BASE set to a commit, when a file changed since then
// is one the suite depends on (`dependsOn`, globs) or one every test depends on; without CHECK_BASE, as on a pull
// request or the weekly run, always; or when `forced` gives a reason it must run whatever changed. It prints why, and writes run=true or run=false to $GITHUB_OUTPUT.
export const gateSuite = (suite, dependsOn, forced) => {
  const reason = () => {
    if (forced) return forced
    const base = checkBase()
    if (!base) return 'CHECK_BASE is not set'
    const changed = changedSince(base)
    printGroup(`${changed.length} files changed since ${base}`, changed)
    const file = changed.find((file) => matches(file, [...runEverything, ...dependsOn]))
    return file && `${file} changed`
  }
  const why = reason()
  console.log(why ? `Running ${suite}: ${why}` : `Skipping ${suite}: nothing it depends on changed`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${Boolean(why)}\n`)
}
