import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledSkills, installSkill } from './install'

const skillText = (body: string, name = 'protobase') => `---\nname: ${name}\ndescription: x\n---\n${body}\n`

async function fixture(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'skill-'))
  const source = join(dir, 'skills/protobase')
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

  it('names the folders after the skill and leaves the other skills alone', async () => {
    const { source, project } = await fixture({ 'SKILL.md': skillText('one') })
    const cloudSource = join(source, '../protobase-cloud')
    await mkdir(cloudSource)
    await writeFile(join(cloudSource, 'SKILL.md'), skillText('cloud', 'protobase-cloud'))
    await installSkill(source, project)
    const written = await installSkill(cloudSource, project)
    expect(written).toEqual([join(project, '.agents/skills/protobase-cloud'), join(project, '.claude/skills/protobase-cloud')])
    expect(await readdir(join(project, '.claude/skills'))).toEqual(['protobase', 'protobase-cloud'])
    expect(await readFile(join(project, '.claude/skills/protobase/SKILL.md'), 'utf8')).toBe(skillText('one'))
  })

  it('refuses a folder holding a skill whose name only starts with the same name', async () => {
    const { source, project } = await fixture({ 'SKILL.md': skillText('new') })
    const foreign = join(project, '.claude/skills/protobase')
    await mkdir(foreign, { recursive: true })
    await writeFile(join(foreign, 'SKILL.md'), skillText('mine', 'protobase-cloud'))
    await expect(installSkill(source, project)).rejects.toThrow(foreign)
  })
})

describe('bundledSkills', () => {
  it('lists the skill folders by name', async () => {
    const { source } = await fixture({ 'SKILL.md': skillText('one'), '../zeta/SKILL.md': 'z', '../notes.md': 'n' })
    expect(await bundledSkills(join(source, '..'))).toEqual(['protobase', 'zeta'])
  })
})
