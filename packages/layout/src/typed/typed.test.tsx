/** @jsxImportSource @protobase/layout */
import { f, resource } from '@protobase/schema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Card, CardRow, RecordCard, Show, Table } from '../blocks'
import { parseCondition, evaluateCondition } from '../condition'
import { RecordsIterator, ReferenceField, ReferenceManyField } from '../list-blocks'
import { layout, recordLayout } from './layout'
import { fieldRecorder, not, now } from './record'
import type { RecordIn, ResourceNameIn } from './types'

describe('a typed layout', () => {
  it('builds the same static tree as the JSX written by hand', () => {
    const typed = layout(({ resources }) => (
      <Card title="Coming next">
        <Table title="Starts next" resource="loop_ready" filter={(f) => f.kind.eq('resume').or(f.objectives_paused.eq(false))} sort={['kind asc', 'task_id asc']} columns={['task_id', 'repo']} limit={6} />
        <Show when={resources.loop_held.count.gt(0)}>
          <Table resource="routines" filter={(f) => f.enabled.eq(true).and(f.next_run_at.lt(now().plus('7d')))} sort={['next_run_at asc']} columns={['title']} />
        </Show>
      </Card>
    ))
    const written = (
      <Card title="Coming next">
        <Table title="Starts next" resource="loop_ready" filter={'kind = "resume" OR objectives_paused = false'} sort={['kind asc', 'task_id asc']} columns={['task_id', 'repo']} limit={6} />
        <Show when="loop_held.count > 0">
          <Table resource="routines" filter="enabled = true AND next_run_at < now() + 7d" sort={['next_run_at asc']} columns={['title']} />
        </Show>
      </Card>
    )
    expect(typed).toEqual(written)
    expect(typed.children[0]).toMatchObject({ props: { sort: 'kind asc, task_id asc' } })
  })

  it("writes a record page's paths as placeholders: the record by name, from inside a list as @root, an outer item as ../", () => {
    const tree = recordLayout('tasks', ({ data }) => (
      <>
        <Table title={`Runs of ${data.title}`} resource="task_runs" filter={(f) => f.task_id.eq(data.id)} />
        <ReferenceManyField reference="task_runs" target="task_id">
          <RecordsIterator>
            {(run) => (
              <RecordCard resource="task_steps" filter={(f) => f.run_id.eq(run.id)} title={`${run.outcome} of ${data.title}`}>
                {(step) => <Card title={`${step.name} in ${run.outcome}, ${data.id}`} />}
              </RecordCard>
            )}
          </RecordsIterator>
        </ReferenceManyField>
      </>
    ))
    expect(tree.type).toBe('Fragment')
    const [table, list] = tree.children as any[]
    expect(table.props).toMatchObject({ title: 'Runs of {{title}}', filter: 'task_id = {{id}}' })
    const card = list.children[0].children[0]
    expect(card.props).toMatchObject({ filter: 'run_id = {{id}}', title: '{{outcome}} of {{@root.title}}' })
    expect(card.children[0].props.title).toBe('{{name}} in {{../outcome}}, {{@root.id}}')
  })

  it('prints conditions as AIP-160, bracketing a mix of AND and OR, and every comparison', () => {
    const f = fieldRecorder() as any
    expect(String(f.a.eq(1).and(f.b.eq(2).or(f.c.eq(3))))).toBe('a = 1 AND (b = 2 OR c = 3)')
    expect(String(f.a.eq(1).and(f.b.eq(2)).and(f.c.eq(3)))).toBe('a = 1 AND b = 2 AND c = 3')
    expect(String(not(f.a.eq('x').or(f.b.isNull())))).toBe('NOT (a = "x" OR isNull(b))')
    expect(String(f.status.in(['open', 'held']))).toBe('in(status, "open", "held")')
    expect(String(f.tags.contains('urgent'))).toBe('tags:"urgent"')
    expect(String(f.owner.eq(null))).toBe('isNull(owner)')
    expect(String(f.plan.name.ne('Pro'))).toBe('plan.name != "Pro"')
    expect(String(f.closed_on.ge(now().minus('1d')))).toBe('closed_on >= now() - 1d')
    expect(() => now().plus('a week')).toThrow(/not a duration/)
  })

  it('refuses a filter arrow that gives no condition, and a list function on a block that draws no record', () => {
    expect(() => Table({ resource: 'tasks', filter: (() => 'status = "open"') as any })).toThrow(/arrow that gives no condition/)
    expect(() => Card({ children: (() => null) as any })).toThrow(/take a function of their record/)
  })
})

describe('a condition', () => {
  it('evaluates now() and now() plus or minus a duration against the time given', () => {
    const at = Date.parse('2026-01-10T00:00:00.000Z')
    const parsed = parseCondition('due_at < now() + 7d')
    if (!parsed.ok) throw new Error(parsed.message)
    expect(evaluateCondition(parsed, { due_at: '2026-01-15T00:00:00.000Z' }, at)).toBe(true)
    expect(evaluateCondition(parsed, { due_at: '2026-01-20T00:00:00.000Z' }, at)).toBe(false)
  })

  it('refuses a function no condition can evaluate, such as regex(), which only a list filter reads', () => {
    expect(parseCondition('regex(name, "^a")')).toMatchObject({ ok: false, message: expect.stringContaining('regex() only works in a list') })
  })
})

describe('the types of a config module', () => {
  const tasks = resource('tasks').table('tasks').fields({ id: f.integer(), title: f.text(), done: f.boolean() })
  const notes = resource('notes').table('notes').fields({ id: f.integer(), text: f.text() })
  type App = { tasks: typeof tasks; notes: typeof notes; other: string }

  it('names its resources and types their records', () => {
    expectTypeOf<ResourceNameIn<App>>().toEqualTypeOf<'tasks' | 'notes'>()
    expectTypeOf<keyof RecordIn<App, 'tasks'>>().toEqualTypeOf<'id' | 'title' | 'done'>()
    expectTypeOf<ResourceNameIn<{ other: string }>>().toEqualTypeOf<string>()
  })
})

describe('the records a recorded path reads from', () => {
  it("count the records element children draw in too, so a path reads the record it came from", () => {
    const tree = recordLayout('tasks', ({ data }) => (
      <CardRow resource="task_runs" filter={(f) => f.task_id.eq(data.id)}>
        {(run) => (
          <ReferenceField source="worker_id" reference="workers">
            <ReferenceField source="team_id" reference="teams">
              {(team) => <Card title={`${team.name}: ${run.outcome} of ${data.title}`} />}
            </ReferenceField>
          </ReferenceField>
        )}
      </CardRow>
    ))
    const card = (tree as any).children[0].children[0].children[0]
    expect(card.props.title).toBe('{{name}}: {{../../outcome}} of {{@root.title}}')
  })

  it('takes a path a child function returns as text, and quotes a recorded value in a list of a filter', () => {
    const tree = layout(() => (
      <RecordCard resource="tasks" filter="id = 1">
        {(task) => <Table resource="tasks" filter={(f) => f.title.in([task.title])} />}
      </RecordCard>
    ))
    expect((tree as any).children[0].props.filter).toBe('in(title, {{title}})')
    const iterated = layout(() => (
      <ReferenceManyField reference="task_runs" target="task_id">
        <RecordsIterator>{(run) => run.outcome}</RecordsIterator>
      </ReferenceManyField>
    ))
    expect((iterated as any).children[0].children).toEqual(['{{outcome}}'])
  })

  it('refuses a condition on a record further out than the nearest, and a child function outside a typed layout', () => {
    expect(() =>
      recordLayout('tasks', ({ data }) => (
        <RecordCard resource="task_runs" filter="id = 1">
          {() => (
            <Show when={data.status.eq('open')}>
              <Card title="x" />
            </Show>
          )}
        </RecordCard>
      )),
    ).toThrow(/further out than the nearest/)
    expect(() => RecordCard({ resource: 'tasks', children: (() => null) as any })).toThrow(/only inside a typed layout/)
  })
})
