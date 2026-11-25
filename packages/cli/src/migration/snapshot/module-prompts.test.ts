import { describe, expect, it } from 'vitest'
import { chooseOff, confirmRevival, defaultChosen, offerDefault, offQuestion, revivalRefused } from './module-prompts'

const answering = (answer: string) => async () => answer

describe('the questions about modules turned off and on again', () => {
  it('chooses keep by default, and says personal access tokens stay valid unless deleted', async () => {
    expect(await chooseOff(answering(''))([{ module: 'personal_access_tokens' }])).toBe('keep')
    expect(await chooseOff(answering('k'))([{ module: 'mcp' }])).toBe('keep')
    expect(offQuestion([{ module: 'personal_access_tokens' }])).toContain('Its tokens stay valid unless deleted')
    expect(offQuestion([{ module: 'mcp' }])).not.toContain('tokens stay valid')
    expect(await chooseOff(answering('a'))([{ module: 'mcp' }])).toBe('archive')
    expect(await chooseOff(answering('delete'))([{ module: 'mcp' }])).toBe('delete')
    await expect(chooseOff(answering('drop'))([{ module: 'mcp' }])).rejects.toThrow('"drop" is not a choice: answer keep, archive or delete')
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

describe('the questions about turning organizations off', () => {
  it('says what goes dark when the database says, and nothing of it without', () => {
    expect(offQuestion([{ module: 'organizations' }], { outside: 3, otherTokens: 1 })).toContain(
      'While organizations are off, the default organization stands in for all of them, and only its members can sign in. That locks out 3 people and stops 1 personal access token created outside it from working.',
    )
    expect(offQuestion([{ module: 'organizations' }], { outside: 1, otherTokens: 2 })).toContain('locks out 1 person and stops 2 personal access tokens created outside it')
    expect(offQuestion([{ module: 'organizations' }])).not.toContain('stands in')
    expect(offQuestion([{ module: 'mcp' }], { outside: 3, otherTokens: 1 })).not.toContain('stands in')
  })

  it("offers the store's only organization as the default, taken only when told yes, and says what to put in the config", async () => {
    const only = { id: 'acme', name: "Acme's", slug: 'acme' }
    expect(await offerDefault(answering('y'))(only)).toBe(true)
    expect(await offerDefault(answering(''))(only)).toBe(false)
    expect(defaultChosen(only)).toBe('Nothing was written. Add `default: { id: "acme", name: "Acme\'s", slug: "acme" }` to `auth.organizations` in your config, and set `authenticate.tenant` to "acme". Then run `protobase migration` again.')
  })
})

