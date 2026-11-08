import type { Binding } from './binding'

/** Why a stored value does not open. */
export type UnreadableKind = 'not-encrypted' | 'malformed' | 'unknown-key' | 'failed-authentication'

/** The resource and field a value belongs to, which an error names. */
export type ValueSubject = { resource: string; field: string }

/** A stored value of an encrypted field that does not open. Its message never holds the value. */
export class UnreadableValue extends Error {
  constructor(
    readonly kind: UnreadableKind,
    subject: ValueSubject,
    binding: Binding,
    readonly kid?: string,
  ) {
    super(`${subject.resource}.${subject.field} of record ${JSON.stringify(binding.key)} cannot be decrypted: ${kind}${kid ? ` (key ${kid})` : ''}`)
    this.name = 'UnreadableValue'
  }
}
