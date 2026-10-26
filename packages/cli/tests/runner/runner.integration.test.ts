import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Bun keeps the modules it imported, so this runs the runner in a Bun process of its own, where a project file that
// changed between two commands is the file the second one reads; Vitest's module runner would load it afresh anyway.
const runner = path.resolve(import.meta.dirname, '../../src/runner.ts')
let dir: string

beforeAll(async () => {
  dir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-runner-')))
  await mkdir(path.join(dir, 'config'))
})

afterAll(() => rm(dir, { recursive: true, force: true }))

it('runs each command on the project files as they are when it starts', async () => {
  const index = path.join(dir, 'config', 'index.ts')
  const script = path.join(dir, 'run-twice.ts')
  await writeFile(index, 'export {}\n')
  await writeFile(
    script,
    `import { writeFileSync } from 'node:fs'
import { runCommand } from ${JSON.stringify(runner)}
const options = { cwd: ${JSON.stringify(dir)}, env: { DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' } }
const first = await runCommand(['doctor'], options)
writeFileSync(${JSON.stringify(index)}, "throw new Error('the second version')\\n")
const second = await runCommand(['doctor'], options)
process.stdout.write(JSON.stringify([first.stderr, second.stderr]))
`,
  )
  const { stdout } = await promisify(execFile)('bun', [script], { cwd: dir })
  expect(JSON.parse(stdout)).toEqual([`error: No resources exported from ${path.join(dir, 'config')}/index.ts\n`, 'error: the second version\n'])
}, 60_000)
