// The Markdown report of a workflow's window of runs: its p50 against the target, then the p50, p90 and latest wall,
// queue and run time of the whole workflow and of each job.
import { runFilters, type RunFilter } from './github'
import { describeVerdict, formatDuration, summarize } from './stats'
import type { RunTimings, Timing } from './timings'

export interface WorkflowConfig {
  file: string
  event?: string
  branch?: string
  targetMinutes: number
}

export interface Config {
  window: number
  workflows: WorkflowConfig[]
}

const name = (workflow: WorkflowConfig) => workflow.file.replace(/\.ya?ml$/, '')

const runsOf = (filter: RunFilter) => {
  const event = filter.event ? `${filter.event} ` : ''
  const branch = filter.branch ? ` on ${filter.branch}` : ' on any branch'
  return `${event}runs${branch}`
}

/** The run count and every event and branch the window takes its runs from, e.g. "3 successful push runs on main". */
const scope = (workflow: WorkflowConfig, count: number) => `${count} successful ${runFilters(workflow).map(runsOf).join(' and ')}`

const cell = (newestFirst: number[]) => {
  const { p50, p90, latest } = summarize(newestFirst)
  return `${formatDuration(p50)} · ${formatDuration(p90)} · ${formatDuration(latest)}`
}

const row = (label: string, timings: Timing[]) =>
  `| ${label} | ${timings.length} | ${cell(timings.map((t) => t.wall))} | ${cell(timings.map((t) => t.queue))} | ${cell(timings.map((t) => t.run))} |`

/** Job names in the order of the newest run that has them. */
const jobNames = (runs: RunTimings[]) => [...new Set(runs.flatMap((run) => [...run.jobs.keys()]))]

/** `runs` newest first. */
export const workflowReport = (workflow: WorkflowConfig, runs: RunTimings[]) => {
  const target = workflow.targetMinutes * 60
  const heading = `## ${name(workflow)}`
  if (runs.length === 0) return `${heading}\n\nNo ${scope(workflow, 0).replace(/^0 /, '')} to measure against the target of ${formatDuration(target)}.\n`
  const verdict = describeVerdict(name(workflow), summarize(runs.map((run) => run.wall)).p50, target)
  const newest = runs[0] as RunTimings
  const jobRows = jobNames(runs).map((job) => row(job, runs.flatMap((run) => run.jobs.get(job) ?? [])))
  return [
    heading,
    '',
    `**${verdict}**`,
    '',
    `${scope(workflow, runs.length)}, the newest [${newest.id}](${newest.url}). Each cell is p50 · p90 · latest.`,
    '',
    '| | runs | wall | queue | run |',
    '| --- | --- | --- | --- | --- |',
    row('**workflow**', runs),
    ...jobRows,
    '',
  ].join('\n')
}

export const report = (config: Config, runsByWorkflow: RunTimings[][]) =>
  ['# Release speed', '', ...config.workflows.map((workflow, index) => workflowReport(workflow, runsByWorkflow[index] ?? []))].join('\n')
