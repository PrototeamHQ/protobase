import { describe, expect, it } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { fieldHelp, helpShown, recordShown } from './record-mode'

const view = (helpWhen?: ViewModel['helpWhen']): ViewModel => ({ resource: 'listings', fields: {}, filters: [], layout: [], actions: [], ...(helpWhen && { helpWhen }) })

describe('recordShown', () => {
  it('shows an always editable record as its form, locked to a user who may not change it, whatever the address says', () => {
    expect(recordShown(undefined, true, false)).toEqual({ shown: 'form', offersEdit: false, editing: true })
    expect(recordShown('edit', true, true)).toEqual({ shown: 'form', offersEdit: false, editing: true })
    expect(recordShown('edit', false, true)).toEqual({ shown: 'locked', offersEdit: false, editing: false })
  })

  it('shows the read view or the locked form first, with Edit to the form for a user who may change the record', () => {
    expect(recordShown('read', true, false)).toEqual({ shown: 'read', offersEdit: true, editing: false })
    expect(recordShown('locked', true, false)).toEqual({ shown: 'locked', offersEdit: true, editing: false })
    expect(recordShown('read', true, true)).toEqual({ shown: 'form', offersEdit: false, editing: true })
    expect(recordShown('locked', true, true)).toEqual({ shown: 'form', offersEdit: false, editing: true })
  })

  it('never opens the form for a user who may not change the record, even when the address asks for it', () => {
    expect(recordShown('read', false, true)).toEqual({ shown: 'read', offersEdit: false, editing: false })
    expect(recordShown('locked', false, true)).toEqual({ shown: 'locked', offersEdit: false, editing: false })
  })
})

describe('helpShown', () => {
  it('shows help always by default, and help meant for editing only while editing', () => {
    expect(helpShown(undefined, undefined, false)).toBe(true)
    expect(helpShown('editing', view(), false)).toBe(false)
    expect(helpShown('editing', view(), true)).toBe(true)
  })

  it("takes the view's timing unless the help has its own", () => {
    expect(helpShown(undefined, view('editing'), false)).toBe(false)
    expect(helpShown('always', view('editing'), false)).toBe(true)
    expect(fieldHelp({ help: 'The asking price' }, view('editing'), false)).toBeUndefined()
    expect(fieldHelp({ help: 'The asking price' }, view('editing'), true)).toBe('The asking price')
    expect(fieldHelp({ label: 'Price' }, view(), true)).toBeUndefined()
  })
})
