import { describe, expect, it } from 'vitest'
import { chooseOff, confirmRevival, offQuestion, revivalRefused } from './module-prompts'

const answering = (answer: string) => async () => answer

describe('the questions about modules turned off and on again', () => {
  it('chooses keep by default, and says personal access tokens stay valid unless deleted', async () => {
    expect(await chooseOff(answering(''))([{ module: 'personal_access_tokens' }])).toBe('keep')
    expect(await chooseOff(answering('k'))([{ module: 'mcp' }])).toBe('keep')
    expect(offQuestion([{ module: 'personal_access_tokens' }])).toContain('Its tokens stay valid unless deleted')
    expect(offQuestion([{ module: 'mcp' }])).not.toContain('tokens stay valid')
    await expect(chooseOff(answering('delete'))([{ module: 'mcp' }])).rejects.toThrow('"delete" is not a choice: keep is the only one for now')
  })

  it('brings back kept rows only when told yes, and names the count and the way through when refused', async () => {
    const rows = { module: 'personal_access_tokens' as const, found: 'personal_access_token 3' }
    expect(await confirmRevival(answering('y'))(rows)).toBe(true)
    expect(await confirmRevival(answering(''))(rows)).toBe(false)
    expect(revivalRefused(rows)).toBe(
      'personal_access_tokens is on again while its kept tables hold rows: personal_access_token 3. Delete them in a migration of the project\'s own first, or bring them back: pass --force to write the migration, and apply it with `protobase migrate --force`',
    )
  })
})
