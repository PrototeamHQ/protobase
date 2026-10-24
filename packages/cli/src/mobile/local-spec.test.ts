import { describe, expect, it } from 'vitest'
import { isLocalSpec } from './local-spec'

describe('isLocalSpec', () => {
  it('takes every form npm reads as a folder on this machine', () => {
    for (const spec of ['../x', './x', '.x', '/abs/x', '~/x', 'C:\\x', 'c:/x', 'file:x', 'file:../x', 'file:///abs/x', 'FILE:x', '~\\x', '\\x']) expect(isLocalSpec(spec), spec).toBe(true)
  })

  it('leaves out versions, tags, aliases, git and URLs', () => {
    for (const spec of ['8.0.0', '^8.0.0', 'latest', '~8.0.0', 'npm:other@1.0.0', 'git+https://host/x.git', 'https://host/x.tgz', 'user/repo', '~']) expect(isLocalSpec(spec), spec).toBe(false)
  })
})
