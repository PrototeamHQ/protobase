// Starts the protobase-bump workflow of every repository in PROTOBASE_BUMP_REPOS (see targets.ts) at the release TAG,
// e.g. v0.66.6; each opens or updates its own bump pull request, which merges itself once its CI is green. release.yml
// runs it once npm serves the release, with GH_TOKEN set to PROTOBASE_BUMP_TOKEN. Each name is masked in the log before
// anything else is printed. A repository that cannot be started does not stop the others; the run fails after them.
//
//   TAG=v0.66.6 PROTOBASE_BUMP_REPOS='[{ "repo": "<owner>/<name>" }]' GH_TOKEN=<token> bun scripts/bump-repos/main.ts
import { spawnSync } from 'node:child_process'
import { dispatchArgs, parseTargets } from './targets'

const { TAG, PROTOBASE_BUMP_REPOS, GH_TOKEN } = process.env
if (!TAG?.startsWith('v')) throw new Error('TAG is not a release tag such as v0.66.6')
if (!PROTOBASE_BUMP_REPOS) throw new Error('The PROTOBASE_BUMP_REPOS secret is not set: a JSON array of { "repo": "<owner>/<name>", "ref"?: "<branch>" }')
if (!GH_TOKEN) throw new Error('The PROTOBASE_BUMP_TOKEN secret is not set: a token with Actions write access on every repository of PROTOBASE_BUMP_REPOS')

const targets = parseTargets(PROTOBASE_BUMP_REPOS)
for (const { repo } of targets) console.log(`::add-mask::${repo}`)

const version = TAG.slice(1)
const failed = targets.filter((target, index) => {
  const result = spawnSync('gh', dispatchArgs(target, version), { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status === 0) {
    console.log(`Started the bump of ${target.repo} (${index + 1} of ${targets.length}) to ${version}`)
    return false
  }
  console.error(`Could not start the bump of ${target.repo} (${index + 1} of ${targets.length}): ${result.stderr.trim()}`)
  return true
})
if (failed.length > 0) throw new Error(`${failed.length} of ${targets.length} repositories could not start their bump to ${version}`)
