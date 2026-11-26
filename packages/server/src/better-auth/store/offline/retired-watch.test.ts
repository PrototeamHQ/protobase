import { describe, expect, it } from 'vitest'
import { ddlText } from '../ddl'
import { watchBaseStatements } from './retired-watch'

describe('the retired watch', () => {
  // `now()` is the transaction's start, so a write late in a long transaction would count in an hour before its own.
  it('counts a write in the hour of the write, not of its transaction', () => {
    const countFunction = ddlText(watchBaseStatements()[2]!)
    expect(countFunction).toContain("date_trunc('hour', clock_timestamp())")
    expect(countFunction).not.toMatch(/\bnow\(\)|current_timestamp|transaction_timestamp/)
  })
})
