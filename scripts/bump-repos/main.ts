// Starts the protobase-bump workflow of every repository in PROTOBASE_BUMP_REPOS (see targets.ts) at the release TAG,
// e.g. v0.66.6. Each listed repository owns that workflow, with a `version` input: it opens or updates its own bump pull
// request, which merges itself once its CI is green. release.yml runs this once npm serves the release, with GH_TOKEN
// set to PROTOBASE_BUMP_TOKEN. See bump.ts for what an unset list or token does.
//
//   TAG=v0.66.6 PROTOBASE_BUMP_REPOS='[{ "repo": "<owner>/<name>" }]' GH_TOKEN=<token> bun scripts/bump-repos/main.ts
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { bumpRepos } from './bump'

const { TAG, PROTOBASE_BUMP_REPOS, GH_TOKEN, GITHUB_STEP_SUMMARY } = process.env

// A fixed limit per repository, so a hung `gh` fails that repository instead of holding the job.
bumpRepos(
  { tag: TAG, repos: PROTOBASE_BUMP_REPOS, token: GH_TOKEN },
  (args) => spawnSync('gh', args, { encoding: 'utf8', timeout: 60_000 }),
  (message) => {
    console.log(`::warning::${message}`)
    if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `> [!WARNING]\n> ${message}\n`)
  },
)
