import { describe, expect, it } from 'vitest'
import { fillPlaceholders, parseTemplatePath, recordValueAt, templatePlaceholders, wholePlaceholder } from './template-path'

describe('parseTemplatePath', () => {
  it('reads the Handlebars path forms', () => {
    expect(parseTemplatePath('title')).toEqual({ kind: 'context', up: 0, explicit: false, names: ['title'] })
    expect(parseTemplatePath('plan.name')).toEqual({ kind: 'context', up: 0, explicit: false, names: ['plan', 'name'] })
    expect(parseTemplatePath('../id')).toEqual({ kind: 'context', up: 1, explicit: true, names: ['id'] })
    expect(parseTemplatePath('../../id')).toEqual({ kind: 'context', up: 2, explicit: true, names: ['id'] })
    expect(parseTemplatePath('this')).toEqual({ kind: 'context', up: 0, explicit: true, names: [] })
    expect(parseTemplatePath('this.id')).toEqual({ kind: 'context', up: 0, explicit: true, names: ['id'] })
    expect(parseTemplatePath('./id')).toEqual({ kind: 'context', up: 0, explicit: true, names: ['id'] })
    expect(parseTemplatePath('@root.id')).toEqual({ kind: 'data', variable: 'root', names: ['id'] })
    expect(parseTemplatePath('@params.window')).toEqual({ kind: 'data', variable: 'params', names: ['window'] })
    expect(parseTemplatePath('@index')).toEqual({ kind: 'data', variable: 'index', names: [] })
  })

  it('refuses helpers, literals, @key and anything else that is no path', () => {
    for (const text of ['a b', '@key', '../@root', '"x"', '1', 'a.', '.a', '@index.x', '{x}', 'a..b', 'lookup a b', '']) expect(parseTemplatePath(text)).toBeUndefined()
  })
})

describe('placeholders', () => {
  it('finds each {{path}}, spaces inside the braces allowed, and fills them', () => {
    expect(templatePlaceholders('{{a}} and {{ ../b }} and {single}')).toEqual(['a', '../b'])
    expect(fillPlaceholders('{{a}}-{{ b }}', (path) => path.toUpperCase())).toBe('A-B')
    expect(wholePlaceholder('{{website}}')).toBe('website')
    expect(wholePlaceholder('https://{{website}}')).toBeUndefined()
    expect(wholePlaceholder('{{a b}}')).toBeUndefined()
  })
})

describe('recordValueAt', () => {
  it('reads the first name from the record and the rest from that value only', () => {
    const record = { id: 3, meta: { size: 'L' }, plan: 7 }
    expect(recordValueAt(record, 'id')).toBe(3)
    expect(recordValueAt(record, 'meta.size')).toBe('L')
    expect(recordValueAt(record, 'plan.name')).toBeUndefined()
    expect(recordValueAt(record, 'this')).toBe(record)
    expect(recordValueAt(record, '../id')).toBeUndefined()
    expect(recordValueAt(record, '@root.id')).toBeUndefined()
  })
})
