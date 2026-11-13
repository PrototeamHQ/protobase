import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessageStatus } from './message-status'
import { ToolCallItem } from './tool-call-item'

describe('a tool call in a thread', () => {
  it('shows its name and status over a toggle that starts closed', () => {
    const html = renderToStaticMarkup(<ToolCallItem call={{ kind: 'call', key: 'call:1', name: 'list_tasks', time: undefined, status: 'done', state: 'done', input: { state: 'open' } }} statusHints={{ valueLabels: { done: 'Done' } }} />)
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/)
    expect(html).toContain('list_tasks')
    expect(html).toContain('Done')
    expect(html).not.toContain('&quot;state&quot;')
  })

  it('shows no toggle for a call with nothing to open', () => {
    const html = renderToStaticMarkup(<ToolCallItem call={{ kind: 'call', key: 'call:1', name: 'list_tasks', time: undefined, status: 'running', state: 'running' }} statusHints={undefined} />)
    expect(html).not.toContain('<button')
    expect(html).toContain('list_tasks')
  })
})

describe('a status mark', () => {
  it('draws a check when done, a spinner while running and an error as a problem', () => {
    expect(renderToStaticMarkup(<MessageStatus value="done" hints={undefined} mark="done" />)).toContain('lucide-check')
    expect(renderToStaticMarkup(<MessageStatus value="running" hints={undefined} mark="running" />)).toContain('animate-spin')
    expect(renderToStaticMarkup(<MessageStatus value="error" hints={undefined} mark="error" />)).toContain('text-danger-text')
    expect(renderToStaticMarkup(<MessageStatus value="cancelled" hints={undefined} />)).toBe('cancelled')
  })
})
