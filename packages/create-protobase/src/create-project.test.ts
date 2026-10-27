import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject } from './create-project'

const example = 'DATABASE_URL=postgres://protobase:protobase@localhost:55432/scratch\nPROTOBASE_SECRET=change-me\n'

const template = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'create-protobase-template-'))
  mkdirSync(path.join(dir, 'config'))
  writeFileSync(path.join(dir, 'config', 'index.ts'), 'export default []\n')
  writeFileSync(path.join(dir, '_.gitignore'), 'node_modules\n')
  writeFileSync(path.join(dir, '_bunfig.toml'), '[run]\n')
  writeFileSync(path.join(dir, '.env.example'), example)
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch', private: true, scripts: { dev: 'protobase dev' } }))
  return dir
}

const target = (name: string) => path.join(mkdtempSync(path.join(tmpdir(), 'create-protobase-')), name)
const settings = { secret: 's3cret', database: { port: 55432 } }
const read = (dir: string, file: string) => readFileSync(path.join(dir, file), 'utf8')

describe('createProject', () => {
  it('copies the template, names the package after the folder and drops the leading _ of the files packing would leave out', () => {
    const dir = target('my-app')
    createProject(template(), dir, settings)
    expect(read(dir, 'config/index.ts')).toBe('export default []\n')
    expect(read(dir, '.gitignore')).toBe('node_modules\n')
    expect(read(dir, 'bunfig.toml')).toBe('[run]\n')
    expect(JSON.parse(read(dir, 'package.json')).name).toBe('my-app')
  })

  it('adds the scripts that start and stop its Postgres beside the preset ones', () => {
    const dir = target('scripts')
    const manifest = createProject(template(), dir, settings)
    expect(manifest.scripts).toEqual({ 'db:up': 'docker compose up -d --wait', 'db:down': 'docker compose down', dev: 'protobase dev' })
    expect(JSON.parse(read(dir, 'package.json'))).toEqual(manifest)
  })

  it('writes a .env with the secret and a docker-compose.yml, both on the port', () => {
    const dir = target('env')
    createProject(template(), dir, { secret: 's3cret', database: { port: 55434 } })
    expect(read(dir, '.env.example')).toBe(example.replace('55432', '55434'))
    expect(read(dir, '.env')).toBe('DATABASE_URL=postgres://protobase:protobase@localhost:55434/scratch\nPROTOBASE_SECRET=s3cret\n')
    expect(read(dir, 'docker-compose.yml')).toContain("- '55434:5432'")
  })

  it('on an existing database, writes its URL to .env, without the password to .env.example, and no Postgres of its own', () => {
    const dir = target('existing')
    const url = 'postgres://shop:s3cret@db.example.com:5432/shop'
    const manifest = createProject(template(), dir, { secret: 'abc', database: { url } })
    expect(manifest.scripts).toEqual({ dev: 'protobase dev' })
    expect(read(dir, '.env')).toBe(`DATABASE_URL=${url}\nPROTOBASE_SECRET=abc\n`)
    expect(read(dir, '.env.example')).toBe('DATABASE_URL=postgres://shop@db.example.com:5432/shop\nPROTOBASE_SECRET=change-me\n')
    expect(existsSync(path.join(dir, 'docker-compose.yml'))).toBe(false)
  })

  it('writes into an empty folder that exists', () => {
    const dir = target('empty')
    mkdirSync(dir)
    createProject(template(), dir, settings)
    expect(JSON.parse(read(dir, 'package.json')).name).toBe('empty')
  })

  it('refuses a folder that is not empty', () => {
    const dir = target('taken')
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'notes.txt'), 'mine')
    expect(() => createProject(template(), dir, settings)).toThrow(`${dir} is not empty`)
    expect(existsSync(path.join(dir, 'package.json'))).toBe(false)
  })
})
