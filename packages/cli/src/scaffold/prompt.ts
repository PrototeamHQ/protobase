import { createInterface } from 'node:readline/promises'
import type { FieldType, Proposal } from '../infer/proposal'
import { renderField } from '../infer/render-field'

export type DecideContext = {
  table: string
  // Key columns cannot be ignored.
  required: boolean
}

// Returns the accepted proposal, or null to ignore the column.
export type Decide = (proposal: Proposal, context: DecideContext) => Promise<Proposal | null>

export const acceptAll: Decide = async (proposal) => proposal

const types: FieldType[] = [
  'text', 'integer', 'bigint', 'decimal', 'boolean', 'date', 'timestamp', 'uuid', 'json', 'enum',
  'relation', 'currency', 'country',
]

type Ask = (question: string) => Promise<string>

const retype = async (proposal: Proposal, ask: Ask): Promise<Proposal> => {
  const answer = (await ask(`  type (${types.join(', ')}) [${proposal.type}]: `)).trim()
  if (!answer || answer === proposal.type) return proposal
  const type = types.find((t) => t === answer)
  if (!type) {
    process.stdout.write(`  unknown type "${answer}", keeping ${proposal.type}\n`)
    return proposal
  }
  const { enumValues, relation, precision, scale, defaultValue, ...rest } = proposal
  const next: Proposal = { ...rest, type }
  if (type === 'enum') {
    const values = await ask('  enum values, comma separated: ')
    next.enumValues = values.split(',').map((v) => v.trim()).filter(Boolean)
  }
  if (type === 'relation') next.relation = { resource: (await ask('  related resource: ')).trim() }
  if (type === 'decimal') {
    next.precision = Number((await ask('  precision [38]: ')) || 38)
    next.scale = Number((await ask('  scale [9]: ')) || 9)
  }
  return next
}

const edit = async (proposal: Proposal, ask: Ask): Promise<Proposal> => {
  const name = (await ask(`  field name [${proposal.name}]: `)).trim() || proposal.name
  return retype({ ...proposal, name }, ask)
}

export const interactive = () => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const decide: Decide = async (initial, { table, required }) => {
    let proposal = initial
    for (;;) {
      process.stdout.write(`\n${table}.${proposal.column}\n  ${proposal.name}: ${renderField(proposal)}\n`)
      const options = required ? '[a]ccept, [e]dit' : '[a]ccept, [e]dit, [i]gnore'
      const answer = (await rl.question(`  ${options} (a): `)).trim().toLowerCase() || 'a'
      if (answer === 'a') return proposal
      if (answer === 'e') proposal = await edit(proposal, (q) => rl.question(q))
      if (answer === 'i' && !required) return null
    }
  }
  return { decide, close: () => rl.close() }
}
