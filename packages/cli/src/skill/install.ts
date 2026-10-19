import { access, cp, readdir, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

// .agents/skills is the folder Codex, Cursor, OpenCode and Amp read (and the `skills` CLI writes); Claude Code reads
// .claude/skills only. Copies, not symlinks: they work on Windows and survive node_modules being removed.
const skillFolders = ['.agents/skills', '.claude/skills']

const exists = (path: string) => access(path).then(() => true, () => false)

const isSkill = async (target: string, name: string) => {
  const text = await readFile(join(target, 'SKILL.md'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return new RegExp(`^---\\n(?:[^\\n]*\\n)*?name: ${name}\\n`).test(text)
}

/** The skills in `skillsDir`, one folder each, by name. */
export const bundledSkills = async (skillsDir: string) =>
  (await readdir(skillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

// Replaces the skill in the project's skill folders with the one in `source`, named after its folder. Returns the
// folders written. A folder that holds something other than this skill is not replaced: nothing is written then.
export async function installSkill(source: string, projectDir: string): Promise<string[]> {
  const name = basename(source)
  const targets = skillFolders.map((folder) => join(projectDir, folder, name))
  for (const target of targets) {
    if (!(await exists(target))) continue
    if (!(await isSkill(target, name))) throw new Error(`${target} holds a skill other than ${name}; move it away to install the ${name} skill`)
  }
  for (const target of targets) {
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
  }
  return targets
}
