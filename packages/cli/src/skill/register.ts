import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Command } from 'commander'
import { protobaseVersion } from '../version/version'
import { bundledSkills, installSkill } from './install'

// The skills ship in @protobase/cli (skills/<name>), so the path from this file is the same in source and in dist.
const skillsDir = fileURLToPath(new URL('../../skills', import.meta.url))

export function registerSkill(program: Command) {
  const skill = program.command('skill').description('the protobase agent skills')
  skill
    .command('install [name]')
    .description("copy the agent skills of this CLI's version, or only the one named, into the project's .agents/skills and .claude/skills")
    .action(async (name: string | undefined) => {
      const skills = await bundledSkills(skillsDir)
      if (name && !skills.includes(name)) throw new Error(`no skill named ${name}; this CLI ships ${skills.join(', ')}`)
      const projectDir = process.cwd()
      for (const skillName of name ? [name] : skills) {
        const written = await installSkill(join(skillsDir, skillName), projectDir)
        const folders = written.map((target) => target.slice(projectDir.length + 1))
        process.stdout.write(`${skillName} skill ${protobaseVersion} → ${folders.join(', ')}\n`)
      }
    })
}
