import { access, cp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

// .agents/skills is the folder Codex, Cursor, OpenCode and Amp read (and the `skills` CLI writes); Claude Code reads
// .claude/skills only. Copies, not symlinks: they work on Windows and survive node_modules being removed.
const targetFolders = ['.agents/skills/protobase', '.claude/skills/protobase']

const exists = (path: string) => access(path).then(() => true, () => false)

const isOurs = async (target: string) => {
  const text = await readFile(join(target, 'SKILL.md'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return /^---\n(?:[^\n]*\n)*?name: protobase\n/.test(text)
}

// Replaces the skill in the project's skill folders with the one in `source`. Returns the folders written. A folder
// that holds something other than this skill is not replaced: nothing is written then.
export async function installSkill(source: string, projectDir: string): Promise<string[]> {
  const targets = targetFolders.map((folder) => join(projectDir, folder))
  for (const target of targets) {
    if (!(await exists(target))) continue
    if (!(await isOurs(target))) throw new Error(`${target} holds a skill that is not protobase's; move it away to install the protobase skill`)
  }
  for (const target of targets) {
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
  }
  return targets
}
