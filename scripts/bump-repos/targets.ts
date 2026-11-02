// The repositories a release bumps, from PROTOBASE_BUMP_REPOS: a JSON array of `{ "repo": "<owner>/<name>" }`, with
// `"ref"` naming the branch whose protobase-bump workflow runs when it is not the repository's default branch. The list
// is a secret, not a file, so the names of private repositories stay out of this public repository and its logs.
export type Target = { repo: string; ref?: string }

const repoName = /^[\w.-]+\/[\w.-]+$/

export const parseTargets = (json: string): Target[] => {
  const list: unknown = JSON.parse(json)
  if (!Array.isArray(list)) throw new Error('PROTOBASE_BUMP_REPOS is not a JSON array')
  return list.map((entry, index) => {
    const { repo, ref, ...rest } = (entry ?? {}) as Record<string, unknown>
    if (typeof repo !== 'string' || !repoName.test(repo)) throw new Error(`PROTOBASE_BUMP_REPOS[${index}].repo is not <owner>/<name>`)
    if (ref !== undefined && (typeof ref !== 'string' || ref === '')) throw new Error(`PROTOBASE_BUMP_REPOS[${index}].ref is not a branch name`)
    const unknown = Object.keys(rest)
    if (unknown.length > 0) throw new Error(`PROTOBASE_BUMP_REPOS[${index}] has unknown keys: ${unknown.join(', ')}`)
    return ref === undefined ? { repo } : { repo, ref }
  })
}

// The `gh` arguments that start a target's protobase-bump workflow at a release, e.g. 0.66.6.
export const dispatchArgs = ({ repo, ref }: Target, version: string) => [
  'workflow',
  'run',
  'protobase-bump.yml',
  '--repo',
  repo,
  ...(ref === undefined ? [] : ['--ref', ref]),
  '--field',
  `version=${version}`,
]
