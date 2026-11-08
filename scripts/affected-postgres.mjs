// Says whether a change needs the Postgres suite (`bun run test:postgres`). A release runs it whatever changed, as the
// last fail-safe (POSTGRES_FULL=true, from the release workflow). Otherwise it runs when the snapshot recordings differ
// from those at CHECK_BASE, or the record job did not get to compare them (RECORDINGS, from scripts/affected-recordings.mjs,
// is not `unchanged`), and as scripts/affected/suite-gate.mjs says for `postgresSuite` in scripts/affected/rules.mjs,
// what the recordings cannot show.
import { gateSuite } from './affected/suite-gate.mjs'
import { postgresSuite } from './affected/rules.mjs'

const full = process.env.POSTGRES_FULL
if (full !== 'true' && full !== 'false') throw new Error(`POSTGRES_FULL must be true or false, not ${full ?? 'unset'}`)

const forced = () => {
  if (full === 'true') return 'a release runs it whatever changed'
  if (process.env.RECORDINGS !== 'unchanged') return 'the snapshot recordings differ from those at CHECK_BASE, or were not compared'
  return undefined
}
gateSuite('the Postgres suite', postgresSuite, forced())
