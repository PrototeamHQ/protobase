import { describe, expect, it } from 'vitest'
import type { TableIndexes } from '@protobase/query'
import { f, resource } from '@protobase/schema'
import { fileIndexIssues } from './index-issues'

const photos = resource('photos')
  .table('photos')
  .fields({ id: f.integer().readOnly(), photo: f.file(), cover: f.file() })
  .primaryKey((r) => r.id)
  .toModel()

// An expression index on a file column, as pg_get_indexdef prints its key.
const fileIndex = (name: string, column: string, partial = false, definition = `split_part(${column}, '?'::text, 1)`) => ({ name, method: 'btree', partial, keys: [{ column: null, definition, opclass: 'text_ops' }] })

describe('the file columns no index looks files up in', () => {
  it('are a warning each, with the index that serves the file cleanup', () => {
    const table: TableIndexes = { kind: 'table', indexes: [fileIndex('photos_photo', 'photo'), fileIndex('photos_cover_kept', 'cover', true), fileIndex('photos_cover_query', 'cover', false, `split_part(cover, '?'::text, 2)`)] }
    expect(fileIndexIssues(photos, table)).toEqual([
      {
        severity: 'warning',
        resource: 'photos',
        message: 'no index looks up the files of "cover", so each file cleanup reads every row of the table to check that none holds a file it deletes',
        suggestion: `create index on "photos" ((split_part("cover", '?', 1)));`,
      },
    ])
  })

  it('are none of a view, which can have no index', () => {
    expect(fileIndexIssues(photos, { kind: 'other', indexes: [] })).toEqual([])
  })
})
