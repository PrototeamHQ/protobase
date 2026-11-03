import { expect, test } from 'vitest'
import { readRunsOnNote } from './runs-on-note'

test('the note is on only with PROTOBASE_RUNS_ON_NOTE=true', () => {
  expect(readRunsOnNote({ PROTOBASE_RUNS_ON_NOTE: 'true' })).toBe(true)
  expect(readRunsOnNote({ PROTOBASE_RUNS_ON_NOTE: 'false' })).toBe(false)
  expect(readRunsOnNote({ PROTOBASE_RUNS_ON_NOTE: '' })).toBe(false)
  expect(readRunsOnNote({})).toBe(false)
})

test('any other value stops startup, naming the variable and the allowed values', () => {
  for (const value of ['1', 'yes', 'on', 'TRUE']) expect(() => readRunsOnNote({ PROTOBASE_RUNS_ON_NOTE: value })).toThrow(`PROTOBASE_RUNS_ON_NOTE must be true or false, not "${value}"`)
})
