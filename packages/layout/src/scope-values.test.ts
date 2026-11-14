import { describe, expect, it } from 'vitest'
import { Table } from './blocks'
import { fillProps, scopeValue, type ValueScope } from './scope-values'

const task = { id: 7, title: 'Ship it', status: 'open', a: { b: 'outer' } }
const claim = { id: 3, task_id: 7, status: 'claimed', a: { c: 'inner' } }
const scope: ValueScope = { stack: [{ record: task }, { record: claim, row: { index: 1, count: 2 } }], params: { window: '7d' } }

describe('scopeValue', () => {
  it('reads a bare name from the nearest record that has it, then outer ones', () => {
    expect(scopeValue(scope, 'status')).toBe('claimed')
    expect(scopeValue(scope, 'title')).toBe('Ship it')
    expect(scopeValue(scope, 'nope')).toBeUndefined()
  })

  it('reads the rest of a dotted name only from where its first name is (Dotted Names - Context Precedence)', () => {
    expect(scopeValue(scope, 'a.c')).toBe('inner')
    expect(scopeValue(scope, 'a.b')).toBeUndefined()
  })

  it('reads ../, this, @index, @first, @last and @params', () => {
    expect(scopeValue(scope, '../id')).toBe(7)
    expect(scopeValue(scope, 'this.id')).toBe(3)
    expect(scopeValue(scope, './title')).toBeUndefined()
    expect([scopeValue(scope, '@index'), scopeValue(scope, '@first'), scopeValue(scope, '@last')]).toEqual([1, false, true])
    expect(scopeValue(scope, '@params.window')).toBe('7d')
    expect(scopeValue({ ...scope, root: { id: 1 } }, '@root.id')).toBe(1)
    expect(scopeValue(scope, '../../id')).toBeUndefined()
  })
})

describe('fillProps', () => {
  it('fills text props and filters, escaping a quoted value so any text stays one value', () => {
    const tricky: ValueScope = { stack: [{ record: { id: 3, title: `it's a "q" \\ b` } }] }
    const node = fillProps(Table({ resource: 'claims', title: 'Claims of {{title}}', filter: `task_id = {{id}} AND title = '{{title}}' AND note = "{{title}}"` }), tricky)
    expect(node.props.title).toBe(`Claims of it's a "q" \\ b`)
    expect(node.props.filter).toBe(`task_id = 3 AND title = 'it\\'s a "q" \\\\ b' AND note = "it's a \\"q\\" \\\\ b"`)
  })

  it('leaves an element without placeholders as it is, and a missing value empty', () => {
    const plain = Table({ resource: 'claims', title: 'Claims' })
    expect(fillProps(plain, scope)).toBe(plain)
    expect(fillProps(Table({ resource: 'claims', title: '[{{nope}}]' }), scope).props.title).toBe('[]')
  })
})
