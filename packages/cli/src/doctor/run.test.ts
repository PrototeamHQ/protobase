import { describe, expect, it } from 'vitest'
import { runDoctor } from './run'

describe('runDoctor', () => {
  it('says how to write the config when there is none, before it connects', async () => {
    await expect(runDoctor({ url: 'postgres://nobody@127.0.0.1:1/none', configDir: '/nonexistent/config', projectDir: '/nonexistent' }, () => {})).rejects.toThrow(
      'No config in /nonexistent/config: write it with `protobase scaffold`, or pass --config <dir>',
    )
  })
})
