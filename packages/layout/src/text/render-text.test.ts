import { describe, expect, it } from 'vitest'
import { Card, Field, Grid, Link, Page, Progress, RecordCard, Show, Stat } from '../blocks'
import { component } from '../component'
import { Box, Column, Row, Text } from '../elements'
import { blocks } from './markdown'
import { renderText } from './render-text'
import { textForms } from './forms'
import { childrenText, type TextForm } from './text-form'

const record = { title: 'Fix the roof', status: 'in_progress', seats: 3, plan: { seats: 10 } }
const fields = { status: { label: 'Status', valueLabels: { in_progress: 'In progress' } } }

describe('renderText', () => {
  it('renders each child of a container as its own text, in order', () => {
    const section = Box({ children: [Text({ as: 'h2', children: 'Roof' }), Field({ name: 'title', label: 'Title' }), Field({ name: 'seats', label: 'Seats' }), Field({ name: 'status', format: 'badge' })] })
    expect(renderText(section, { record, fields })).toBe('## Roof\n\n**Title**: Fix the roof\n\n**Seats**: 3\n\n**Status**: In progress')
  })

  it('renders nested containers as their children flattened', () => {
    const parts = [Text({ children: 'One' }), Text({ children: 'Two' }), Text({ children: 'Three' })]
    const nested = Grid({ children: [Row({ children: [parts[0]!, Column({ children: [parts[1]!] })] }), Box({ children: [parts[2]!] })] })
    expect(renderText(nested)).toBe(renderText(Box({ children: parts })))
  })

  it('reads an enum value as its label, not its raw value', () => {
    expect(renderText(Field({ name: 'status', label: false }), { record, fields })).toBe('In progress')
  })

  it('runs text and links on in one line, as one part', () => {
    const line = Text({ children: ['See ', Link({ href: 'https://example.com/a b', children: 'the guide' }), ' first.'] })
    expect(renderText(line)).toBe('See [the guide](https://example.com/a%20b) first.')
  })

  it('escapes what Markdown would take as markup in plain text', () => {
    expect(renderText(Text({ children: '# not a *heading*' }))).toBe('\\# not a \\*heading\\*')
  })

  it('fills a link to an address from the record, and keeps it as written without one', () => {
    const toRecord = Link({ to: { kind: 'record', resource: 'tasks', key: '{title}' }, children: 'Open' })
    expect(renderText(toRecord, { record, basePath: '/admin' })).toBe('[Open](/admin/tasks/Fix%20the%20roof)')
    expect(renderText(toRecord)).toBe('[Open](/tasks/%7Btitle%7D)')
  })

  it('reads a field as its label alone without a record', () => {
    expect(renderText(Field({ name: 'status' }), { fields })).toBe('**Status**')
  })

  it('gives what a record card holds no record of the page around it', () => {
    const card = RecordCard({ resource: 'tasks', title: 'Latest', children: [Field({ name: 'title', label: 'Title' })] })
    expect(renderText(card, { record })).toBe('### [Latest](/tasks)\n\n**Title**')
  })

  it('leaves out what a condition hides when it has a record', () => {
    const shown = Show({ when: "status = 'in_progress'", children: Text({ children: 'Working' }) })
    const hidden = Show({ when: "status = 'done'", children: Text({ children: 'Done' }) })
    expect(renderText(Box({ children: [shown, hidden] }), { record })).toBe('Working')
    expect(renderText(Box({ children: [shown, hidden] }))).toBe('Working\n\nDone')
  })

  it('reads stats and progress bars from fields of the record, through relations', () => {
    expect(renderText(Stat({ label: 'Plan', field: 'plan.seats' }), { record })).toBe('**Plan**: 10')
    expect(renderText(Progress({ label: 'Seats', value: 'seats', max: 'plan.seats' }), { record })).toBe('**Seats**: 3 / 10')
  })

  it('reads a custom component as its fallback, or else as what it holds', () => {
    const Chart = component('SeatChart', { fallback: Stat({ label: 'Seats', value: 3 }) })
    const Panel = component<object>('Panel')
    expect(renderText(Chart({}))).toBe('**Seats**: 3')
    expect(renderText(Panel({ children: Text({ children: 'Inside' }) }))).toBe('Inside')
  })

  it('takes a form of its own for a custom component', () => {
    const Panel = component('Panel')
    const forms = { Panel: (() => 'A panel') satisfies TextForm }
    expect(renderText(Page({ title: 'Home', children: Panel({}) }), { forms })).toBe('# Home\n\nA panel')
  })

  describe('a form of its own', () => {
    const page = Page({ title: 'Home', children: [Text({ children: 'One' }), Card({ title: 'Two', children: Text({ children: 'Three' }) })] })

    it('post-processes the children: a horizontal line between each', () => {
      const ruled: TextForm = ({ children }) => blocks(children, '\n\n---\n\n')
      expect(renderText(Box({ children: [Text({ children: 'One' }), Text({ children: 'Two' })] }), { forms: { Box: ruled } })).toBe('One\n\n---\n\nTwo')
      expect(renderText(Box({ children: [Text({ children: 'One' }), Text({ children: 'Two' })] }))).toBe('One\n\nTwo')
    })

    it('wraps the built-in form with text before and after', () => {
      const wrapped: TextForm = (context) => `Before\n\n${textForms.Card!(context)}\n\nAfter`
      expect(renderText(page, { forms: { Card: wrapped } })).toBe('# Home\n\nOne\n\nBefore\n\n### Two\n\nThree\n\nAfter')
    })

    it('uses the default as is', () => {
      expect(renderText(page, { forms: { Card: childrenText } })).toBe('# Home\n\nOne\n\nThree')
    })
  })
})
