import { ConventionalChangelog, type Preset } from 'conventional-changelog'
import createPreset from 'conventional-changelog-conventionalcommits'
import semver from 'semver'
import { SquashItemsGitClient } from './release-commits.ts'

// Features and fixes are released, under these sections; any other type only with a breaking change.
const types = [
  { type: 'feat', section: 'Features', effect: 'bump' },
  { type: 'fix', section: 'Bug Fixes', effect: 'bump' },
] as const
const releaseTypes = ['major', 'minor', 'patch'] as const

// The preset's declarations type it as {}: it holds the parser's and writer's options and the rule that picks the bump,
// a level of releaseTypes or null for none.
type ReleasePreset = Preset & { whatBump: (commits: unknown[]) => { level: 0 | 1 | 2 } | null }

// The version after `lastVersion`, or `firstVersion` without one, and its notes, from the conventional commits since
// `lastTag` up to HEAD, squash items included (./release-commits.ts); undefined without a fix, feature or breaking
// change. Below 1.0 a breaking change bumps the minor and anything else the patch.
export const nextRelease = async (cwd: string, lastTag: string | undefined, lastVersion: string | undefined, firstVersion: string) => {
  const preset = createPreset({ types, preMajor: lastVersion === undefined || semver.lt(lastVersion, '1.0.0') }) as ReleasePreset
  const client = new SquashItemsGitClient(cwd)
  const range = { from: lastTag ?? '', to: 'HEAD' }

  const commits = []
  for await (const commit of client.getCommits({ ...range, format: '%B%n-hash-%n%H' }, preset.parser)) commits.push(commit)
  const bump = preset.whatBump(commits)
  if (!bump) return

  const version = lastVersion ? semver.inc(lastVersion, releaseTypes[bump.level]) : firstVersion
  if (!version) throw new Error(`cannot bump ${lastVersion} by a ${releaseTypes[bump.level]}`)

  // The writer heads the section `## [x.y.z](compare link) (date)`; the notes are what follows.
  let section = ''
  const changelog = new ConventionalChangelog(client).readPackage().config(preset).context({ version }).commits(range)
  for await (const chunk of changelog.write()) section += chunk
  return { version, notes: `${section.slice(section.indexOf('\n') + 1).trim()}\n` }
}
