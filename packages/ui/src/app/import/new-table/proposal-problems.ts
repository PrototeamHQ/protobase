import { userTableNameIssue, type UserTableNameIssue } from '@protobase/schema'
import { text } from '../messages'
import { includedFields, type TableProposal } from './table-proposal'

/** What keeps a proposal from being made, by where it shows: the table's name and labels, and each column's field. */
export type ProposalProblems = {
  name?: string
  pluralLabel?: string
  singularLabel?: string
  /** No column is left to become a field. */
  noFields?: string
  fields: Record<number, { name?: string; label?: string }>
}

const issueText = (issue: UserTableNameIssue, name: string, maxBytes: number) => {
  if (issue === 'form') return text('nameForm', { max: maxBytes })
  if (issue === 'reserved_word') return text('nameReservedWord', { name })
  return text('nameReservedField', { name })
}

const required = (value: string) => (value.trim() === '' ? text('needed') : undefined)

/**
 * The problems the server would refuse a proposal for that the page can tell: names outside the rules, a table name a
 * resource in `taken` has, two fields of one name, an empty label, or no field at all. The server checks it all again.
 */
export const proposalProblems = (proposal: TableProposal, taken: ReadonlySet<string>, maxTableBytes: number): ProposalProblems => {
  const tableIssue = userTableNameIssue(proposal.name, 'table', maxTableBytes)
  const problems: ProposalProblems = {
    name: tableIssue ? issueText(tableIssue, proposal.name, maxTableBytes) : taken.has(proposal.name) ? text('nameTaken', { name: proposal.name }) : undefined,
    pluralLabel: required(proposal.pluralLabel),
    singularLabel: required(proposal.singularLabel),
    fields: {},
  }
  const included = includedFields(proposal)
  if (included.length === 0) problems.noFields = text('noFields')
  const seen = new Set<string>()
  for (const field of included) {
    const issue = userTableNameIssue(field.name, 'field')
    const name = issue ? issueText(issue, field.name, 63) : seen.has(field.name) ? text('nameTwice', { name: field.name }) : undefined
    seen.add(field.name)
    const label = required(field.label)
    if (name || label) problems.fields[field.column] = { ...(name && { name }), ...(label && { label }) }
  }
  return problems
}

/** Whether a proposal has none of the problems the page can tell. */
export const hasProblems = (problems: ProposalProblems) =>
  Boolean(problems.name || problems.pluralLabel || problems.singularLabel || problems.noFields || Object.keys(problems.fields).length > 0)
