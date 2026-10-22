// Cuts the next release from the conventional commits since the last vx.y.z tag reachable from HEAD, so a maintenance
// branch bumps from its own last release, without committing anything: tags HEAD vx.y.z locally, writes the release's
// notes to the file `--notes` names and prints the tag, which the release workflow pushes and creates the GitHub
// release from. Below 1.0 a breaking change bumps the minor and anything else the patch; the first release is 0.1.0.
// When the repository has a tag above the last one reachable from HEAD, HEAD is on a maintenance branch whose next
// minor and major are taken: fixes and features are released as a patch, and a breaking change fails the release,
// with no way around it, since it needs the branch's history cleaned up. Nothing to release (only docs,
// tests, chores, ...), or a HEAD that is a release already, tags nothing and prints nothing. No package.json is
// bumped: the workflow writes the tag's version into them in its runner (scripts/stamp-version.mjs). `--dry-run`
// prints the tag, as a real run does, with its notes on stderr, and tags nothing.
// `--features-release-rule` also refuses a release with a feature that changes no docs page (scripts/features-check.ts);
// it stays off until every feature already released is documented.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { releaseProblems } from './features-check.ts'

const firstRelease = '0.1.0'
const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, notes: { type: 'string' }, 'features-release-rule': { type: 'boolean' } } })
const dryRun = values['dry-run'] ?? false
if (!dryRun && !values.notes) throw new Error('usage: bun scripts/release.mjs --notes <file> | --dry-run')

const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed with status ${result.status}`)
  return result.stdout.trim()
}

// The vx.y.z tags, newest version first: every one of the repository, or those the filter keeps.
const releaseTags = (...filter) =>
  git('tag', '--list', 'v[0-9]*', '--sort=-v:refname', ...filter)
    .split('\n')
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))

const releasedAs = releaseTags('--points-at', 'HEAD')[0]
if (releasedAs) {
  console.error(`Nothing to release: HEAD is ${releasedAs} already`)
  process.exit(0)
}

const lastTag = releaseTags('--merged', 'HEAD')[0]
const newestTag = releaseTags()[0]
const releaseAs = lastTag ? [] : ['--release-as', firstRelease]

// commit-and-tag-version (.versionrc.json) reads the version of the last tag reachable from HEAD and writes the
// release's changes as the only section of a changelog of its own, outside the repository, tagging nothing; with
// nothing to release it leaves the changelog empty. Its output goes to stderr, so stdout is the tag alone.
const changelog = path.join(mkdtempSync(path.join(tmpdir(), 'protobase-release-')), 'CHANGELOG.md')
writeFileSync(changelog, '')
const cut = spawnSync('bun', ['x', '--bun', 'commit-and-tag-version', '--infile', changelog, ...releaseAs], {
  stdio: ['inherit', process.stderr, 'inherit'],
})
if (cut.status !== 0) process.exit(cut.status ?? 1)

// The changelog's section, headed `## [x.y.z](compare link) (date)`, or `## x.y.z (date)` for the first release. No
// section means nothing to release.
const section = readFileSync(changelog, 'utf8').split(/^(?=## )/m).find((text) => text.startsWith('## '))
if (!section) {
  console.error('Nothing to release: no fix, feature or breaking change since the last release')
  process.exit(0)
}
const bumped = /^## \[?(\d+\.\d+\.\d+)/.exec(section)?.[1]
if (!bumped) throw new Error(`the changelog's section has no version: ${section.split('\n')[0]}`)

const parse = (version) => version.replace(/^v/, '').split('.').map(Number)
// A breaking change bumps the major from 1.0 on and the minor below it; anything else bumps less.
const isBreaking = (from, to) => {
  const [major, minor] = parse(from)
  const [toMajor, toMinor] = parse(to)
  return major === 0 ? toMajor > 0 || toMinor > minor : toMajor > major
}
const patchAfter = (tag) => {
  const [major, minor, patch] = parse(tag)
  return `${major}.${minor}.${patch + 1}`
}
const maintenance = lastTag !== undefined && newestTag !== lastTag
if (maintenance && isBreaking(lastTag, bumped)) {
  throw new Error(
    `a breaking change cannot be released from a maintenance branch: HEAD's last release is ${lastTag} and ${newestTag} exists already, so remove the breaking change from the branch's history`,
  )
}
const tag = `v${maintenance ? patchAfter(lastTag) : bumped}`
if (releaseTags().includes(tag)) throw new Error(`${tag} exists already`)
const notes = `${section.slice(section.indexOf('\n') + 1).trim()}\n`

if (values['features-release-rule']) {
  const problems = releaseProblems(process.cwd())
  if (problems.length > 0) throw new Error(`the features docs refuse this release:\n${problems.join('\n')}`)
}

if (maintenance) console.error(`${newestTag} is above ${lastTag}, so this maintenance release is a patch: ${tag}`)
if (dryRun) {
  console.error(`Would tag ${tag} with the notes:\n\n${notes}`)
  console.log(tag)
  process.exit(0)
}
git('tag', '--annotate', tag, '--message', tag)
writeFileSync(values.notes, notes)
console.log(tag)
