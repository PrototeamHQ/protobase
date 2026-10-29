import { createElement } from 'react'
import { Hash } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NavRecord, ShownMark } from './nav'
import { SidebarGroup } from './sidebar-group'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })

const render = (records: NavRecord[], marks?: Record<string, ShownMark>) =>
  renderToStaticMarkup(createElement(SidebarGroup, { item: { id: 'channels', label: 'Channels', icon: Hash }, recent: { state: 'ready', records, ...(marks && { useMarks: () => marks }) }, mode: 'text-large', active: false }))

// The markup of one record's row, from its link to the end of it.
const rowOf = (html: string, id: string) => html.match(new RegExp(`<a href="/channels/${id}"[^]*?</a>`))![0]

describe('SidebarGroup', () => {
  it('draws a record without a status as its title alone, with no dot', () => {
    const html = render([{ id: 'general', label: 'general', href: '/channels/general', active: false }])
    expect(html).toContain('aria-label="general"')
    expect(html).toContain('title="general"')
    expect(html).not.toContain('data-tone')
  })

  it('draws a record with a status with its dot, named in its label', () => {
    const html = render([{ id: 'o1', label: 'SO-1042', href: '/orders/o1', status: { label: 'picking', tone: 'warning', pulse: true }, active: false }])
    expect(html).toContain('aria-label="SO-1042, picking"')
    expect(html).toContain('data-tone="warning"')
    expect(html).toContain('data-pulse="true"')
  })

  it('draws a record marked strong in bold, in the foreground colour, with its count at the end and its label in its name', () => {
    const html = render(
      [
        { id: 'general', label: 'general', href: '/channels/general', active: false },
        { id: 'random', label: 'random', href: '/channels/random', active: false },
      ],
      { general: { strong: true, count: 3, label: '3 mentions' } },
    )
    const general = rowOf(html, 'general')
    expect(general).toContain('aria-label="general, 3 mentions"')
    expect(general).toContain('title="general (3 mentions)"')
    expect(general).toContain('font-bold')
    expect(general).toContain('text-foreground')
    expect(general).not.toContain('text-muted-foreground')
    expect(general).toMatch(/<span class="[^"]*bg-danger-soft[^"]*">3<\/span>/)
    const random = rowOf(html, 'random')
    expect(random).toContain('font-medium')
    expect(random).toContain('text-muted-foreground')
    expect(random).not.toContain('bg-danger-soft')
    // The order of the records stays as the group's
    expect(html.indexOf('/channels/general')).toBeLessThan(html.indexOf('/channels/random'))
  })

  it('shows a count above 99 as 99+, and none at 0', () => {
    const records = [{ id: 'general', label: 'general', href: '/channels/general', active: false }]
    expect(rowOf(render(records, { general: { count: 120 } }), 'general')).toContain('>99+</span>')
    expect(rowOf(render(records, { general: { strong: true, count: 0 } }), 'general')).not.toContain('bg-danger-soft')
  })
})
