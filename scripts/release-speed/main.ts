// Prints how fast the release and ci workflows run against their targets in config.json: the p50, p90 and latest wall,
// queue and run time over the window of recent successful runs, per workflow and per job. In a workflow it writes the
// report to the job summary as well. It only reports: a target that is not met does not fail it.
//
//   bun run release:speed
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recentRuns } from './github'
import { report, type Config } from './report'
import { runTimings } from './timings'

const config = JSON.parse(readFileSync(join(import.meta.dirname, 'config.json'), 'utf8')) as Config
const runsByWorkflow = config.workflows.map((workflow) => recentRuns(workflow, config.window).map(({ run, jobs }) => runTimings(run, jobs)))
const markdown = report(config, runsByWorkflow)

console.log(markdown)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
