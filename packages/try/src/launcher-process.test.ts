import { describe, expect, it } from 'vitest'
import { listsImage } from './launcher-process'

describe('listsImage', () => {
  it('matches the image name of the listed process', () => {
    expect(listsImage('"protobase-try.exe","4242","Console","1","180,000 K"', 'protobase-try.exe')).toBe(true)
    expect(listsImage('"Protobase-Try.EXE","4242","Console","1","180,000 K"', 'protobase-try.exe')).toBe(true)
  })

  it('refuses another program and an empty list', () => {
    expect(listsImage('"chrome.exe","4242","Console","1","180,000 K"', 'protobase-try.exe')).toBe(false)
    expect(listsImage('INFO: No tasks are running which match the specified criteria.', 'protobase-try.exe')).toBe(false)
  })
})
