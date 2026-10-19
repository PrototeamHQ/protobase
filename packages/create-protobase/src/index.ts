import path from 'node:path'
import { parseArgs } from 'node:util'
import { createProject } from './create-project'
import { nextSteps } from './next-steps'

// The build writes it beside this module in dist/.
const templateDir = path.join(import.meta.dirname, 'template')

const usage = 'usage: npm create protobase <dir>'

const create = (argv: string[]) => {
  const { positionals } = parseArgs({ args: argv.slice(2), allowPositionals: true })
  const [dir, ...extra] = positionals
  if (!dir || extra.length > 0) throw new Error(usage)
  createProject(templateDir, path.resolve(dir))
  process.stdout.write(`Created a Protobase project in ${dir}. Next:\n\n${nextSteps(dir)}`)
}

// Central error handler: the user sees one line.
export const run = (argv: string[]) => {
  try {
    create(argv)
  } catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n`)
    process.exitCode = 1
  }
}
