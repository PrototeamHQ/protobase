import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')

// scripts/release.mjs in a repository of its own, with this repository's .versionrc.json and commit-and-tag-version.
describe('scripts/release.mjs', () => {
  let repo = ''
  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'protobase-release-'))
    await copyFile(path.join(root, '.versionrc.json'), path.join(repo, '.versionrc.json'))
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'release-test', version: '0.0.0' }))
    await writeFile(path.join(repo, '.gitignore'), 'node_modules\n')
    await symlink(path.join(root, 'node_modules'), path.join(repo, 'node_modules'))
    git('init', '--quiet', '--initial-branch', 'main')
    git('add', '.')
  })
  afterEach(() => rm(repo, { recursive: true, force: true }))

  const git = (...args: string[]) => {
    const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' }
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'tag.gpgSign=false', ...args], { cwd: repo, env, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
    return result.stdout.trim()
  }
  const commit = (message: string) => git('commit', '--quiet', '--allow-empty', '--message', message)
  const tag = (name: string) => git('tag', '--annotate', name, '--message', name)

  const release = async () => {
    const env = { ...process.env, GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' }
    const notesFile = path.join(repo, '.git', 'notes.md')
    const result = spawnSync('bun', [path.join(root, 'scripts/release.mjs'), '--notes', notesFile], { cwd: repo, env, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`release failed: ${result.stderr}`)
    const tagged = result.stdout.trim()
    return { tag: tagged, notes: tagged ? await readFile(notesFile, 'utf8') : '' }
  }

  it('tags the first release 0.1.0 without a commit', async () => {
    commit('feat: the first feature')
    const head = git('rev-parse', 'HEAD')

    expect(await release()).toMatchObject({ tag: 'v0.1.0', notes: expect.stringContaining('the first feature') })
    expect(git('rev-parse', 'HEAD')).toBe(head)
    expect(git('describe', '--tags', '--exact-match')).toBe('v0.1.0')
    expect(git('status', '--porcelain')).toBe('')
  })

  it('bumps from the last tag: a feature or fix the patch and a breaking change the minor below 1.0', async () => {
    commit('feat: the first feature')
    tag('v0.1.0')
    commit('feat: a second feature')
    expect((await release()).tag).toBe('v0.1.1')
    commit('fix: a fix')
    expect((await release()).tag).toBe('v0.1.2')
    commit('feat!: a breaking change')
    expect(await release()).toMatchObject({ tag: 'v0.2.0', notes: expect.stringContaining('BREAKING CHANGES') })
  })

  it('bumps a maintenance branch from its own last tag, not from a newer one on another branch', async () => {
    commit('feat: the first feature')
    tag('v0.1.0')
    git('branch', 'maintenance')
    commit('feat!: a breaking change on main')
    tag('v0.2.0')
    git('checkout', '--quiet', 'maintenance')
    commit('fix: a fix on the maintenance branch')

    const { tag: released, notes } = await release()
    expect(released).toBe('v0.1.1')
    expect(notes).toContain('a fix on the maintenance branch')
    expect(notes).not.toContain('a breaking change on main')
  })

  it('cuts a patch on a maintenance branch whose next minor is taken, even for a feature or breaking change', async () => {
    commit('feat: the first feature')
    tag('v1.0.0')
    git('branch', 'maintenance')
    commit('feat: a feature on main')
    tag('v1.1.0')
    git('checkout', '--quiet', 'maintenance')
    commit('feat: a feature on the maintenance branch')
    expect(await release()).toMatchObject({ tag: 'v1.0.1', notes: expect.stringContaining('a feature on the maintenance branch') })
    commit('feat!: a breaking change on the maintenance branch')
    expect(await release()).toMatchObject({ tag: 'v1.0.2', notes: expect.stringContaining('BREAKING CHANGES') })
  })

  it('tags nothing without a fix, feature or breaking change, or when HEAD is a release already', async () => {
    commit('feat: the first feature')
    tag('v0.1.0')
    expect((await release()).tag).toBe('')
    commit('docs: only docs')
    expect((await release()).tag).toBe('')
    expect(git('tag', '--points-at', 'HEAD')).toBe('')
  })
})
