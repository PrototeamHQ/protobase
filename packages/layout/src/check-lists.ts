import { parseTemplatePath } from '@protobase/schema/internal'
import type { LayoutNode } from './node'
import { innermost, type Scope } from './walk'

// Where the list blocks may sit, checked without the models: a list context reads from the record around it, and a
// RecordsIterator or a Table without `resource` draws the list around it.

const name = /^[A-Za-z_][A-Za-z0-9_]*$/

const contexts = 'a ReferenceManyField, ReferenceArrayField or ArrayField'

/** The props of a `Table` that shape its own read, which the list around it decides instead. */
const ownReadProps = ['filter', 'sort', 'limit', 'display', 'bulk']

const pathProblems = (node: LayoutNode): string[] => {
  const problems: string[] = []
  const { source, target, reference } = node.props
  if (typeof source === 'string' && !parseTemplatePath(source)) problems.push(`"source" is no path; write a field's name, such as task_id, ../id or this.id`)
  if (typeof target === 'string' && !name.test(target)) problems.push(`"target" is a field of ${String(reference)}'s, such as task_id`)
  if (typeof reference === 'string' && !name.test(reference)) problems.push(`"reference" is a resource's name, such as tasks`)
  return problems
}

const tableProblems = (node: LayoutNode, scope: Scope): string[] => {
  if (node.props.resource !== undefined) return []
  if (!scope.list) return [`"resource" is required, or put it inside ${contexts} to draw that list`]
  if (scope.list.items) return [`draws records of a resource, and the items of an ArrayField have none; draw them with a RecordsIterator`]
  return ownReadProps.filter((prop) => node.props[prop] !== undefined).map((prop) => `"${prop}" is the list's around it, which reads for it; set it there, or give the table its own "resource"`)
}

/** Problems of where a list block, a `RecordsIterator` or a `Table` sits and how its paths are written. */
export const listProblems = (node: LayoutNode, scope: Scope): string[] => {
  switch (node.type) {
    case 'ReferenceManyField':
    case 'ReferenceArrayField':
    case 'ArrayField':
    case 'ReferenceField': {
      const record = innermost(scope) || scope.root !== undefined ? [] : [`reads its "source" from a record: put it inside a RecordCard, a CardRow or a RecordsIterator`]
      return [...record, ...pathProblems(node)]
    }
    case 'RecordsIterator':
      return scope.list ? [] : [`draws the list around it: put it inside ${contexts}`]
    case 'Table':
      return tableProblems(node, scope)
    default:
      return []
  }
}
