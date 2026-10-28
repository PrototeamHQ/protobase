import { createElement } from 'react'
import { Hash, MessageSquare } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NavGroup } from './nav'
import { Sidebar } from './sidebar'
import type { SidebarMode } from './sidebar-mode'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })

const create = { label: 'New message', href: '/direct_messages/new' }
const groups: NavGroup[] = [
  {
    label: '',
    items: [
      { id: 'channels', label: 'Channels', icon: Hash, href: '/channels' },
      { id: 'direct_messages', label: 'Direct messages', icon: MessageSquare, href: '/direct_messages', recent: { state: 'ready', records: [] }, create },
    ],
  },
]

const render = (mode: SidebarMode) => renderToStaticMarkup(createElement(Sidebar, { mode, activeItem: 'channels', groups }))

describe('Sidebar', () => {
  it('draws an entry\'s create link as a real link in text sidebars', () => {
    for (const mode of ['text-large', 'text-small'] as const) {
      expect(render(mode)).toMatch(/<a href="\/direct_messages\/new"[^>]*>.*New message<\/span><\/a>/)
    }
  })

  it('leaves the create link out of icon sidebars', () => {
    for (const mode of ['icon', 'icon-label', 'icon-tooltip', 'icon-expand'] as const) expect(render(mode)).not.toContain('/direct_messages/new')
  })
})
