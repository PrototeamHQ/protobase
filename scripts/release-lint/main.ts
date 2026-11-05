// Prints the head the previous release run of main linted the commits up to (see linted-head.ts), or nothing when none
// of the recent runs did. The release workflow's commits job runs it with GITHUB_RUN_ID and GH_TOKEN.
//
//   bun scripts/release-lint/main.ts
import { api } from '../release-speed/github'
import { lintedHead } from './linted-head'

const currentRun = Number(process.env.GITHUB_RUN_ID)
if (!Number.isInteger(currentRun) || currentRun <= 0) throw new Error('GITHUB_RUN_ID must be the id of the running release run')

console.log(lintedHead(currentRun, api) ?? '')
