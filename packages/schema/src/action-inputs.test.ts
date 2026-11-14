import { describe, expect, it } from 'vitest'
import { shownInputs } from './action-inputs'
import { actions } from './view-actions'

const starts = [
  { value: 'erp', label: 'ERP' },
  { value: 'github', label: 'A GitHub repository' },
]

describe('action inputs', () => {
  it('builds each kind of input, required unless optional, a boolean never', () => {
    const action = actions.action('createApp', {
      label: 'New app',
      inputs: (i) => [
        i.text('name', { label: 'Name', max: 100 }),
        i.text('notes', { label: 'Notes', multiline: true, optional: true, help: 'Only for you.' }),
        i.integer('seats', { label: 'Seats', default: 3 }),
        i.decimal('budget', { label: 'Budget', optional: true }),
        i.boolean('private', { label: 'Private', default: true }),
        i.date('starts_on', { label: 'Starts on' }),
        i.choice('start', { label: 'Start from', options: starts, default: 'erp' }),
        i.choice('plan', { label: 'Plan', resource: 'plans' }),
        i.custom('repository', { label: 'Repository', component: 'RepositoryInput', props: { org: 'acme' }, when: "start = 'github'" }),
      ],
    })
    expect(action.inputs).toEqual([
      { name: 'name', kind: 'text', label: 'Name', required: true, max: 100 },
      { name: 'notes', kind: 'text', label: 'Notes', required: false, help: 'Only for you.', multiline: true },
      { name: 'seats', kind: 'integer', label: 'Seats', required: true, default: 3 },
      { name: 'budget', kind: 'decimal', label: 'Budget', required: false },
      { name: 'private', kind: 'boolean', label: 'Private', required: false, default: true },
      { name: 'starts_on', kind: 'date', label: 'Starts on', required: true },
      { name: 'start', kind: 'choice', label: 'Start from', required: true, default: 'erp', options: starts },
      { name: 'plan', kind: 'choice', label: 'Plan', required: true, resource: 'plans' },
      { name: 'repository', kind: 'custom', label: 'Repository', required: true, when: "start = 'github'", component: 'RepositoryInput', props: { org: 'acme' } },
    ])
  })

  it('leaves inputs out of an action without them', () => {
    expect(actions.action('x', { label: 'X' })).toEqual({ name: 'x', label: 'X', bulk: false })
  })

  it('refuses a name given twice, a default that is no option and a when over no input before it', () => {
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.text('x', { label: 'X' }), i.text('x', { label: 'Y' })] })).toThrow('Action "a": input "x" is declared twice')
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.choice('x', { label: 'X', options: starts, default: 'nope' })] })).toThrow('default "nope" is not one of its options')
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.text('x', { label: 'X', when: "y = 'a'" }), i.text('y', { label: 'Y' })] })).toThrow('input "x": "when" is not a valid condition')
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.choice('x', { label: 'X', options: starts }), i.text('y', { label: 'Y', when: "x = 'svn'" })] })).toThrow('input "y"')
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.text('x', { label: 'X', when: 'x = (' })] })).toThrow('input "x"')
  })

  it('builds a secret with no default, which no when reads and no update writes', () => {
    const built = actions.action('connect', { label: 'Connect', inputs: (i) => [i.secret('api_key', { label: 'API key', help: 'From the settings page.' })] })
    expect(built.inputs).toEqual([{ name: 'api_key', kind: 'secret', label: 'API key', required: true, help: 'From the settings page.' }])
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.secret('key', { label: 'Key' }), i.text('y', { label: 'Y', when: "key = 'x'" })] })).toThrow('input "y": "when" is not a valid condition')
    expect(() => actions.update('a', { label: 'A', inputs: (i) => [i.secret('key', { label: 'Key' })], set: { token: '{{key}}' } })).toThrow('set "token" names secret input "key", which an update never writes')
  })

  it('builds a checklist of fixed boxes or of a field of the record, and refuses one with neither, both or no boxes', () => {
    const { inputs } = actions.update('sign_off', {
      label: 'Sign off',
      inputs: (i) => [i.checklist('checked', { label: 'Checked', items: ['Tests pass', 'Docs read'] }), i.checklist('own', { label: 'Own', from: 'checklist' })],
      set: { checked: '{{checked}}' },
    })
    expect(inputs).toEqual([
      { name: 'checked', kind: 'checklist', label: 'Checked', required: true, items: ['Tests pass', 'Docs read'] },
      { name: 'own', kind: 'checklist', label: 'Own', required: true, from: 'checklist' },
    ])
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.checklist('x', { label: 'X', items: [] })] })).toThrow('input "x": a checklist needs at least one item')
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [{ ...i.checklist('x', { label: 'X', items: ['A'] }), from: 'list' }] })).toThrow('a checklist takes either "items" or "from"')
    expect(() => actions.action('a', { label: 'A', inputs: (i) => [i.checklist('x', { label: 'X', items: ['A'], from: 'list' })] })).toThrow('a checklist takes either "items" or "from"')
  })

  it('shows an input while its when holds, reading an input that does not show as empty', () => {
    const { inputs } = actions.action('createApp', {
      label: 'New app',
      inputs: (i) => [
        i.choice('start', { label: 'Start from', options: starts }),
        i.choice('code', { label: 'Code', options: [{ value: 'github', label: 'GitHub' }, { value: 'here', label: 'Here' }], when: "start = 'erp'" }),
        i.text('repository', { label: 'Repository', when: "start = 'github' OR code = 'github'" }),
      ],
    })
    expect([...shownInputs(inputs!, { start: null })]).toEqual(['start'])
    expect([...shownInputs(inputs!, { start: 'erp', code: 'here' })]).toEqual(['start', 'code'])
    expect([...shownInputs(inputs!, { start: 'erp', code: 'github' })]).toEqual(['start', 'code', 'repository'])
    expect([...shownInputs(inputs!, { start: 'github', code: 'github' })]).toEqual(['start', 'repository'])
  })

  it('compares numbers and booleans as such', () => {
    const { inputs } = actions.action('a', {
      label: 'A',
      inputs: (i) => [i.integer('seats', { label: 'Seats' }), i.boolean('invoice', { label: 'Invoice' }), i.text('vat', { label: 'VAT', when: 'seats > 10 AND invoice = true' })],
    })
    expect(shownInputs(inputs!, { seats: 11, invoice: true }).has('vat')).toBe(true)
    expect(shownInputs(inputs!, { seats: 9, invoice: true }).has('vat')).toBe(false)
    expect(shownInputs(inputs!, { seats: 11, invoice: false }).has('vat')).toBe(false)
  })
})
