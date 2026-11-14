import { describe, expect, it } from 'vitest'
import type { ActionInputModel } from '@protobase/schema'
import { answeredValues, inputField, inputHints, refusedAnswers, startingAnswers } from './input-answers'

const plans = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
]

const inputs: ActionInputModel[] = [
  { name: 'name', kind: 'text', label: 'Name', required: true, max: 5 },
  { name: 'seats', kind: 'integer', label: 'Seats', required: false, default: 2 },
  { name: 'budget', kind: 'decimal', label: 'Budget', required: false },
  { name: 'invoice', kind: 'boolean', label: 'Invoice', required: false },
  { name: 'starts_on', kind: 'date', label: 'Starts on', required: false },
  { name: 'plan', kind: 'choice', label: 'Plan', required: true, options: plans, default: 'free' },
  { name: 'owner', kind: 'choice', label: 'Owner', required: false, resource: 'users' },
  { name: 'vat', kind: 'text', label: 'VAT', required: true, when: "plan = 'pro'" },
  { name: 'repository', kind: 'custom', label: 'Repository', required: false, component: 'RepositoryInput' },
]

describe('action input answers', () => {
  it('edits each input as the field the create form edits: an enum for options, a relation for records', () => {
    expect(inputField(inputs[0]!)).toMatchObject({ name: 'name', type: 'text', nullable: true, readOnly: false })
    expect(inputField(inputs[5]!)).toMatchObject({ type: 'enum', enumValues: ['free', 'pro'] })
    expect(inputField(inputs[6]!)).toMatchObject({ type: 'relation', relation: { resource: 'users', columns: ['owner'] } })
    expect(inputHints(inputs[5]!)).toEqual({ label: 'Plan', valueLabels: { free: 'Free', pro: 'Pro' } })
    expect(inputHints({ ...inputs[0]!, multiline: true })).toEqual({ label: 'Name', multiline: true })
  })

  it('opens with the defaults, as the editors hold them', () => {
    expect(startingAnswers(inputs)).toEqual({ name: '', seats: '2', budget: '', invoice: false, starts_on: '', plan: 'free', owner: '', vat: '', repository: null })
  })

  it('gives the handler the answers of the inputs that show, typed, null when empty', () => {
    const draft = { ...startingAnswers(inputs), name: ' Ada ', owner: { key: '7', label: 'Ada' }, repository: { owner: 'acme', name: 'app' } }
    const { shown, values } = answeredValues(inputs, draft)
    expect(shown.has('vat')).toBe(false)
    expect(values).toEqual({ name: 'Ada', seats: 2, budget: null, invoice: false, starts_on: null, plan: 'free', owner: '7', repository: { owner: 'acme', name: 'app' } })
    expect(answeredValues(inputs, { ...draft, plan: 'pro', vat: 'NL1' }).values).toMatchObject({ plan: 'pro', vat: 'NL1' })
  })

  it('refuses an empty required answer, a number that is none, a malformed date and a text too long, among those that show', () => {
    const draft = { ...startingAnswers(inputs), name: 'Adaline', seats: '2.5', budget: 'twelve', starts_on: '17-10-2026' }
    expect(refusedAnswers(inputs, answeredValues(inputs, draft).values)).toEqual({ name: 'At most 5 characters', seats: 'A whole number', budget: 'A number', starts_on: 'A date as YYYY-MM-DD' })
    const pro = { ...startingAnswers(inputs), name: 'Ada', plan: 'pro', budget: '12.50', starts_on: '2026-10-17' }
    expect(refusedAnswers(inputs, answeredValues(inputs, pro).values)).toEqual({ vat: 'Required' })
    expect(refusedAnswers(inputs, answeredValues(inputs, { ...pro, plan: 'free' }).values)).toEqual({})
  })
  it('gives the handler a secret exactly as typed, refuses it empty, and never names it in a refusal', () => {
    const secret: ActionInputModel[] = [{ name: 'api_key', kind: 'secret', label: 'API key', required: true, max: 4 }]
    expect(inputField(secret[0]!)).toMatchObject({ type: 'text' })
    expect(answeredValues(secret, { api_key: ' sk-1 ' }).values).toEqual({ api_key: ' sk-1 ' })
    expect(refusedAnswers(secret, answeredValues(secret, { api_key: '' }).values)).toEqual({ api_key: 'Required' })
    expect(refusedAnswers(secret, answeredValues(secret, { api_key: 'sk-12345' }).values)).toEqual({ api_key: 'At most 4 characters' })
  })
  it('starts a checklist with nothing ticked, and refuses it until every box it shows is ticked', () => {
    const checklist: ActionInputModel[] = [{ name: 'checked', kind: 'checklist', label: 'Checked', required: true, from: 'checklist' }]
    const boxes = { checked: ['Deploy checked', 'Key rotated'] }
    const answers = (ticked: string[]) => answeredValues(checklist, { checked: ticked }).values
    expect(answeredValues(checklist, startingAnswers(checklist)).values).toEqual({ checked: [] })
    expect(refusedAnswers(checklist, answers(['Key rotated']), boxes)).toEqual({ checked: 'Tick the last box' })
    expect(refusedAnswers(checklist, answers([]), boxes)).toEqual({ checked: 'Tick the 2 remaining boxes' })
    expect(refusedAnswers(checklist, answers(['Key rotated', 'Deploy checked']), boxes)).toEqual({})
    // Records that hold no boxes leave nothing to tick
    expect(refusedAnswers(checklist, answers([]), { checked: [] })).toEqual({})
  })
})
