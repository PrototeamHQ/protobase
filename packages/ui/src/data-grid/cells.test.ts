import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderCell } from './cells'
import type { ColumnSpec } from './column-spec'

const users = (id: string) => (id === 'u1' ? { name: 'Sanne M.', initials: 'SM', hue: 250 } : undefined)
const spec = (extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ id: 'owner', header: 'Owner', kind: 'user', width: 130, ...extra })
const render = (column: ColumnSpec, value: unknown) => renderToStaticMarkup(renderCell(column, value))

describe('renderCell for a user column', () => {
  it('shows the avatar and name its lookup gives', () => {
    const html = render(spec({ users }), 'u1')
    expect(html).toContain('SM')
    expect(html).toContain('Sanne M.')
  })

  it('shows an id its lookup does not know as text, without an avatar', () => {
    const html = render(spec({ users }), 'u9')
    expect(html).toContain('u9')
    expect(html).not.toContain('SM')
  })

  it('shows the id as text without a lookup', () => {
    expect(render(spec(), 'u1')).toContain('u1')
  })
})
