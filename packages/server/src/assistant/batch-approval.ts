/**
 * What the user approves for a batch: first what the tool itself says (how many writes of each kind on each resource,
 * and which deletes cannot be undone), then each operation as quoted JSON, cut short and up to a count, so a batch of
 * hundreds stays readable and no value the client sent renders as markup or reads as the tool's own text.
 */
import type { ApprovalRequest } from './approval'
import type { WriteOperation } from './batch-write-args'

export const shownOperations = 50
const shownResources = 20
const lineLength = 240
const nameLength = 60

// Control, format (bidi, zero-width) and markup characters as \u escapes, so the text shows them rather than acts on them;
// brackets only inside strings, where a link could start, so a key's list still reads as one.
const unicodeEscape = (char: string) => {
  const code = char.codePointAt(0)!
  return code > 0xffff ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, '0')}`
}
const escaped = (json: string) =>
  json
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029`<>]/gu, unicodeEscape)
    .replace(/"(?:[^"\\]|\\.)*"/g, (text) => text.replace(/[[\]]/g, unicodeEscape))
const cut = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)
const quoted = (value: unknown, length: number) => cut(escaped(JSON.stringify(value) ?? 'null'), length)

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const lineOf = (operation: WriteOperation, index: number) => {
  const target = operation.op === 'create' ? quoted(operation.resource, nameLength) : `${quoted(operation.resource, nameLength)} ${quoted(operation.key, nameLength)}`
  const values = operation.op === 'delete' ? '' : ` ${quoted(operation.data, lineLength)}`
  return cut(`${index + 1}. ${operation.op} ${target}${values}`, lineLength)
}

type Counts = { create: number; update: number; delete: number }

const countsOf = (operations: WriteOperation[]) => {
  const counts = new Map<string, Counts>()
  for (const { op, resource } of operations) {
    const known = counts.get(resource) ?? { create: 0, update: 0, delete: 0 }
    known[op] += 1
    counts.set(resource, known)
  }
  return [...counts]
}

// The first `shownResources` of `lines`, and how many more there are.
const capped = (lines: string[]) => (lines.length > shownResources ? [...lines.slice(0, shownResources), `and ${plural(lines.length - shownResources, 'more resource')}`] : lines)

/**
 * The approval of `operations`; `softDeletes` names the resources whose deletes can be restored, and a delete on any
 * other is said to be permanent.
 */
export const batchApproval = (operations: WriteOperation[], softDeletes: Set<string>): ApprovalRequest => {
  const counts = countsOf(operations)
  const permanent = counts.filter(([resource, { delete: deletes }]) => deletes > 0 && !softDeletes.has(resource))
  const lasting = permanent.reduce((sum, [, { delete: deletes }]) => sum + deletes, 0)
  const warning = lasting > 0
    ? [`${plural(lasting, 'delete')} cannot be undone:`, ...capped(permanent.map(([resource, { delete: deletes }]) => `${plural(deletes, 'delete')} in ${quoted(resource, nameLength)}`))]
    : []
  const summary = capped(counts.map(([resource, count]) => `${quoted(resource, nameLength)}: ${plural(count.create, 'create')}, ${plural(count.update, 'update')}, ${plural(count.delete, 'delete')}`))
  const rest = operations.length - shownOperations
  const lines = operations.slice(0, shownOperations).map(lineOf)
  return {
    title: `Run ${plural(operations.length, 'write')} in one transaction?`,
    body: [...warning, 'Either all of them are written or none.', ...summary].join('\n'),
    code: [...lines, ...(rest > 0 ? [`and ${plural(rest, 'more operation')}, counted above`] : [])].join('\n'),
    approveLabel: 'Write all',
  }
}
