import { dispatchAll, type Run } from './dispatch'
import { parseTargets } from './targets'

export type BumpEnv = { tag?: string; repos?: string; token?: string }

// The warning a release writes to its summary when it leaves its repositories unbumped. It counts them rather than
// naming them: the list is a secret so that private repository names stay out of this public repository's runs.
export const missingTokenWarning = (count: number, version: string) =>
  `The PROTOBASE_BUMP_TOKEN secret is not set, so ${count} ${count === 1 ? 'repository' : 'repositories'} of PROTOBASE_BUMP_REPOS ${count === 1 ? 'was' : 'were'} not bumped to ${version}`

// Starts the bump of every repository of `repos` at `tag` through `run`. An empty list or a missing token bumps nothing
// and passes, the latter with a warning through `warn`, so no unset bump setting turns a release red. A repository that
// cannot be started does not stop the others; it throws after them.
export const bumpRepos = ({ tag, repos, token }: BumpEnv, run: Run, warn: (message: string) => void) => {
  if (!tag?.startsWith('v')) throw new Error('TAG is not a release tag such as v0.66.6')
  const version = tag.slice(1)

  const targets = repos ? parseTargets(repos) : []
  if (targets.length === 0) {
    console.log('PROTOBASE_BUMP_REPOS lists no repositories: nothing to bump')
    return;
  }
  if (!token) {
    warn(missingTokenWarning(targets.length, version))
    return;
  }
  for (const { repo } of targets) console.log(`::add-mask::${repo}`)

  const failed = dispatchAll(targets, version, run)
  if (failed.length > 0) throw new Error(`${failed.length} of ${targets.length} repositories could not start their bump to ${version}`)
}
