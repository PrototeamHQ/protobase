import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFunctions } from './write-functions'

let projectDir: string

const put = async (file: string, text: string) => {
  await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
  await writeFile(path.join(projectDir, file), text)
}

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-functions-'))
})

afterEach(() => rm(projectDir, { recursive: true, force: true }))

describe('writeFunctions', () => {
  it('writes the files and adds the packages package.json lacks, with the jsr registry when one comes from jsr', async () => {
    await put('package.json', '{ "name": "app", "dependencies": { "zod": "^4.1.0" } }')
    const added = await writeFunctions(projectDir, {
      files: [{ path: 'functions/hello/index.ts', content: 'export default {}\n' }],
      functions: [{ name: 'hello', public: false }],
      packages: [{ name: 'zod', range: '4' }, { name: '@std/assert', range: 'npm:@jsr/std__assert@1' }],
      left: [],
    })
    expect(added).toEqual([{ name: '@std/assert', range: 'npm:@jsr/std__assert@1' }])
    expect(await readFile(path.join(projectDir, 'functions/hello/index.ts'), 'utf8')).toBe('export default {}\n')
    expect(JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'))).toEqual({ name: 'app', dependencies: { zod: '^4.1.0', '@std/assert': 'npm:@jsr/std__assert@1' } })
    expect(await readFile(path.join(projectDir, '.npmrc'), 'utf8')).toBe('@jsr:registry=https://npm.jsr.io\n')
  })
})
