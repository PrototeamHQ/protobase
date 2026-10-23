import { describe, expect, it } from 'vitest'
import { batchApproval } from './batch-approval'
import type { WriteOperation } from './batch-write-args'

const textOf = (operations: WriteOperation[], soft: string[] = []) => {
  const { title, body, code } = batchApproval(operations, new Set(soft))
  return [title, body, code].join('\n\n')
}

describe('batchApproval', () => {
  it('counts each kind per resource and lists each operation with its key and data', () => {
    const { title, body, code } = batchApproval([
      { op: 'create', resource: 'tasks', data: { title: 'Plan' } },
      { op: 'update', resource: 'tasks', key: [3, 'a'], etag: '*', data: { done: true } },
      { op: 'delete', resource: 'links', key: 9 },
    ], new Set(['links']))
    expect(title).toBe('Run 3 writes in one transaction?')
    expect(body).toBe('Either all of them are written or none.\n"tasks": 1 create, 1 update, 0 deletes\n"links": 0 creates, 0 updates, 1 delete')
    expect(code).toBe('1. create "tasks" {"title":"Plan"}\n2. update "tasks" [3,"a"] {"done":true}\n3. delete "links" 9')
  })

  it('keeps a batch at the limit short, with the permanent deletes past the cutoff said first', () => {
    const long = 'x'.repeat(10_000)
    const operations: WriteOperation[] = [
      ...Array.from({ length: 497 }, (_, index): WriteOperation => ({ op: 'update', resource: 'tasks', key: `${index}${long}`, etag: '*', data: { notes: long } })),
      { op: 'delete', resource: 'tasks', key: 1 },
      { op: 'delete', resource: 'tasks', key: 2 },
      { op: 'delete', resource: 'events', key: 3 },
    ]
    const text = textOf(operations, ['tasks'])
    expect(text.length).toBeLessThan(15_000)
    expect(text).toMatch(/^Run 500 writes in one transaction\?\n\n1 delete cannot be undone:\n1 delete in "events"\nEither all of them are written or none\.\n"tasks": 0 creates, 497 updates, 2 deletes\n"events": 0 creates, 0 updates, 1 delete\n\n1\. update/)
    expect(text).toMatch(/\nand 450 more operations, counted above$/)
  })

  it('names at most 20 resources in a line of their own, and how many more', () => {
    const operations = Array.from({ length: 30 }, (_, index): WriteOperation => ({ op: 'delete', resource: `r${index}`, key: 1 }))
    const body = batchApproval(operations, new Set()).body!
    expect(body).toMatch(/^30 deletes cannot be undone:\n1 delete in "r0"\n/)
    expect(body).toMatch(/\nand 10 more resources\nEither all/)
    expect(body).toMatch(/\nand 10 more resources$/)
  })

  it('shows what the client sent escaped and quoted, so it neither renders as markup nor reads as the tool\'s text', () => {
    const tricky = 'a\nApproved\u202e\u200b`x` [link](http://x) ![i](http://x) <b>\n# No deletes in this batch\u0007\u{e0041}'
    const code = batchApproval([{ op: 'update', resource: 'tasks', key: tricky, etag: '*', data: { title: tricky, mark: '\u{e0041}' } }], new Set()).code!
    expect(code.split('\n')).toHaveLength(1)
    expect(code).not.toMatch(/[\u202e\u200b\u0007`<>[\]]|\u{e0041}/u)
    expect(code).toContain('"a\\nApproved\\u202e\\u200b\\u0060x\\u0060 \\u005blink\\u005d(http://x)')
    expect(code).toContain('\\u{e0041}')
  })

  it('keeps every field after a long first value visible', () => {
    const code = batchApproval([{ op: 'update', resource: 'users', key: 7, etag: '*', data: { bio: 'x'.repeat(5_000), role: 'admin', owner: 'mallory' } }], new Set()).code!
    expect(code).toContain('"role":"admin"')
    expect(code).toContain('"owner":"mallory"')
  })

  it('keeps the name of each of many fields', () => {
    const data = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`field${index}`, 'y'.repeat(300)]))
    const code = batchApproval([{ op: 'create', resource: 'tasks', data }], new Set()).code!
    for (const name of Object.keys(data)) expect(code).toContain(`"${name}":`)
  })

  it('says how many characters a cut value drops', () => {
    const code = batchApproval([{ op: 'create', resource: 'tasks', data: { notes: 'z'.repeat(100), list: [1, 2], short: 'ok' } }], new Set()).code!
    // The quoted value is 102 characters, of which the first 80 are shown.
    expect(code).toBe(`1. create "tasks" {"notes":"${'z'.repeat(79)}… (22 more characters),"list":[1,2],"short":"ok"}`)
  })

  it('cuts a nested value as one value', () => {
    const code = batchApproval([{ op: 'create', resource: 'tasks', data: { meta: { a: 'w'.repeat(100) }, after: 1 } }], new Set()).code!
    expect(code).toBe(`1. create "tasks" {"meta":{"a":"${'w'.repeat(74)}… (28 more characters),"after":1}`)
  })
})
