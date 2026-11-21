import { describe, expect, it } from 'vitest'
import { chatLines } from './message-lines'

describe('chatLines', () => {
  it('starts a block of its own for a line under a quote or a list item', () => {
    expect(chatLines('> it was the fan\nAgreed, replacing it.')).toBe('> it was the fan\n\nAgreed, replacing it.')
    expect(chatLines('- run it\n- check\nThanks!')).toBe('- run it\n- check\n\nThanks!')
  })

  it('keeps quote lines, list items and indented continuations together', () => {
    expect(chatLines('> one\n> two\n- a\n  more of a\n1. b')).toBe('> one\n> two\n- a\n  more of a\n1. b')
  })

  it('keeps `>` without a space, and a rule line under text, as typed', () => {
    expect(chatLines('>5 failed logins')).toBe('\\>5 failed logins')
    expect(chatLines('done\n---\n___')).toBe('done\n\\---\n\\___')
    expect(chatLines('- item\n  ---\n  more')).toBe('- item\n  \\---\n  more')
  })

  it('leaves code fences alone', () => {
    const fenced = '```\n> not a quote\n- x\ny\n>5\n---\n```\n- a\nb'
    expect(chatLines(fenced)).toBe('```\n> not a quote\n- x\ny\n>5\n---\n```\n- a\n\nb')
  })

  it('opens a fence only where markdown does, and closes it on a bare marker line', () => {
    expect(chatLines('```inline```\n> quote\nreply')).toBe('```inline```\n> quote\n\nreply')
    expect(chatLines('```\n```js\n>5\n```\n>5')).toBe('```\n```js\n>5\n```\n\\>5')
    expect(chatLines('~~~\n>5\n~~~~  \n>5')).toBe('~~~\n>5\n~~~~  \n\\>5')
  })
})
