import { describe, expect, it } from 'vitest'
import { offeredBulkActions, oneBulkRunAtATime, runBulkAction, type BulkAction } from './bulk-actions'

const rows = [
  { id: '1', status: 'running' },
  { id: '2', status: 'stopped' },
  { id: '3', status: 'running' },
]

describe('offeredBulkActions', () => {
  it('runs an action on every selected row, or on those it applies to, counting the others as skipped', () => {
    const exportRows: BulkAction = { label: (n) => `Export ${n}`, onRun: () => undefined }
    const reboot: BulkAction = { label: (n) => `Reboot ${n}`, available: (row) => row.status === 'running', onRun: () => undefined }
    expect(offeredBulkActions([exportRows, reboot], rows)).toEqual([
      { action: exportRows, rows, skipped: 0 },
      { action: reboot, rows: [rows[0], rows[2]], skipped: 1 },
    ])
  })

  it('leaves out an action no selected row applies to', () => {
    const start: BulkAction = { label: (n) => `Start ${n}`, available: (row) => row.status === 'stopped', onRun: () => undefined }
    expect(offeredBulkActions([start], [rows[0]!])).toEqual([])
  })
})

describe('runBulkAction', () => {
  it('is done with every row of an action that runs at once', async () => {
    const exportRows: BulkAction = { label: (n) => `Export ${n}`, onRun: () => undefined }
    expect(await runBulkAction(exportRows, rows, 0)).toEqual(rows)
  })

  it('is done with none of the rows when the action is cancelled, leaving them all open', async () => {
    const approve: BulkAction = { label: (n) => `Approve ${n}`, onRun: async (given) => given }
    expect(await runBulkAction(approve, rows, 0)).toEqual([])
  })

  it('is done with the rows the run did not leave open, such as refused ones', async () => {
    const approve: BulkAction = { label: (n) => `Approve ${n}`, onRun: async () => [{ id: '3', status: 'running' }] }
    expect(await runBulkAction(approve, rows, 0)).toEqual([rows[0], rows[1]])
  })
})

describe('oneBulkRunAtATime', () => {
  it('starts no second run while one is in flight, and runs again once it ends', async () => {
    let finish = (_open: typeof rows) => {}
    let runs = 0
    const approve: BulkAction = { label: (n) => `Approve ${n}`, onRun: () => { runs += 1; return new Promise((resolve) => (finish = resolve)) } }
    const run = oneBulkRunAtATime()
    const first = run(approve, rows, 0)
    expect(await run(approve, rows, 0)).toBeUndefined()
    finish([])
    expect(await first).toEqual(rows)
    const second = run(approve, rows, 0)
    finish(rows)
    expect(await second).toEqual([])
    expect(runs).toBe(2)
  })

  it('runs again after a run that failed, even before it returned', async () => {
    const broken: BulkAction = { label: (n) => `Approve ${n}`, onRun: () => { throw new Error('broken') } }
    const run = oneBulkRunAtATime()
    await expect(run(broken, rows, 0)).rejects.toThrow('broken')
    const exportRows: BulkAction = { label: (n) => `Export ${n}`, onRun: () => undefined }
    expect(await run(exportRows, rows, 0)).toEqual(rows)
  })
})
