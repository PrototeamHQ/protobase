import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { presets } from './presets'

// Every preset ships the deploy guide's older-code workflow as is, off until the app runs it from the Actions tab.
const root = path.join(import.meta.dirname, '..', '..', '..')
const guide = readFileSync(path.join(root, 'docs/website/src/content/docs/guides/deploy.md'), 'utf8')
const section = guide.slice(guide.indexOf('### Test the version that serves on the new schema'))
const documented = /```yaml\n([\s\S]*?)```/.exec(section)![1]!

const shipped = (source: string) => readFileSync(path.join(root, source, '.github/workflows/older-code.yml'), 'utf8')

describe('the older-code workflow', () => {
  it.each(presets)('ships in the $name preset as the deploy guide shows it', ({ source }) => {
    expect(shipped(source)).toBe(documented)
  })

  it('runs only when dispatched, from the version that serves now', () => {
    const workflow = parse(documented)
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow.on.workflow_dispatch.inputs.previous.default).toBe('main')
  })

  it('migrates an empty Postgres 18 with this branch, then runs the previous version\'s tests on it', () => {
    const job = parse(documented).jobs['older-code']
    expect(job.services.postgres.image).toBe('postgres:18')
    expect(job.env.DATABASE_URL).toBe('postgres://app:app@localhost:5432/app')
    const runs = job.steps.map((step: { run?: string }) => step.run).filter(Boolean)
    expect(runs.slice(0, 2)).toEqual(['bun install --frozen-lockfile', 'bun run db:migrate'])
    expect(runs[2]).toContain('git worktree add --detach "$RUNNER_TEMP/previous"')
    expect(job.steps.at(-1)).toEqual({ 'working-directory': '${{ runner.temp }}/previous', run: 'bun install --frozen-lockfile && bun run test' })
  })

  it.each(presets)('finds the scripts it runs in the $name preset', ({ source }) => {
    const { scripts } = JSON.parse(readFileSync(path.join(root, source, 'package.json'), 'utf8'))
    expect(scripts['db:migrate']).toBeDefined()
    expect(scripts.test).toBeDefined()
  })
})
