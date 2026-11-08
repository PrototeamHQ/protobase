// Says whether the snapshot recordings (`*.sql.json`) differ from those at CHECK_BASE, after the record job recorded
// them again or found it did not need to: what the commits since then changed in them and what recording rewrote or
// added. It writes recordings=changed or recordings=unchanged to $GITHUB_OUTPUT for the Postgres job
// (scripts/affected-postgres.mjs). Without CHECK_BASE there is nothing to compare with: changed.
import { appendFileSync } from 'node:fs'
import { changedSince, checkBase, matches, printGroup } from './affected/changes.mjs'

const base = checkBase()
const changed = base ? changedSince(base).filter((file) => matches(file, ['**/*.sql.json'])) : undefined
if (changed) printGroup(`${changed.length} recordings differ from ${base}`, changed)
const recordings = changed?.length === 0 ? 'unchanged' : 'changed'
console.log(base ? `The recordings are ${recordings} since ${base}` : 'CHECK_BASE is not set: counting the recordings as changed')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `recordings=${recordings}\n`)
