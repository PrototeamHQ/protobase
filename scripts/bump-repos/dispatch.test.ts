import { describe, expect, it, vi } from 'vitest'
import { dispatchAll, type Run } from './dispatch'

const ok = { error: undefined, status: 0, stderr: '' }
const targets = [{ repo: 'acme/console' }, { repo: 'acme/api' }, { repo: 'acme/backlog', ref: 'development' }]

describe('dispatchAll', () => {
  it('starts every repository and reports none failed', () => {
    const run = vi.fn<Run>(() => ok)
    expect(dispatchAll(targets, '0.66.6', run)).toEqual([])
    expect(run).toHaveBeenCalledTimes(3)
    expect(run).toHaveBeenLastCalledWith(['workflow', 'run', 'protobase-bump.yml', '--repo', 'acme/backlog', '--ref', 'development', '--field', 'version=0.66.6'])
  })

  it('still starts the others when one times out, one cannot spawn and one exits non-zero', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const timeout = Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' })
    const missing = Object.assign(new Error('spawnSync gh ENOENT'), { code: 'ENOENT' })
    const results = [{ error: timeout, status: null, stderr: '' }, { error: missing, status: null, stderr: '' }, { error: undefined, status: 1, stderr: 'HTTP 404' }, ok]
    const run = vi.fn<Run>(() => results.shift()!)
    const all = [...targets, { repo: 'acme/site' }]
    expect(dispatchAll(all, '0.66.6', run)).toEqual(['acme/console', 'acme/api', 'acme/backlog'])
    expect(run).toHaveBeenCalledTimes(4)
  })
})
