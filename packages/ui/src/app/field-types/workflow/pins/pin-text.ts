import type { PinKind, PinType } from '@protobase/workflows'
import { inputLabel } from '../labels'
import { text } from '../messages'

const kindLabels: Record<PinKind | 'any', () => string> = {
  string: () => text('typeString'),
  integer: () => text('typeInteger'),
  number: () => text('typeNumber'),
  boolean: () => text('typeBoolean'),
  object: () => text('typeObject'),
  array: () => text('typeArray'),
  null: () => text('typeNull'),
  any: () => text('typeAny'),
}

/** A pin's type in words: its title, such as Contact, or what it can be, such as Text or Whole number. */
export const typeLabel = (type: PinType) => {
  if (type.title !== undefined) return type.title
  if (type.kinds === 'any') return kindLabels.any()
  return type.kinds.map((kind) => kindLabels[kind]()).reduce((first, second) => text('typeOr', { first, second }))
}

/** The kind a pin is coloured by: its first, or any. */
export const pinColour = (type: PinType) => (type.kinds === 'any' ? 'any' : type.kinds[0]!)

const outputLabels: Record<string, () => string> = {
  status: () => text('outputStatus'),
  headers: () => text('outputHeaders'),
  body: () => text('outputBody'),
  record: () => text('outputRecord'),
  resource: () => text('outputResource'),
  key: () => text('outputKey'),
  records: () => text('outputRecords'),
  message_id: () => text('outputMessageId'),
}

/**
 * An output pin's name: the whole of what a node gives, a value a built-in type returns by its label, else the
 * field's name, as a Break names each field of an object, such as a record's.
 */
export const outputLabel = (path: readonly string[], trigger = false, field = false) => {
  if (path.length === 0) return trigger ? text('pinRunInput') : text('pinResult')
  const name = path.at(-1)!
  return field ? name : (outputLabels[name]?.() ?? name)
}

/** An input pin's name: a built-in argument by its label, else its name. */
export const inputPinLabel = (key: string) => inputLabel(key)
