import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { missing } from './missing'

const llms = '# Protobase\n\n- [protobase skill](https://docs.protobase.net/skills/protobase/SKILL.md): skill\n- [CLI](https://docs.protobase.net/reference/cli.md): cli\n'
const skill = 'See [CLI](references/reference/cli.md#doctor) and the [API](https://docs.protobase.net/api/schema/).\n'
const site = {
  'llms.txt': llms,
  'reference/cli.md': 'cli',
  'skills/protobase/SKILL.md': skill,
  'skills/protobase/references/reference/cli.md': 'cli',
}

let dist: string
afterEach(() => rm(dist, { recursive: true, force: true }))

async function build(files: Record<string, string>) {
  dist = await mkdtemp(join(tmpdir(), 'docs-dist-'))
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(dist, file)), { recursive: true })
    await writeFile(join(dist, file), text)
  }
  return dist
}

const without = (file: string) => Object.fromEntries(Object.entries(site).filter(([name]) => name !== file))

describe('missing', () => {
  it('finds nothing on a site with llms.txt, the skill and what they link', async () => {
    expect(missing(await build(site))).toEqual([])
  })

  it('finds a missing llms.txt', async () => {
    expect(missing(await build(without('llms.txt')))).toEqual(['/llms.txt'])
  })

  it('finds a missing SKILL.md that llms.txt links', async () => {
    expect(missing(await build(without('skills/protobase/SKILL.md')))).toEqual(['/skills/protobase/SKILL.md'])
  })

  it('finds a missing page that llms.txt links', async () => {
    expect(missing(await build(without('reference/cli.md')))).toEqual(['/reference/cli.md'])
  })

  it('finds a missing reference that SKILL.md links', async () => {
    expect(missing(await build(without('skills/protobase/references/reference/cli.md')))).toEqual(['/skills/protobase/references/reference/cli.md'])
  })

  it('finds an llms.txt that does not link SKILL.md', async () => {
    expect(missing(await build({ ...site, 'llms.txt': '# Protobase\n' }))).toEqual(['a link to SKILL.md in /llms.txt'])
  })
})
