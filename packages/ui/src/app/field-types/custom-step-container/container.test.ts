import { describe, expect, it } from 'vitest'
import { commandOf, commandText, containerOf, storedContainer } from './container'

describe('a custom step container in its editor', () => {
  it('reads a stored container, and empty parts from one of another shape', () => {
    expect(containerOf({ dockerfile: 'FROM alpine', files: { 'a.sh': 'echo a' }, command: ['sh', 'a.sh'] })).toEqual({ dockerfile: 'FROM alpine', files: [['a.sh', 'echo a']], command: ['sh', 'a.sh'] })
    expect(containerOf(null)).toEqual({ dockerfile: '', files: [], command: [] })
    expect(containerOf({ files: [], command: 'sh' })).toEqual({ dockerfile: '', files: [], command: [] })
  })

  it('reads the command one argument a line without empty lines, or as a JSON list of texts', () => {
    expect(commandOf('convert\n\n--preset\n')).toEqual(['convert', '--preset'])
    expect(commandOf('["sh", "-c", "echo first\\necho second"]')).toEqual(['sh', '-c', 'echo first\necho second'])
    // Text that is no JSON list of texts is lines
    expect(commandOf('[1, 2]')).toEqual(['[1, 2]'])
    expect(commandOf('["sh",')).toEqual(['["sh",'])
  })

  it('shows a command one argument a line, or as JSON when an argument holds a line break, and reads it back the same', () => {
    expect(commandText(['convert', '--preset', '720'])).toBe('convert\n--preset\n720')
    const multiline = ['sh', '-c', 'echo first\necho second']
    expect(commandText(multiline)).toBe(JSON.stringify(multiline))
    for (const command of [multiline, ['convert', '--preset', '720']]) expect(commandOf(commandText(command))).toEqual(command)
  })

  it('stores its files by path and the command only with an argument', () => {
    expect(storedContainer({ dockerfile: 'FROM alpine', files: [['a', '1'], ['a', '2']], command: [] })).toEqual({ dockerfile: 'FROM alpine', files: { a: '2' } })
    expect(storedContainer({ dockerfile: 'FROM alpine', files: [], command: ['run'] })).toEqual({ dockerfile: 'FROM alpine', files: {}, command: ['run'] })
  })
})
