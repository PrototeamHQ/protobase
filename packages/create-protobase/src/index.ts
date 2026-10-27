import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { askDir } from './ask-dir'
import { askPreset } from './ask-preset'
import { createProject } from './create-project'
import { databaseSteps } from './database-steps'
import { createFromDatabase } from './database-wizard'
import { freePort } from './free-port'
import { defaultPort } from './local-database'
import { nextSteps } from './next-steps'
import { checkPreset, defaultPreset, presetNames } from './presets'
import { openTerminal, type ProcessTerminal } from './terminal'
import { findTools } from './tools'

// The build writes one folder per preset beside this module in dist/.
const templatesDir = path.join(import.meta.dirname, 'templates')

const usage = 'usage: npm create protobase [<dir>] [<postgres-url>] [-- --preset <name>]'

const isDatabaseUrl = (value: string) => /^postgres(ql)?:\/\//.test(value)

const newSecret = () => randomBytes(32).toString('base64')

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

// A project from a preset, with a Postgres of its own in Docker.
const fromPreset = async (positionals: string[], flag: string | undefined, terminal: ProcessTerminal) => {
  const dir = await pickDir(positionals, terminal.ask)
  const preset = await pickPreset(flag, terminal.ask)
  terminal.closePrompt()
  const port = await freePort(defaultPort)
  const { scripts } = createProject(path.join(templatesDir, preset), path.resolve(dir), { secret: newSecret(), database: { port } })
  const steps = nextSteps(dir, scripts, port, findTools())
  terminal.print(`Created a Protobase project in ${dir} from the ${preset} preset. Next:\n\n${steps}`)
}

// A project from scratch on the existing database at `url`, which the wizard asks how to import.
const fromDatabase = async (url: string, positionals: string[], flag: string | undefined, terminal: ProcessTerminal) => {
  if (flag !== undefined && flag !== defaultPreset) throw new Error(`a project on an existing database starts from ${defaultPreset}: leave out --preset`)
  const [dir, ...extra] = positionals
  if (extra.length > 0) throw new Error(usage)
  const steps = databaseSteps({ templateDir: path.join(templatesDir, defaultPreset), secret: newSecret(), tools: findTools(), terminal })
  await createFromDatabase(url, dir, terminal, steps)
}

const create = async (argv: string[]) => {
  const options = { preset: { type: 'string' } } as const
  const { values, positionals } = parseArgs({ args: argv.slice(2), allowPositionals: true, options })
  checkNpmPreset(values.preset)
  const url = positionals.find(isDatabaseUrl)
  const terminal = openTerminal()
  try {
    if (url) await fromDatabase(url, positionals.filter((each) => each !== url), values.preset, terminal)
    else await fromPreset(positionals, values.preset, terminal)
  } finally {
    terminal.closePrompt()
  }
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
