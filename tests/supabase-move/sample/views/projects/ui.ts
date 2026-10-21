import { l, view } from '@protobase/schema'
import type { projects } from './data'

// The developer's own view, written after the import: each project's todos, newest first, which no index serves yet.
export const projectsView = view<typeof projects>('projects')
  .list((r) => ({ columns: [r.name] }))
  .layout((r) => [l.section('Project', [r.name]), l.related('Todos', { resource: 'todos', field: 'project_id', sort: 'inserted_at desc', columns: ['title', 'done'] })])
