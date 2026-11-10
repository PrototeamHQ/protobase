import { describe, expect, it } from 'vitest'
import { cleanFollowUpAt, type IssueComment } from './follow-up'

const head = 'a'.repeat(40)
const older = 'b'.repeat(40)
const at = '2026-11-06T11:00:00Z'
const body = (sha: string, verdict: string) => `<!-- coderabbit-follow-up -->\n<!-- checked ${sha} ${verdict} -->\n**Follow-up** ...\n\nNo issues found.`
const comment = (over: Partial<IssueComment> = {}): IssueComment => ({ user: { login: 'github-actions[bot]' }, body: body(head, 'clean'), updated_at: at, ...over })

describe('cleanFollowUpAt', () => {
  it('reads when the check found the head clean', () => {
    expect(cleanFollowUpAt([comment()], head)).toBe(Date.parse(at))
  })

  it.each(['findings', 'skipped'])('reads no clean verdict from %s', (verdict) => {
    expect(cleanFollowUpAt([comment({ body: body(head, verdict) })], head)).toBeNull()
  })

  it('reads no clean verdict of an older head', () => {
    expect(cleanFollowUpAt([comment({ body: body(older, 'clean') })], head)).toBeNull()
  })

  it('ignores a clean comment from any other account, or a deleted one', () => {
    expect(cleanFollowUpAt([comment({ user: { login: 'author' } })], head)).toBeNull()
    expect(cleanFollowUpAt([comment({ user: null })], head)).toBeNull()
  })

  it('reads only the first comment of the check, as the check updates that one', () => {
    expect(cleanFollowUpAt([comment({ body: body(head, 'findings') }), comment()], head)).toBeNull()
  })

  it('ignores a verdict line anywhere but under the marker', () => {
    const quoted = `<!-- coderabbit-follow-up -->\n<!-- checked ${older} findings -->\n<!-- checked ${head} clean -->`
    expect(cleanFollowUpAt([comment({ body: quoted })], head)).toBeNull()
    expect(cleanFollowUpAt([comment({ body: `Quote:\n${body(head, 'clean')}` })], head)).toBeNull()
  })
})
