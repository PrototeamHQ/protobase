import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActionCard, type ActionCardProps } from './action-card'

const props: ActionCardProps = {
  title: 'New task',
  badge: 'Draft',
  note: 'Nothing runs until you start it.',
  actions: [{ id: 'start', label: 'Start', style: 'primary', hint: 'Only an admin can start it.', confirm: 'The task runs now.' }],
  children: createElement('p', null, 'The fields'),
}
const render = (extra: Partial<ActionCardProps> = {}) => renderToStaticMarkup(createElement(ActionCard, { ...props, ...extra }))

describe('ActionCard', () => {
  it('draws a bordered card with a title row by default', () => {
    const html = render()
    expect(html).toMatch(/^<section aria-label="New task" class="[^"]*rounded-lg border /)
    expect(html).toContain('<h3 class="min-w-0 flex-1 text-[13px] font-semibold">New task</h3>')
    expect(html).toContain('Draft')
    expect(html).toContain('px-3 py-2.5')
  })

  it('draws the content, note, buttons and hint without the card or title row when frameless', () => {
    const html = render({ frameless: true })
    expect(html).toMatch(/^<section aria-label="New task" class="whitespace-normal text-foreground">/)
    expect(html).not.toContain('<header')
    expect(html).not.toContain('Draft')
    expect(html).toContain('<div class="space-y-2.5">')
    for (const text of ['The fields', 'Nothing runs until you start it.', '>Start</button>', 'Only an admin can start it.']) expect(html).toContain(text)
  })
})
