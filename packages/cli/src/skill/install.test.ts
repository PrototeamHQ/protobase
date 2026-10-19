import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installSkill } from './install'

const skillText = (body: string) => `---\nname: protobase\ndescription: x\n---\n${body}\n`

async function fixture(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'skill-'))
  const source = join(dir, 'source')
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(source, name, '..'), { recursive: true })
    await writeFile(join(source, name), text)
  }
  const project = join(dir, 'project')
  await mkdir(project)
  return { source, project }
}

describe('installSkill', () => {
  it('copies the skill into both folders of an empty project', async () => {
    const { source, project } = await fixture({ 'SKILL.md': skillText('one'), 'references/a.md': 'a' })
    const written = await installSkill(source, project)
    expect(written).toEqual([join(project, '.agents/skills/protobase'), join(project, '.claude/skills/protobase')])
    for (const target of written) {
      expect(await readFile(join(target, 'SKILL.md'), 'utf8')).toBe(skillText('one'))
      expect(await readFile(join(target, 'references/a.md'), 'utf8')).toBe('a')
    }
  })

  it('drops the files of an earlier install that the source no longer has', async () => {
    const { source, project } = await fixture({ 'SKILL.md': skillText('new') })
    const old = join(project, '.claude/skills/protobase')
    await mkdir(join(old, 'references'), { recursive: true })
    await writeFile(join(old, 'SKILL.md'), skillText('old'))
    await writeFile(join(old, 'references/gone.md'), 'gone')
    await installSkill(source, project)
    expect(await readdir(old)).toEqual(['SKILL.md'])
    expect(await readFile(join(old, 'SKILL.md'), 'utf8')).toBe(skillText('new'))
  })

  it.each([['another skill', '---\nname: other\n---\n'], ['no SKILL.md', undefined]])('writes nothing when a folder holds %s', async (_, text) => {
    const { source, project } = await fixture({ 'SKILL.md': skillText('new') })
    const foreign = join(project, '.claude/skills/protobase')
    await mkdir(foreign, { recursive: true })
    await writeFile(join(foreign, text ? 'SKILL.md' : 'notes.md'), text ?? 'mine')
    await expect(installSkill(source, project)).rejects.toThrow(foreign)
    expect(await readdir(foreign)).toEqual([text ? 'SKILL.md' : 'notes.md'])
    await expect(readdir(join(project, '.agents'))).rejects.toThrow()
  })
})
