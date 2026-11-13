import { describe, expect, it } from 'vitest'
import { Table } from '../blocks'
import { renderText } from './render-text'
import { tableMarkdown, type TableText } from './table-text'

const objectives: TableText = {
  columns: [
    { name: 'rank', label: 'Rank' },
    { name: 'title', label: 'Title', title: true },
    { name: 'verdict', label: 'Verdict', badge: true, valueLabels: { on_track: 'On track' } },
  ],
  rows: [
    { rank: 1, title: 'Ship the table | fast', verdict: 'on_track' },
    { rank: 2, title: 'Two\nlines', verdict: null },
  ],
}

describe('tableMarkdown', () => {
  it('writes a header row, a separator row and a row per record, most important columns first', () => {
    expect(tableMarkdown(objectives)).toBe(
      ['| Title | Verdict | Rank |', '| --- | --- | --- |', '| Ship the table \\| fast | On track | 1 |', '| Two lines | — | 2 |'].join('\n'),
    )
  })

  it('orders the columns by the priorities the table gives', () => {
    const header = tableMarkdown(objectives, ['title', 'rank', { name: 'verdict', priority: 1 }]).split('\n')[0]
    expect(header).toBe('| Verdict | Title | Rank |')
  })

  it('writes an object as JSON on one line', () => {
    const markdown = tableMarkdown({ columns: [{ name: 'meta', label: 'Meta' }], rows: [{ meta: { a: 1 } }] })
    expect(markdown.split('\n')[2]).toBe('| {"a":1} |')
  })

  it('is empty without columns', () => {
    expect(tableMarkdown({ columns: [], rows: [] })).toBe('')
  })
})

describe('the Table text form', () => {
  const node = Table({ resource: 'objectives', title: 'Objectives', columns: ['rank', 'title', { name: 'verdict', priority: 1 }] })

  it('reads as its heading when the caller loaded nothing', () => {
    expect(renderText(node)).toBe('### [Objectives](/objectives)')
  })

  it('reads as its heading and a Markdown table of what the caller loaded', () => {
    expect(renderText(node, { tables: () => objectives })).toBe(
      ['### [Objectives](/objectives)', '', '| Verdict | Title | Rank |', '| --- | --- | --- |', '| On track | Ship the table \\| fast | 1 |', '| — | Two lines | 2 |'].join('\n'),
    )
  })
})
