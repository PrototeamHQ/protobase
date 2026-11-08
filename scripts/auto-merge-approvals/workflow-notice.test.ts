import { describe, expect, it } from 'vitest'
import { noticed, workflowNotice } from './workflow-notice'

describe('noticed', () => {
  it('finds the notice among the comments, and only it', () => {
    expect(noticed([{ body: 'Looks good' }, { body: workflowNotice }])).toBe(true)
    expect(noticed([{ body: 'This pull request changes a workflow' }])).toBe(false)
  })
})
