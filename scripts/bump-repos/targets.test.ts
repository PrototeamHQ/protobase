import { describe, expect, it } from 'vitest'
import { dispatchArgs, parseTargets } from './targets'

describe('parseTargets', () => {
  it('reads every repository of the list, with its ref when it names one', () => {
    const json = '[{ "repo": "acme/console", "ref": "development" }, { "repo": "acme-community/starter" }]'
    expect(parseTargets(json)).toEqual([{ repo: 'acme/console', ref: 'development' }, { repo: 'acme-community/starter' }])
  })

  it('reads an empty list as no repositories', () => {
    expect(parseTargets('[]')).toEqual([])
  })

  it('refuses a list that is not an array', () => {
    expect(() => parseTargets('{ "repo": "acme/console" }')).toThrow('PROTOBASE_BUMP_REPOS is not a JSON array')
  })

  it('refuses a repository that is not <owner>/<name>', () => {
    expect(() => parseTargets('[{ "repo": "console" }]')).toThrow('PROTOBASE_BUMP_REPOS[0].repo is not <owner>/<name>')
    expect(() => parseTargets('["acme/console"]')).toThrow('PROTOBASE_BUMP_REPOS[0].repo is not <owner>/<name>')
  })

  it('refuses an empty ref and unknown keys', () => {
    expect(() => parseTargets('[{ "repo": "acme/console", "ref": "" }]')).toThrow('PROTOBASE_BUMP_REPOS[0].ref is not a branch name')
    expect(() => parseTargets('[{ "repo": "acme/console", "base": "main" }]')).toThrow('PROTOBASE_BUMP_REPOS[0] has unknown keys: base')
  })
})

describe('dispatchArgs', () => {
  it("starts the repository's protobase-bump workflow at the release", () => {
    expect(dispatchArgs({ repo: 'acme-community/starter' }, '0.66.6')).toEqual(['workflow', 'run', 'protobase-bump.yml', '--repo', 'acme-community/starter', '--field', 'version=0.66.6'])
  })

  it('runs the workflow of the ref a repository names', () => {
    expect(dispatchArgs({ repo: 'acme/console', ref: 'development' }, '0.66.6')).toEqual([
      'workflow',
      'run',
      'protobase-bump.yml',
      '--repo',
      'acme/console',
      '--ref',
      'development',
      '--field',
      'version=0.66.6',
    ])
  })
})
