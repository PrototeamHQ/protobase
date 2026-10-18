// Says whether a change needs the snapshot tests recorded again (`bun run test:record`): see
// scripts/affected/suite-gate.mjs, with `snapshotRecording` in scripts/affected/rules.mjs.
import { gateSuite } from './affected/suite-gate.mjs'
import { snapshotRecording } from './affected/rules.mjs'

gateSuite('the snapshot recording', snapshotRecording)
