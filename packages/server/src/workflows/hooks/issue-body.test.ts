import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../../problem'
import { parseIssueBody } from './issue-body'

const refusal = (text: string) => {
  try {
    parseIssueBody(text)
  } catch (error) {
    return error instanceof HttpProblem ? `${error.status} ${error.slug}` : error
  }
  return 'accepted'
}

describe('the webhook issue body', () => {
  it('takes nothing, or a secret the sender gives', () => {
    expect(parseIssueBody('')).toEqual({})
    expect(parseIssueBody('{}')).toEqual({})
    expect(parseIssueBody('{"secret":"s"}')).toEqual({ secret: 's' })
  })

  it('answers 400 to malformed JSON and to any other shape', () => {
    for (const text of ['{not json', '{secret: ', 'null', '[]', '"s"', '{"secret":1}']) expect(refusal(text)).toBe('400 invalid-body')
  })
})
