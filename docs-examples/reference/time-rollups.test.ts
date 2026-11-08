import { describe, expect, it } from 'vitest'
import { readingsHourly } from './time-rollups'

describe('the time rollups example', () => {
  it('declares an hourly rollup per organization and meter', () => {
    const model = readingsHourly.toModel()
    expect(Object.keys(model.fields)).toEqual(['id', 'bucket', 'organization_id', 'meter_id', 'events', 'watts_sum', 'watts_max', 'cost_sum'])
    expect(model.tenant).toBe('organization_id')
  })
})
