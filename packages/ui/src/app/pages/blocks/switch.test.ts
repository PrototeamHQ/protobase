import { describe, expect, it } from 'vitest'
import { Match } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { matchConditions } from './switch'

const frame = { model: { name: 'tasks', fields: {} } as unknown as ResourceModel, record: { status: "it's open" }, key: '1' }

describe('matchConditions', () => {
  it("fills each Match's {{path}}s from the records around the Switch, escaped", () => {
    expect(matchConditions([Match({ when: "state = '{{status}}'", children: 'x' }), ' ', Match({ when: 'done = true', children: 'y' })], [frame])).toEqual([
      "state = 'it\\'s open'",
      'done = true',
    ])
  })
})
