import { describe, expect, it } from 'vitest'
import { offeredBulkActions, type BulkAction } from './bulk-actions'

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
