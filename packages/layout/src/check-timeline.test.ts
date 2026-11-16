import { describe, expect, it } from 'vitest'
import { Field, Page, Timeline, type TimelineProps } from './blocks'
import { pageProblems } from './check-page'
import { structureProblems } from './check-structure'
import { compileReadPlan } from './compile-read-plan'
import type { LayoutNode } from './node'
import { field, model } from './testing/models'
import { pageText } from './text/page-text'

// Work in phases: each phase of a task a record, the tasks of a project in its lane
const models = {
  phases: model('phases', [
    field('id', 'integer', { readOnly: true }),
    field('project', 'text'),
    field('task_id', 'integer'),
    field('phase', 'enum', { enumValues: ['build', 'ci'] }),
    field('started_at', 'timestamp'),
    field('ended_at', 'timestamp', { nullable: true }),
    field('meta', 'json'),
    field('note', 'text'),
  ]),
}

const props: TimelineProps = { resource: 'phases', lane: 'project', bar: 'task_id', start: 'started_at', end: 'ended_at', color: 'phase' }
const page = (timeline: LayoutNode) => Page({ title: 'Work', children: timeline })
const problems = (tree: LayoutNode) => pageProblems({ name: 'work', title: 'Work', tree }, { models, actions: () => new Set() })

describe('Timeline checks', () => {
  it('takes a lane, a bar, dated start and end fields and an enum colour', () => {
    expect(problems(page(Timeline(props)))).toEqual([])
  })

  it('refuses unknown fields, undated times, a colour that is no enum and a json lane', () => {
    const found = problems(page(Timeline({ ...props, lane: 'meta', bar: 'nope', start: 'note', color: 'project', limit: 100_001 })))
    expect(found).toEqual([
      '<Page> › <Timeline resource="phases">: lane: "meta" is a json field, which has no values to group by',
      '<Page> › <Timeline resource="phases">: bar: unknown field "nope" on phases',
      '<Page> › <Timeline resource="phases">: start: "note" is text; a segment runs between date or timestamp fields',
      '<Page> › <Timeline resource="phases">: color: "project" is text; a segment takes its colour from an enum field',
      '<Page> › <Timeline resource="phases">: limit must be a whole number from 1 to 100000',
    ])
  })

  it('takes children only with select, and resolves them in the chosen bar', () => {
    expect(structureProblems(page(Timeline({ ...props, children: Field({ source: 'phase' }) })))).toContain('<Page> › <Timeline resource="phases">: takes children only with "select": they draw the row it chooses')
    expect(problems(page(Timeline({ ...props, select: 'task', children: Field({ source: 'phase' }) })))).toEqual([])
  })
})

describe('Timeline reads', () => {
  it('reads one page of its segments latest first, and the chosen bar as its first segment', () => {
    const { plan } = compileReadPlan(page(Timeline({ ...props, select: 'task', children: Field({ source: 'note' }) })), { models })
    const [own, chosen] = plan.reads
    expect(own).toMatchObject({ resource: 'phases', orderBy: 'started_at desc', pageSize: 500, fields: ['ended_at', 'id', 'phase', 'project', 'started_at', 'task_id'] })
    expect(chosen).toEqual({ block: '/children/0', part: 'chosen', kind: 'list', resource: 'phases', filter: 'task_id = {{@params.task}}', orderBy: 'started_at asc', pageSize: 1, fields: ['id', 'note'], etag: false })
  })

  it('takes a limit beyond one page, and its plan still reads one page', () => {
    expect(problems(page(Timeline({ ...props, limit: 50_000 })))).toEqual([])
    expect(problems(page(Timeline({ ...props, limit: 0 })))).toEqual(['<Page> › <Timeline resource="phases">: limit must be a whole number from 1 to 100000'])
    expect(problems(page(Timeline({ ...props, limit: 2.5 })))).toEqual(['<Page> › <Timeline resource="phases">: limit must be a whole number from 1 to 100000'])
    expect(compileReadPlan(page(Timeline({ ...props, limit: 50_000 })), { models }).plan.reads[0]!.pageSize).toBe(500)
    expect(compileReadPlan(page(Timeline({ ...props, limit: 40 })), { models }).plan.reads[0]!.pageSize).toBe(40)
  })

  it('reads the chosen bar among the records the timeline shows', () => {
    const { plan } = compileReadPlan(page(Timeline({ ...props, filter: "project = 'web'", select: 'task', children: Field({ source: 'note' }) })), { models })
    expect(plan.reads[1]!.filter).toBe('project = "web" AND task_id = {{@params.task}}')
  })

  it('reads as a table with a row per segment, the earliest first, an open end as a dash, under the labels of their fields, then the chosen bar', async () => {
    const tree = page(Timeline({ ...props, title: 'Work', select: 'task', children: Field({ source: 'note', label: 'Note' }) }))
    const { plan } = compileReadPlan(tree, { models })
    const rows = [
      { id: 1, project: 'web', task_id: 7, phase: 'build', started_at: '2026-11-14T09:00:00Z', ended_at: '2026-11-14T10:00:00Z', note: 'First' },
      { id: 2, project: 'web', task_id: 7, phase: 'ci', started_at: '2026-11-14T10:00:00Z', ended_at: null },
    ]
    const labels = { phases: { project: { label: 'Project' }, task_id: { label: 'Task' }, phase: { label: 'Phase', valueLabels: { ci: 'Waiting for CI' } }, started_at: { label: 'Started' }, ended_at: { label: 'Ended' } } }
    const text = await pageText(tree, plan, { params: { task: '7' }, labels, read: async (read) => ({ rows: read.part === 'chosen' ? rows.slice(0, 1) : rows.toReversed() }) })
    expect(text).toBe(
      [
        '# Work',
        '### [Work](/phases)',
        [
          '| Project | Task | Phase | Started | Ended |',
          '| --- | --- | --- | --- | --- |',
          '| web | 7 | build | 2026-11-14T09:00:00Z | 2026-11-14T10:00:00Z |',
          '| web | 7 | Waiting for CI | 2026-11-14T10:00:00Z | — |',
        ].join('\n'),
        '**Note**: First',
      ].join('\n\n'),
    )
  })
})
