import { describe, expect, it } from 'vitest'
import { skipReason } from './skip-rule'

const header = (...lines: string[]) => ['-- protobase:id 1', '-- protobase:version 0.1.0', '-- protobase:custom', ...lines].join('\n')
const marked = { file: 'db/migrations/002_rename.sql', text: `${header('-- protobase:breaks-older-code')}\nalter table orders rename column code to reference;` }
const additive = { file: 'db/migrations/003_note.sql', text: `${header('-- protobase:additive')}\nalter table orders add column note text;` }
const unmarked = { file: 'db/migrations/004_drop.sql', text: 'alter table orders drop column note;' }

describe('whether the older-code job skips the release tests', () => {
  it('skips when every new file is marked as breaking older code, naming them', () => {
    expect(skipReason([marked, { ...marked, file: 'db/migrations/005_rename.sql' }], 'v1.2.0')).toBe(
      'every migration new since v1.2.0 is marked as breaking older code: db/migrations/002_rename.sql, db/migrations/005_rename.sql',
    )
  })

  it('runs when a new file is additive or carries no mark', () => {
    expect(skipReason([marked, additive], 'v1.2.0')).toBeUndefined()
    expect(skipReason([marked, unmarked], 'v1.2.0')).toBeUndefined()
  })

  it('runs when there is no new file, as for a change to a step alone', () => {
    expect(skipReason([], 'v1.2.0')).toBeUndefined()
  })

  it('reads the mark only among the header lines', () => {
    expect(skipReason([{ file: 'db/migrations/006_late.sql', text: `select 1;\n-- protobase:breaks-older-code` }], 'v1.2.0')).toBeUndefined()
  })
})
