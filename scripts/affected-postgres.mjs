// Says whether a change needs the Postgres suite (`bun run test:postgres`): see scripts/affected/suite-gate.mjs, with
// `postgresSuite` in scripts/affected/rules.mjs.
import { gateSuite } from './affected/suite-gate.mjs'
import { postgresSuite } from './affected/rules.mjs'

gateSuite('the Postgres suite', postgresSuite)
