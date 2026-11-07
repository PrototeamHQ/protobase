import type { FieldModel, FilterError, FilterExpr, RelatedFilter, ResourceModel, Span } from '../model'
import { filterError } from './errors'

/** How deep `related()` nests inside the subfilters of a filter. */
export const maxRelatedDepth = 2
/** How many `related()` terms one filter holds, those in its subfilters included. */
export const maxRelatedTerms = 3

/** Everything but a list-style read refuses `related()`, which only the database can answer; so does any place but a term ANDed at the top. */
export const relatedRefused = (span: Span) =>
  filterError('unsupported-traversal', "related() only works in a list's filter, ANDed with the rest", 'Put it at the top of the filter or of a subfilter, joined with AND', span)

/** The resource whose records the field holds keys of: a relation's to a single key, or the resource's own for its single key. */
export const relatedTarget = (model: ResourceModel, field: FieldModel) => {
  if (field.relation) return field.relation.columns.length === 1 ? field.relation.resource : undefined
  return model.primaryKey.length === 1 && model.primaryKey[0] === field.name ? model.name : undefined
}

const conjuncts = (node: FilterExpr): FilterExpr[] => (node.kind === 'and' ? node.args.flatMap(conjuncts) : [node])

/** Takes the `related()` terms ANDed at the top of a filter out of it, leaving the rest as it was written when there are none. */
export const splitRelated = (ast: FilterExpr) => {
  const parts = conjuncts(ast)
  const terms = parts.filter((part): part is RelatedFilter => part.kind === 'related')
  if (terms.length === 0) return { terms, rest: ast }
  const others = parts.filter((part) => part.kind !== 'related')
  const rest: FilterExpr | undefined = others.length < 2 ? others[0] : { kind: 'and', args: others, span: ast.span }
  return { terms, rest }
}

const nested = (node: FilterExpr, inGroup: boolean, depth: number): Array<{ term: RelatedFilter; inGroup: boolean; depth: number }> => {
  switch (node.kind) {
    case 'and':
      return node.args.flatMap((arg) => nested(arg, inGroup, depth))
    case 'or':
      return node.args.flatMap((arg) => nested(arg, true, depth))
    case 'not':
      return nested(node.arg, true, depth)
    case 'related':
      return [{ term: node, inGroup, depth }, ...(node.filter ? nested(node.filter, false, depth + 1) : [])]
    default:
      return []
  }
}

/** What is wrong with where the `related()` terms of a filter stand and how many there are, whatever they name. */
export const relatedErrors = (ast: FilterExpr): FilterError[] => {
  const terms = nested(ast, false, 1)
  const misplaced = terms.filter(({ inGroup }) => inGroup).map(({ term }) => relatedRefused(term.span))
  const deep = terms.filter(({ depth }) => depth > maxRelatedDepth).map(({ term }) =>
    filterError('too-deep', `related() nests at most ${maxRelatedDepth} levels deep`, 'Read the deeper level first, or filter a resource closer to it', term.span))
  const many = terms.length > maxRelatedTerms
    ? [filterError('unsupported', `A filter holds at most ${maxRelatedTerms} related() terms`, 'Narrow it with fewer terms', terms[maxRelatedTerms]!.term.span)]
    : []
  return [...misplaced, ...deep, ...many]
}
