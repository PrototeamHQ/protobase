// Cuts the next release from the conventional commits since the last v* tag: bumps the one version that the root and
// every packages/*/package.json share (.versionrc.json), writes CHANGELOG.md, commits `chore(release): x.y.z` and tags
// vx.y.z, all locally; the release workflow pushes them. Below 1.0 a breaking change bumps the minor and anything else
// the patch; the first release is 0.1.0. Nothing to release (only docs, tests, chores, ...) changes nothing.
// `--dry-run` prints the version and changelog instead.
import { spawnSync } from 'node:child_process'

const firstRelease = '0.1.0'
const dryRun = process.argv.slice(2).includes('--dry-run')

const lastTag = spawnSync('git', ['describe', '--tags', '--match', 'v*', '--abbrev=0'], { encoding: 'utf8' })
const releaseAs = lastTag.status === 0 ? [] : ['--release-as', firstRelease]

const released = spawnSync('pnpm', ['exec', 'commit-and-tag-version', ...releaseAs, ...(dryRun ? ['--dry-run'] : [])], { stdio: 'inherit' })
process.exit(released.status ?? 1)
