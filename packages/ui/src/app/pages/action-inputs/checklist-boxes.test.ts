import { describe, expect, it } from 'vitest'
import type { ActionInputModel } from '@protobase/schema'
import { answersFor, checklistBoxes } from './checklist-boxes'

const fixed: ActionInputModel = { name: 'checked', kind: 'checklist', label: 'Checked', required: true, items: ['Tests pass', 'Docs read'] }
const own: ActionInputModel = { name: 'checked', kind: 'checklist', label: 'Checked', required: true, from: 'checklist' }
const note: ActionInputModel = { name: 'note', kind: 'text', label: 'Note', required: false }

describe('checklistBoxes', () => {
  it('shows fixed items whatever the records hold', () => {
    expect(checklistBoxes(fixed, [{ checklist: ['Other'] }])).toEqual(['Tests pass', 'Docs read'])
  })

  it("shows each box the records hold once, in order, and nothing for one that holds no list of texts", () => {
    const records = [{ checklist: ['Deploy checked', 'Key rotated'] }, { checklist: ['Key rotated', 'Billing on'] }, { checklist: null }, { checklist: 'Key rotated' }, { checklist: [1, 'Billing on'] }]
    expect(checklistBoxes(own, records)).toEqual(['Deploy checked', 'Key rotated', 'Billing on'])
  })
})

describe('answersFor', () => {
  it("gives each record its own boxes, and the other answers as they are", () => {
    const values = { checked: ['Deploy checked', 'Key rotated', 'Billing on'], note: 'Looked at it' }
    expect(answersFor([own, note], values, { checklist: ['Key rotated'] })).toEqual({ checked: ['Key rotated'], note: 'Looked at it' })
    expect(answersFor([own, note], values, { checklist: null })).toEqual({ checked: [], note: 'Looked at it' })
    expect(answersFor([fixed], { checked: ['Tests pass', 'Docs read'] }, { checklist: ['Other'] })).toEqual({ checked: ['Tests pass', 'Docs read'] })
  })

  it('leaves out a checklist that does not show', () => {
    expect(answersFor([own, note], { note: null }, { checklist: ['Key rotated'] })).toEqual({ note: null })
  })
})
