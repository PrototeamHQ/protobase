import { describe, expect, it } from 'vitest'
import { messageAccess, reactionAccess } from './message-access'

const all = { create: true, update: true, delete: true, conditional: [] }
const none = { create: false, update: false, delete: false, conditional: [] }
const row = { id: 1, reply_count: 0 }

describe('messageAccess', () => {
  it("offers edit only for the reader's own message, on a conversation that lets authors edit", () => {
    expect(messageAccess({ edit: true }, row, true, all).edit).toBe(true)
    expect(messageAccess({ edit: true }, row, false, all).edit).toBe(false)
    expect(messageAccess({}, row, true, all).edit).toBe(false)
  })

  it("offers delete on a conversation that lets anyone, unless its condition keeps the message", () => {
    expect(messageAccess({ delete: true }, row, false, all).delete).toBe(true)
    expect(messageAccess({}, row, true, all).delete).toBe(false)
    expect(messageAccess({ delete: { unless: 'reply_count > 0' } }, row, true, all).delete).toBe(true)
    expect(messageAccess({ delete: { unless: 'reply_count > 0' } }, { ...row, reply_count: 2 }, true, all).delete).toBe(false)
  })

  it("follows the resource's access and the row's own permissions", () => {
    expect(messageAccess({ edit: true, delete: true }, row, true, none)).toEqual({ edit: false, delete: false })
    expect(messageAccess({ edit: true, delete: true }, { ...row, permissions: { update: false, delete: false } }, true, all)).toEqual({ edit: false, delete: false })
    expect(messageAccess({ edit: true, delete: true }, row, true, { ...none, conditional: ['update', 'delete'] })).toEqual({ edit: true, delete: true })
  })
})

describe('reactionAccess', () => {
  it('lets the reader react when they may create one, and take back their own when they may delete one', () => {
    expect(reactionAccess(all)).toEqual({ react: true, unreact: true })
    expect(reactionAccess(none)).toEqual({ react: false, unreact: false })
    expect(reactionAccess({ ...none, create: true })).toEqual({ react: true, unreact: false })
  })
})
