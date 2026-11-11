import { f, resource } from '@protobase/schema'

export const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly(), title: f.text(), verdict: f.enum(['done', 'open', 'late']).optional().readOnly() })
  .primaryKey((r) => r.id)
  .derived('verdict', { into: (r) => r.verdict, reads: ['tasks'] })

export const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly(), objectiveId: f.integer(), status: f.enum(['open', 'closed']), createdAt: f.timestamp().readOnly() })
  .primaryKey((r) => r.id)
