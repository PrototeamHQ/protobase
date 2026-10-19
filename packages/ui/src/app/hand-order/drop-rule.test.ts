import { describe, expect, it } from 'vitest'
import { allowedDrop, type DropRule } from './drop-rule'

const records = ['schema', 'tests', 'docs', 'release'].map((name) => ({ name }))
// Each task may only come after the one it depends on
const dependsOn: Record<string, string> = { tests: 'schema', release: 'tests' }
const afterDependency: DropRule = ({ record, order, index }) => {
  const dependency = dependsOn[record.name as string]
  if (dependency === undefined) return undefined
  return order.slice(0, index).some((entry) => entry.name === dependency) ? undefined : `${String(record.name)} depends on ${dependency}`
}

describe('allowedDrop', () => {
  it('lands where it is dropped when the rule allows it', () => {
    expect(allowedDrop(records, 2, 0, afterDependency)).toEqual({ to: 0 })
    expect(allowedDrop(records, 0, 1, afterDependency)).toEqual({ to: 1 })
  })

  it('moves a refused drop to the first place below that the rule allows, saying why', () => {
    expect(allowedDrop(records, 1, 0, afterDependency)).toEqual({ to: 1, reason: 'tests depends on schema' })
    expect(allowedDrop(records, 3, 0, afterDependency)).toEqual({ to: 2, reason: 'release depends on tests' })
  })

  it('gives the rule the records in the order the drop leaves them', () => {
    const seen: unknown[] = []
    allowedDrop(records, 3, 1, (drop) => void seen.push(drop))
    expect(seen).toEqual([{ record: { name: 'release' }, order: [records[0], records[3], records[1], records[2]], index: 1 }])
  })

  it('leaves the record where it was when no place below is allowed', () => {
    const last: DropRule = ({ index, order }) => (index === order.length - 1 ? 'Too late' : undefined)
    const never: DropRule = () => 'Pinned'
    expect(allowedDrop(records, 0, 2, never)).toEqual({ to: 0, reason: 'Pinned' })
    expect(allowedDrop(records, 0, 3, last)).toEqual({ to: 0, reason: 'Too late' })
  })
})
