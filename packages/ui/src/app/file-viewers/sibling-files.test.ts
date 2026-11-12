import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { siblingFiles, siblingFilter } from './sibling-files'

const attachments = resource('attachments')
  .table('attachments')
  .fields({
    id: f.integer().readOnly().dbDefault(),
    task_id: f.relation('tasks').optional().filterable(),
    project: f.relation('projects').optional().filterable(),
    owner: f.relation('users').optional(),
    file: f.file(),
    preview: f.file().optional(),
  })
  .primaryKey((r) => r.id)
  .toModel()

const stored = (name: string) => ({ uri: `private://${name}`, name, type: 'image/png', url: `/files/${name}` })

describe('sibling files', () => {
  it('are the records pointing at every record this one points at, through filterable relations', () => {
    expect(siblingFilter(attachments, { id: 1, task_id: 7, project: null, owner: 'u1' })).toBe('task_id = 7')
    expect(siblingFilter(attachments, { id: 1, task_id: { id: 7, name: 'Fix' }, project: 'site' })).toBe('task_id = 7 AND project = "site"')
  })

  it('are none outside the record when it points at nothing a list filters by', () => {
    expect(siblingFilter(attachments, { id: 1, task_id: null, project: null, owner: 'u1' })).toBeUndefined()
  })

  it("are every file of the records but the one shown, each once", () => {
    const shown = { ...stored('pr.report.json') }
    const records = [
      { id: 1, file: shown, preview: stored('cover.png') },
      { id: 2, file: stored('before.png'), preview: null },
      { id: 1, file: shown, preview: stored('cover.png') },
    ]
    expect(siblingFiles(attachments, records, shown).map((file) => file.name)).toEqual(['cover.png', 'before.png'])
  })
})
