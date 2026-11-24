import { offChoices, type OffChoice } from '@protobase/server/internal'

/** The `--off` choice, checked: one of `offChoices`, or `undefined` when not given. */
export const offChoice = (value: string | undefined): OffChoice | undefined => {
  if (value === undefined) return
  const choice = offChoices.find((known) => known === value)
  if (!choice) throw new Error(`--off takes ${offChoices.join(', ')}, not "${value}"`)
  return choice
}
