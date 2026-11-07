import { describe, expect, it, vi } from 'vitest'
import { statusReason } from './status-reason'

vi.mock('../../../format/date', () => ({ formatDateTime: (ms: number) => new Date(ms).toISOString().slice(0, 16) }))

const at = '2026-11-07T14:32:00Z'

describe('statusReason', () => {
  it('says a failed latest run with when it ended, naming that run, and offers to mark it resolved', () => {
    expect(statusReason({ run_status: 'failing', status_run_id: 'r1', status_run_at: at, unresolved_failures: 2 }))
      .toEqual({ status: 'failing', tone: 'danger', words: 'Last run failed, 2026-11-07T14:32', run: 'r1', resolvable: true })
  })

  it('counts the unresolved failures among the last 10 runs, naming the latest of them', () => {
    expect(statusReason({ run_status: 'unresolved', status_run_id: 'r2', status_run_at: at, unresolved_failures: 1 }))
      .toEqual({ status: 'unresolved', tone: 'warning', words: '1 unresolved failure in the last 10 runs, latest 2026-11-07T14:32', run: 'r2', resolvable: true })
    expect(statusReason({ run_status: 'unresolved', status_run_id: 'r2', status_run_at: at, unresolved_failures: 3 })?.words).toBe('3 unresolved failures in the last 10 runs, latest 2026-11-07T14:32')
  })

  it('says green with its latest run, and nothing to resolve', () => {
    expect(statusReason({ run_status: 'healthy', status_run_id: 'r3', status_run_at: at, unresolved_failures: 0 }))
      .toEqual({ status: 'healthy', tone: 'success', words: 'No unresolved failures in the last 10 runs, last run 2026-11-07T14:32', run: 'r3', resolvable: false })
  })

  it('says each gray status in words of its own, naming no run', () => {
    const gray = (status: string) => statusReason({ run_status: status, status_run_id: null, status_run_at: null, unresolved_failures: 0 })
    expect([gray('no_runs'), gray('resolved'), gray('new_version')]).toEqual([
      { status: 'no_runs', tone: 'neutral', words: 'No runs yet', resolvable: false },
      { status: 'resolved', tone: 'neutral', words: 'No runs since resolved', resolvable: false },
      { status: 'new_version', tone: 'neutral', words: 'No runs since this version', resolvable: false },
    ])
  })

  it('has nothing to say of a record without a status, as for a caller who cannot read its runs', () => {
    expect(statusReason({ name: 'Nightly' })).toBeUndefined()
  })
})
