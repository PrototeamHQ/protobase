// Says whether the committed snapshot recordings (`*.sql.json`) differ from those at CHECK_BASE: what the commits since
// then changed in them. A recording that recording again would change fails the record job, so the committed ones are
// what the Postgres job needs to know. It writes recordings=changed or recordings=unchanged to $GITHUB_OUTPUT for that
// job (scripts/affected-postgres.mjs). Without CHECK_BASE there is nothing to compare with: changed.
import { appendFileSync } from 'node:fs'
import { changedSince, checkBase, matches, printGroup } from './affected/changes.mjs'

const base = checkBase()
const changed = base ? changedSince(base).filter((file) => matches(file, ['**/*.sql.json'])) : undefined
if (changed) printGroup(`${changed.length} recordings differ from ${base}`, changed)
const recordings = changed?.length === 0 ? 'unchanged' : 'changed'
console.log(base ? `The recordings are ${recordings} since ${base}` : 'CHECK_BASE is not set: counting the recordings as changed')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `recordings=${recordings}\n`)
