import { fileURLToPath } from 'node:url'
import type { Command } from 'commander'
import { protobaseVersion } from '../version/version'
import { installSkill } from './install'

// The skill ships in @protobase/cli (skills/protobase), so the path from this file is the same in source and in dist.
const skillSource = fileURLToPath(new URL('../../skills/protobase', import.meta.url))

export function registerSkill(program: Command) {
  const skill = program.command('skill').description('the protobase agent skill')
  skill
    .command('install')
    .description("copy the protobase agent skill of this CLI's version into the project's .agents/skills and .claude/skills")
    .action(async () => {
      const projectDir = process.cwd()
      const written = await installSkill(skillSource, projectDir)
      const folders = written.map((target) => target.slice(projectDir.length + 1))
      process.stdout.write(`protobase skill ${protobaseVersion} → ${folders.join(', ')}\n`)
    })
}
