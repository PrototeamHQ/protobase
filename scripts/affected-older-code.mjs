// Says whether a change needs the older-code job, the previous release's tests on this checkout's migrations: as
// scripts/affected/suite-gate.mjs says for `olderCode` in scripts/affected/rules.mjs.
import { gateSuite } from './affected/suite-gate.mjs'
import { olderCode } from './affected/rules.mjs'

gateSuite('the older-code job', olderCode)
