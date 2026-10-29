import { describe, expect, it } from 'vitest'
import { memberEnd } from './close-codes'

describe('how a member socket ended', () => {
  it('is lost when the connection went away, so the browser may resume', () => {
    expect([1001, 1005, 1006, 1012, 4000].map(memberEnd)).toEqual(['lost', 'lost', 'lost', 'lost', 'lost'])
  })

  it('is left when the member left or the server refused or failed them', () => {
    expect([1000, 1008, 1009, 1011, 1013, 4401].map(memberEnd)).toEqual(['left', 'left', 'left', 'left', 'left', 'left'])
  })
})
