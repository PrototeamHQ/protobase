import { text } from '../messages'
import type { WireRefusal } from './data-edits'
import { typeLabel } from './pin-text'

/** Why a wire is refused, in words, as the line being drawn says it over the pin it would end at. */
export const refusalText = (refusal: WireRefusal) => {
  if (refusal.reason === 'notBefore') return text('refuseNotBefore', { step: refusal.step })
  if (refusal.reason === 'shapesOutput') return text('refuseShaped', { step: refusal.step })
  if (refusal.reason === 'type') return text('refuseType', { source: typeLabel(refusal.source), target: typeLabel(refusal.target) })
  return text('refuseNotPins')
}
