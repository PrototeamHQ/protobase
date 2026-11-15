import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataGrid } from './data-grid'

const rows = [
  { id: '10', title: 'Fix the login' },
  { id: '11', title: 'Write the notes' },
]
const grid = (chosenRow?: string) =>
  renderToStaticMarkup(
    <DataGrid fit columns={[{ id: 'title', header: 'Title', kind: 'text', width: 200 }]} source={{ total: rows.length, rowAt: (index) => rows[index]! }} latencyMs={0} selectable={false} {...(chosenRow && { chosenRow })} />,
  )
const marked = (html: string) => [...html.matchAll(/<div[^>]*role="row"[^>]*>/g)].map((row) => row[0]).filter((row) => row.includes('aria-current="true"'))

describe('a grid with a chosen row', () => {
  it('marks that row alone as current, in the selected look', () => {
    const html = grid('11')
    expect(marked(html)).toHaveLength(1)
    expect(marked(html)[0]).toContain('bg-primary-soft')
    expect(html).toMatch(/aria-current="true"[^]*Write the notes/)
    expect(html.indexOf('aria-current')).toBeGreaterThan(html.indexOf('Fix the login'))
  })

  it('marks no row without one', () => {
    const html = grid()
    expect(html).toContain('Write the notes')
    expect(marked(html)).toHaveLength(0)
  })
})
