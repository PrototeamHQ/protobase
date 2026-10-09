import type { DbTable } from '../db/model'
import { typesCompatible } from '../infer/compat'
import { proposeField, type ProposalContext } from '../infer/proposal'
import { renderField } from '../infer/render-field'
import type { ExistingResource } from './existing-config'

export type Drift = {
  resource: string
  field: string
  problem: string
  suggestion: string
}

const sameValues = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((v) => b.includes(v))

// Declared fields whose column vanished or whose database type no longer fits.
export const detectDrift = (existing: ExistingResource, table: DbTable, context: ProposalContext): Drift[] =>
  existing.fields
    .filter((field) => !field.ignored)
    .flatMap((field): Drift[] => {
      const column = table.columns.find((c) => c.name === field.column)
      if (!column) {
        return [
          {
            resource: existing.name,
            field: field.name,
            problem: `column "${field.column}" no longer exists`,
            suggestion: `remove "${field.name}" or point .column() at its new name`,
          },
        ]
      }
      if (!field.type) return []
      const proposal = proposeField(table, column, context)
      const typeDrift = !typesCompatible(field.type, proposal.base)
      const enumDrift = field.type === 'enum' && proposal.base === 'enum' && !sameValues(field.enumValues, proposal.enumValues)
      if (!typeDrift && !enumDrift) return []
      return [
        {
          resource: existing.name,
          field: field.name,
          problem: typeDrift
            ? `declared ${field.type}, database is ${column.formatted}`
            : `enum values differ from the database (${proposal.enumValues?.join(', ')})`,
          suggestion: `${field.name}: ${renderField({ ...proposal, name: field.name })}`,
        },
      ]
    })
