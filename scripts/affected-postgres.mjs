// Says whether a change needs the Postgres suite (`bun run test:postgres`): with CHECK_BASE set to a commit, when a file
// changed since then is one it depends on (`postgresSuite` in scripts/affected/rules.mjs) or one every test depends on;
// without CHECK_BASE, as on a pull request or the weekly run, always. It prints why, and writes run=true or run=false
// to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs'
import { changedSince, checkBase, matches, printGroup } from './affected/changes.mjs'
import { postgresSuite, runEverything } from './affected/rules.mjs'

// Why the suite runs, or undefined when nothing it depends on changed.
const reason = () => {
  const base = checkBase()
  if (!base) return 'CHECK_BASE is not set'
  const changed = changedSince(base)
  printGroup(`${changed.length} files changed since ${base}`, changed)
  const file = changed.find((file) => matches(file, [...runEverything, ...postgresSuite]))
  return file && `${file} changed`
}

const why = reason()
console.log(why ? `Running the Postgres suite: ${why}` : 'Skipping the Postgres suite: nothing it depends on changed')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${Boolean(why)}\n`)
