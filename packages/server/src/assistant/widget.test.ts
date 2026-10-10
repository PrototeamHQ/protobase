import { describe, expect, it } from 'vitest'
import { maxWidgetPropsBytes, widget } from './widget'

describe('widget', () => {
  it('makes a widget part with the name, the props and the fallback', () => {
    const part = widget('TaskProposal', { taskId: 12 }, { fallback: { title: 'Task proposal: Ship it' } })
    expect(part).toMatchObject({ type: 'widget', name: 'TaskProposal', props: { taskId: 12 }, fallback: { title: 'Task proposal: Ship it' } })
    expect(part.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps an id given, and makes a new one otherwise', () => {
    expect(widget('TaskProposal', {}, { id: 'task-12' }).id).toBe('task-12')
    expect(widget('TaskProposal', {}).id).not.toBe(widget('TaskProposal', {}).id)
    expect(widget('TaskProposal', {})).not.toHaveProperty('fallback')
  })

  it('refuses a name that is not PascalCase', () => {
    for (const name of ['taskProposal', 'task_proposal', 'Task-Proposal', '']) expect(() => widget(name, {})).toThrow(/must be PascalCase/)
  })

  it('refuses props that are not a JSON object', () => {
    for (const props of [[], null, new Date(), { at: new Date() }, { run: () => 1 }, { missing: undefined }, { count: Number.NaN }]) {
      expect(() => widget('TaskProposal', props as Record<string, unknown>)).toThrow('The props of widget TaskProposal must be a JSON object')
    }
    expect(widget('TaskProposal', { ids: [1, 2], filter: { status: 'open', done: false, by: null } }).props).toEqual({ ids: [1, 2], filter: { status: 'open', done: false, by: null } })
  })

  it('refuses props over 2 KB of JSON, counting UTF-8 bytes', () => {
    // {"text":"..."} is 11 bytes around the text.
    expect(() => widget('Note', { text: 'a'.repeat(maxWidgetPropsBytes - 11) })).not.toThrow()
    expect(() => widget('Note', { text: 'a'.repeat(maxWidgetPropsBytes - 10) })).toThrow(/take 2049 bytes, more than 2048/)
    expect(() => widget('Note', { text: 'é'.repeat(1020) })).toThrow(/take 2051 bytes/)
  })
})
