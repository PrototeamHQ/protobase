export type FlipGuardOptions = {
  /** How far back, in milliseconds, a value counts as one the measure comes back to. */
  windowMs?: number
  /** How many comebacks within `windowMs` make the measure a loop. */
  comebacks?: number
  /** Called with the value held and the values the measure kept changing between, when the guard starts holding. */
  onHold?: (held: number, values: number[]) => void
}

const warnInDevelopment = (held: number, values: number[]) => {
  if (!import.meta.env?.DEV) return
  console.warn(`A layout kept changing between ${values.join(', ')} and is held at ${held}, so it does not flash. Something it draws changes what it measures.`)
}

/**
 * Settles a measure that a layout follows, such as a list's width, when the layout feeds back into it and it keeps
 * changing between the same few values, as a width does when the layout it gives brings a scrollbar that narrows it
 * again. Each call takes the measured `value` at time `at` and returns the value to lay out with: the measured one,
 * until it comes back to a value it had within `windowMs` `comebacks` times. It then holds the smallest of the values
 * it last changed between, which fits whichever of them the measure settles at, until the measure takes another value,
 * as on a resize of the window. A layout that keeps to the held value stops feeding the loop, so it cannot flash.
 */
export const createFlipGuard = ({ windowMs = 1000, comebacks = 2, onHold = warnInDevelopment }: FlipGuardOptions = {}) => {
  let current: number | undefined
  let changes: { value: number; at: number; comeback: boolean }[] = []
  let held: { value: number; among: Set<number> } | undefined

  return (value: number, at: number) => {
    if (held?.among.has(value)) return held.value
    if (held) {
      held = undefined
      changes = []
    }
    if (value === current) return value
    current = value
    changes = changes.filter((change) => at - change.at <= windowMs)
    changes.push({ value, at, comeback: changes.some((change) => change.value === value) })
    if (changes.filter((change) => change.comeback).length < comebacks) return value

    // The values of the loop: those of as many changes back as it takes to come back that many times
    const among = new Set(changes.slice(-2 * comebacks).map((change) => change.value))
    held = { value: Math.min(...among), among }
    onHold(held.value, [...among])
    return held.value
  }
}
