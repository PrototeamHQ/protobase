import { createElement } from 'react'
import { Hash } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NavRecord } from './nav'
import { SidebarGroup } from './sidebar-group'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })

const render = (records: NavRecord[]) =>
  renderToStaticMarkup(createElement(SidebarGroup, { item: { id: 'channels', label: 'Channels', icon: Hash }, recent: { state: 'ready', records }, mode: 'text-large', active: false }))

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
})
