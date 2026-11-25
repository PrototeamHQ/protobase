import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { skipReason } from './skip-rule'

// `bun scripts/older-code/decide.ts`: the release the older-code job tests, the newest `v*` tag before HEAD, and
// whether it runs that release's tests, as skip-rule.ts says from the migration files added since. It prints why, and
// writes release=<tag> and run=true or run=false to $GITHUB_OUTPUT.

const root = path.join(import.meta.dirname, '..', '..')
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const release = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD^')
const added = git('diff', '--name-only', '--diff-filter=A', '--no-renames', release, 'HEAD', '--', ':(glob)**/db/migrations/*.sql')
const files = added
  .split('\n')
  .filter((file) => file && !file.endsWith('.after.sql'))
  .map((file) => ({ file, text: git('show', `HEAD:${file}`) }))

const skip = skipReason(files, release)
console.log(skip ? `Skipping the tests of ${release}: ${skip}` : `Running the tests of ${release} on this checkout's migrations, ${files.length} new since then`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\nrun=${!skip}\n`)
