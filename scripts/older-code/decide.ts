import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { releaseVersion } from '../release-tag'
import { skipReason } from './skip-rule'

// `bun scripts/older-code/decide.ts`: the release the older-code job tests, the newest release tag before HEAD, never a
// prerelease (`releaseVersion`), and whether it runs that release's tests, as skip-rule.ts says from the migration files
// added since. It prints why, and writes release=<tag> and run=true or run=false to $GITHUB_OUTPUT.

const root = path.join(import.meta.dirname, '..', '..')
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const releases = git('tag', '--merged', 'HEAD^', '--list', 'v*').split('\n').filter((tag) => releaseVersion(tag))
const [release] = releases.sort((a, b) => semver.rcompare(releaseVersion(a)!, releaseVersion(b)!))
if (!release) throw new Error('No release tag before HEAD: fetch the tags, as a checkout with fetch-depth 0 does')
const added = git('diff', '--name-only', '--diff-filter=A', '--no-renames', release, 'HEAD', '--', ':(glob)**/db/migrations/*.sql')
const files = added
  .split('\n')
  .filter((file) => file && !file.endsWith('.after.sql'))
  .map((file) => ({ file, text: git('show', `HEAD:${file}`) }))

const skip = skipReason(files, release)
console.log(skip ? `Skipping the tests of ${release}: ${skip}` : `Running the tests of ${release} on this checkout's migrations, ${files.length} new since then`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\nrun=${!skip}\n`)
