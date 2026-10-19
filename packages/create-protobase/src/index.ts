import path from 'node:path'
import { parseArgs } from 'node:util'
import { askPreset } from './ask-preset'
import { createProject } from './create-project'
import { nextSteps } from './next-steps'
import { checkPreset, defaultPreset, presetNames } from './presets'

// The build writes one folder per preset beside this module in dist/.
const templatesDir = path.join(import.meta.dirname, 'templates')

const usage = 'usage: npm create protobase <dir> [-- --preset <name>]'

// The flag's preset, else the terminal's answer, else the default without waiting for input.
const pickPreset = async (flag: string | undefined) => {
  const names = presetNames(templatesDir)
  if (flag !== undefined) return checkPreset(names, flag)
  if (process.stdin.isTTY && process.stdout.isTTY) return askPreset(names)
  return defaultPreset
}

const create = async (argv: string[]) => {
  const { values, positionals } = parseArgs({ args: argv.slice(2), allowPositionals: true, options: { preset: { type: 'string' } } })
  const [dir, ...extra] = positionals
  if (!dir || extra.length > 0) throw new Error(usage)
  const preset = await pickPreset(values.preset)
  const { scripts } = createProject(path.join(templatesDir, preset), path.resolve(dir))
  process.stdout.write(`Created a Protobase project in ${dir} from the ${preset} preset. Next:\n\n${nextSteps(dir, scripts ?? {})}`)
}

// Central error handler: the user sees one line.
export const run = async (argv: string[]) => {
  try {
    await create(argv)
  } catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n`)
    process.exitCode = 1
  }
}
