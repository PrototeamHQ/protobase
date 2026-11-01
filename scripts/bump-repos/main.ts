// Starts the protobase-bump workflow of every repository in PROTOBASE_BUMP_REPOS (see targets.ts) at the release TAG,
// e.g. v0.66.6. Each listed repository owns that workflow, with a `version` input: it opens or updates its own bump pull
// request, which merges itself once its CI is green. release.yml runs this once npm serves the release, with GH_TOKEN
// set to PROTOBASE_BUMP_TOKEN. An unset or empty list bumps nothing. Each name is masked in the log before anything else
// is printed. A repository that cannot be started does not stop the others; the run fails after them.
//
//   TAG=v0.66.6 PROTOBASE_BUMP_REPOS='[{ "repo": "<owner>/<name>" }]' GH_TOKEN=<token> bun scripts/bump-repos/main.ts
import { spawnSync } from 'node:child_process'
import { dispatchAll } from './dispatch'
import { parseTargets } from './targets'

const { TAG, PROTOBASE_BUMP_REPOS, GH_TOKEN } = process.env
if (!TAG?.startsWith('v')) throw new Error('TAG is not a release tag such as v0.66.6')

const targets = PROTOBASE_BUMP_REPOS ? parseTargets(PROTOBASE_BUMP_REPOS) : []
if (targets.length === 0) {
  console.log('PROTOBASE_BUMP_REPOS lists no repositories: nothing to bump')
  process.exit(0)
}
if (!GH_TOKEN) throw new Error('The PROTOBASE_BUMP_TOKEN secret is not set: a token with Actions write access on every repository of PROTOBASE_BUMP_REPOS')
for (const { repo } of targets) console.log(`::add-mask::${repo}`)

// A fixed limit per repository, so a hung `gh` fails that repository instead of holding the job.
const version = TAG.slice(1)
const failed = dispatchAll(targets, version, (args) => spawnSync('gh', args, { encoding: 'utf8', timeout: 60_000 }))
if (failed.length > 0) throw new Error(`${failed.length} of ${targets.length} repositories could not start their bump to ${version}`)
