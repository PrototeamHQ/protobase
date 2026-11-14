import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Details, Summary } from '../details'
import { Text } from '../elements'
import { BooleanField, ChipField, DateField, NumberField, TextField, UrlField } from '../inline-fields'
import { renderText } from './render-text'

const record = { title: 'Fix the brakes', hours: 1200.5, due_at: '2026-11-14T09:00:00Z', done: false, flagged: null, website: 'https://example.com/a b', script: 'javascript:alert(1)', state: 'in_progress', note: '' }
const options = { record, locale: 'en-US', fields: { state: { valueLabels: { in_progress: 'In progress' } } } }

describe('field components as text', () => {
  beforeEach(() => vi.useFakeTimers({ now: Date.parse('2026-11-14T12:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  it('runs on in a line of text with the formatted value', () => {
    const line = Text({ children: ['Due ', DateField({ source: 'due_at', format: 'relative' }), ', ', NumberField({ source: 'hours', options: { style: 'currency', currency: 'EUR' } }), ' so far'] })
    expect(renderText(line, options)).toBe('Due 3 hours ago, €1,200.50 so far')
  })

  it('shows emptyText for an empty value, and nothing without it', () => {
    expect(renderText(TextField({ source: 'note', emptyText: 'No note' }), options)).toBe('No note')
    expect(renderText(TextField({ source: 'note' }), options)).toBe('')
    expect(renderText(BooleanField({ source: 'flagged', emptyText: 'Unknown' }), options)).toBe('Unknown')
  })

  it('words a boolean, and shows an enum by its label', () => {
    expect(renderText(BooleanField({ source: 'done' }), options)).toBe('No')
    expect(renderText(ChipField({ source: 'state' }), options)).toBe('In progress')
  })

  it('links a safe address and shows any other as text', () => {
    expect(renderText(UrlField({ source: 'website', content: 'Site' }), options)).toBe('[Site](https://example.com/a%20b)')
    expect(renderText(UrlField({ source: 'script' }), options)).toBe('javascript:alert(1)')
  })

  it('reads nothing where the text has no record', () => {
    expect(renderText(TextField({ source: 'title', emptyText: 'None' }))).toBe('')
  })

  it('reads a Details as its summary, then its body', () => {
    const details = Details({ children: [Summary({ children: ['Brakes: ', TextField({ source: 'title' })] }), Text({ children: 'Pads and cables.' })] })
    expect(renderText(details, options)).toBe('Brakes: Fix the brakes\n\nPads and cables.')
  })
})
