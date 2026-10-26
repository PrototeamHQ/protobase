import { describe, expect, it } from 'vitest'
import { askDir, dirForAnswer } from './ask-dir'

describe('dirForAnswer', () => {
  it('takes my-app for an empty answer and the trimmed answer otherwise', () => {
    expect(dirForAnswer(' \n')).toBe('my-app')
    expect(dirForAnswer(' shop\n')).toBe('shop')
  })
})

describe('askDir', () => {
  it('asks for the folder with my-app as the default', async () => {
    expect(await askDir(async (text) => (text === 'Project folder [my-app]: ' ? '' : 'wrong'))).toBe('my-app')
  })
})
