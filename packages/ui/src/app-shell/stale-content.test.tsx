import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from './app-shell'

const shell = (staleContent?: 'refreshing' | 'failed') =>
  renderToStaticMarkup(
    <AppShell sidebarMode="text-small" activeItem="today" breadcrumb={['Today']} titleStatus={<span id="mark" />} {...(staleContent && { staleContent })}>
      <p>Real content</p>
    </AppShell>,
  )

const mainOf = (html: string) => html.match(/<main[^>]*>/)?.[0] ?? ''

describe('a page showing data that may be out of date', () => {
  it('shows its real content muted and pulsing while it refreshes', () => {
    const html = shell('refreshing')
    expect(mainOf(html)).toContain('pb-stale')
    expect(mainOf(html)).toContain('aria-busy="true"')
    expect(html).toContain('Real content')
  })

  it('stays muted once refreshing failed', () => {
    expect(mainOf(shell('failed'))).toContain('opacity-60')
    expect(mainOf(shell('failed'))).not.toContain('pb-stale')
  })

  it('looks as usual once fresh, in the same elements', () => {
    expect(mainOf(shell())).not.toMatch(/pb-stale|opacity-60|aria-busy/)
    expect(shell().replace(mainOf(shell()), '')).toBe(shell('refreshing').replace(mainOf(shell('refreshing')), ''))
  })

  it('puts the mark beside the page title', () => {
    expect(shell('refreshing')).toMatch(/>Today<\/span><\/span><\/nav><span class="[^"]*"><span id="mark">/)
  })
})
