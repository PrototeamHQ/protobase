import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { askDir } from './ask-dir'
import { askPreset } from './ask-preset'
import { createProject } from './create-project'
import { freePort } from './free-port'
import { defaultPort } from './local-database'
import { nextSteps } from './next-steps'
import { checkPreset, defaultPreset, presetNames } from './presets'
import { findTools } from './tools'

// The build writes one folder per preset beside this module in dist/.
const templatesDir = path.join(import.meta.dirname, 'templates')

const usage = 'usage: npm create protobase <dir> [-- --preset <name>]'

type Question = (text: string) => Promise<string>

// npm reads an option before `--` as its own and passes its environment as npm_config_<name>: `--preset erp` reaches
// this script as the positional `erp`, so a stray npm_config_preset says the `--` is missing.
const checkNpmPreset = (flag: string | undefined) => {
  if (flag !== undefined || process.env.npm_config_preset === undefined) return
  throw new Error('npm took --preset for itself: put -- before it, as in npm create protobase my-app -- --preset erp')
}

// The positional folder, else the terminal's answer.
const pickDir = async (positionals: string[], question: Question | undefined) => {
  const [dir, ...extra] = positionals
  if (extra.length > 0) throw new Error(usage)
  if (dir) return dir
  if (question) return askDir(question)
  throw new Error(usage)
}

// The flag's preset, else the terminal's answer, else the default without waiting for input.
const pickPreset = async (flag: string | undefined, question: Question | undefined) => {
  const names = presetNames(templatesDir)
  if (flag !== undefined) return checkPreset(names, flag)
  if (question) return askPreset(names, question)
  return defaultPreset
}

// One prompt for every question in a terminal, so none reads the answers typed ahead for the next; none without one.
const pick = async (positionals: string[], flag: string | undefined) => {
  const terminal = process.stdin.isTTY && process.stdout.isTTY
  const prompt = terminal ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
  const question = prompt && ((text: string) => prompt.question(text))
  try {
    return { dir: await pickDir(positionals, question), preset: await pickPreset(flag, question) }
  } finally {
    prompt?.close()
  }
}

const create = async (argv: string[]) => {
  const options = { preset: { type: 'string' } } as const
  const { values, positionals } = parseArgs({ args: argv.slice(2), allowPositionals: true, options })
  checkNpmPreset(values.preset)
  const { dir, preset } = await pick(positionals, values.preset)
  const port = await freePort(defaultPort)
  const secret = randomBytes(32).toString('base64')
  const { scripts } = createProject(path.join(templatesDir, preset), path.resolve(dir), { port, secret })
  const steps = nextSteps(dir, scripts, port, findTools())
  process.stdout.write(`Created a Protobase project in ${dir} from the ${preset} preset. Next:\n\n${steps}`)
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
