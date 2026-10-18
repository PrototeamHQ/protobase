import { describe, expect, it } from 'vitest'
import { maxCommentLength, parseCommentInput } from './comment-input'

const problem = (body: unknown) => {
  try {
    parseCommentInput(body, 'u1')
  } catch (error) {
    return error as { status: number; slug: string }
  }
  throw new Error('Expected a problem')
}

describe('a posted comment', () => {
  it('is trimmed, and mentions each user once, never its author', () => {
    expect(parseCommentInput({ body: '  Done, @Ann  \n' }, 'u1')).toEqual({ body: 'Done, @Ann', mentions: [] })
    expect(parseCommentInput({ body: 'Hi', mentions: ['u2', 'u1', 'u2', 'u3'] }, 'u1')).toEqual({ body: 'Hi', mentions: ['u2', 'u3'] })
  })

  it('is refused empty, too long, without a text body, or with too many or malformed mentions', () => {
    for (const body of [{ body: '  \n ' }, { body: 'x'.repeat(maxCommentLength + 1) }, {}, { body: 3 }, null, { body: 'Hi', mentions: 'u2' }, { body: 'Hi', mentions: [''] }, { body: 'Hi', mentions: Array.from({ length: 21 }, (_, i) => `u${i + 2}`) }]) {
      expect(problem(body)).toMatchObject({ status: 400, slug: 'invalid-comment' })
    }
    expect(parseCommentInput({ body: 'x'.repeat(maxCommentLength) }, 'u1').body).toHaveLength(maxCommentLength)
  })
})
