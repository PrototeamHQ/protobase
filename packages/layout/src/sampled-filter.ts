import { checkFilter, parseFilter, type ResourceModel } from '@protobase/schema'
import { sampleSlots } from './filter-slots'

/**
 * The messages of what is wrong with a filter on `model`, its `{{path}}` slots standing in for values. A stand-in
 * that does not fit its field's type, such as `'x'` for an enum, is no error: the page fills the real value.
 */
export const sampledFilterErrors = (model: ResourceModel, source: string): string[] => {
  const { text, slots } = sampleSlots(source)
  const parsed = parseFilter(text)
  if (!parsed.ok) return parsed.errors.map((error) => error.message)
  if (!parsed.ast) return []
  const checked = checkFilter(model, parsed.ast)
  if (checked.ok) return []
  const atSlot = new Set(slots.map((slot) => slot.start))
  return checked.errors.filter((error) => !(error.code === 'invalid-value' && atSlot.has(error.span.start))).map((error) => error.message)
}
