import { describe, expect, it } from 'vitest'
import { reportLine } from './report.mjs'

const story = { id: 'shell-sidebar--on-a-phone', title: 'Shell/Sidebar', name: 'On A Phone' }

describe('reportLine', () => {
  it('names a story that passed and how long it took', () => {
    expect(reportLine(story, undefined, 1234)).toBe('PASS Shell/Sidebar / On A Phone (1.2 s)')
  })

  it('names a story that failed by its id, with its error', () => {
    const error = { name: 'storyTimedOut', message: 'did not finish within 60 s while opening the page' }
    expect(reportLine(story, error, 60_000)).toBe('FAIL Shell/Sidebar / On A Phone (shell-sidebar--on-a-phone, 60.0 s)\n  storyTimedOut: did not finish within 60 s while opening the page')
  })
})
