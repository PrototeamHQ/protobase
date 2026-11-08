import jsonata from 'jsonata'
import { seededRandom } from './seeded-random'

const format = jsonata('$fromMillis($millis, $picture, $timezone)')

/** The names `stepFunctions` binds, which a scope does not pass on to a Map's items as variables. */
export const stepFunctionNames = ['now', 'millis', 'random', 'shuffle'] as const

/**
 * JSONata's functions that would read the time or chance, made to give the same value each time a step runs:
 * `$now()` and `$millis()` give the scope's clock, and `$random()` and `$shuffle()` draw from a generator seeded by
 * the step's place (`key`: the run, the scope, the step's number and its try), so Map items running at once each get
 * their own numbers, and a step run again after a crash gets the same.
 */
export const stepFunctions = (clock: Date, key: string) => {
  const random = seededRandom(key)
  return {
    now: (picture?: string, timezone?: string) => format.evaluate(undefined, { millis: clock.getTime(), picture, timezone }),
    millis: () => clock.getTime(),
    random,
    // Fisher-Yates, as JSONata's own $shuffle, drawing from the step's generator.
    shuffle: (items: unknown) => {
      if (items === undefined) return undefined
      const shuffled = Array.isArray(items) ? [...items] : [items]
      for (let index = shuffled.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1))
        ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
      }
      return shuffled
    },
  }
}
