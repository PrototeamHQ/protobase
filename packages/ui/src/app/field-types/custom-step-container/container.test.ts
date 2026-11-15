import { describe, expect, it } from 'vitest'
import { commandOf, containerOf, storedContainer } from './container'

describe('a custom step container in its editor', () => {
  it('reads a stored container, and empty parts from one of another shape', () => {
    expect(containerOf({ dockerfile: 'FROM alpine', files: { 'a.sh': 'echo a' }, command: ['sh', 'a.sh'] })).toEqual({ dockerfile: 'FROM alpine', files: [['a.sh', 'echo a']], command: ['sh', 'a.sh'] })
    expect(containerOf(null)).toEqual({ dockerfile: '', files: [], command: [] })
    expect(containerOf({ files: [], command: 'sh' })).toEqual({ dockerfile: '', files: [], command: [] })
  })

  it('stores its files by path and the command only with an argument, one a line without empty lines', () => {
    expect(commandOf('convert\n\n--preset\n')).toEqual(['convert', '--preset'])
    expect(storedContainer({ dockerfile: 'FROM alpine', files: [['a', '1'], ['a', '2']], command: [] })).toEqual({ dockerfile: 'FROM alpine', files: { a: '2' } })
    expect(storedContainer({ dockerfile: 'FROM alpine', files: [], command: ['run'] })).toEqual({ dockerfile: 'FROM alpine', files: {}, command: ['run'] })
  })
})
