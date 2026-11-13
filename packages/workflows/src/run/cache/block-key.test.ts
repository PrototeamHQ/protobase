import { describe, expect, it } from 'vitest'
import type { BlockState } from '../../definition/types'
import { blockKey } from './block-key'
import { secretNamer } from './secret-names'

// A block holding a block whose step reads the secret `name`
const outer = (name: string) =>
  ({
    Type: 'Block',
    Cache: { Ttl: '1 hour' },
    End: true,
    Processor: {
      StartAt: 'Inner',
      States: {
        Inner: {
          Type: 'Block',
          Cache: { Ttl: '1 hour' },
          End: true,
          Processor: { StartAt: 'Fetch', States: { Fetch: { Type: 'Task', Resource: 'http', Arguments: { token: `{% $states.context.Secrets.${name} %}` }, End: true } } },
        },
      },
    },
  }) as unknown as BlockState

describe('blockKey', () => {
  it('covers the secrets a block inside it reads, so a change of them is told', async () => {
    const nameSecrets = secretNamer({})
    const one = await blockKey(outer('TOKEN_A'), {}, undefined, nameSecrets)
    const other = await blockKey(outer('TOKEN_B'), {}, undefined, nameSecrets)
    expect(one?.secrets).toEqual(['TOKEN_A'])
    expect(other?.secrets).toEqual(['TOKEN_B'])
    expect(one?.key).not.toBe(other?.key)
  })
})
