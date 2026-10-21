import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The deploy guide's compose template and commands are what self-hosters copy: these keep its safe defaults from
// drifting.
const guide = readFileSync(path.resolve(__dirname, '../../website/src/content/docs/guides/deploy.md'), 'utf8')
const section = guide.slice(guide.indexOf('## A self-hosted image'))
const compose = /```yaml\n([\s\S]*?)```/.exec(section)![1]!

// Each service's lines, by the two-space indentation of the template's `services:`.
const services = () => {
  const lines = compose.slice(0, compose.indexOf('\nconfigs:')).split('\n')
  const found: Record<string, string> = {}
  let name = ''
  for (const line of lines) {
    const start = /^ {2}([\w-]+):$/.exec(line)
    if (start) name = start[1]!
    else if (name) found[name] = `${found[name] ?? ''}${line}\n`
  }
  return found
}

// The entries of a service's `ports:` list.
const ports = (service: string) => {
  const list = /^ {4}ports:\n((?: {6}- .*\n)+)/m.exec(service)
  return list ? list[1]!.trim().split('\n').map((line) => line.trim().replace(/^- /, '').replaceAll('"', '')) : []
}

describe('the deploy guide\'s self-hosted template', () => {
  const { postgres, migrate, app } = services()

  it('has the postgres, migrate and app services', () => {
    expect(Object.keys(services()).sort()).toEqual(['app', 'migrate', 'postgres'])
  })

  it('publishes the app on the loopback interface only, and nothing else', () => {
    expect(ports(app!)).toEqual(['127.0.0.1:8787:8787'])
    expect(postgres).not.toContain('ports:')
    expect(migrate).not.toContain('ports:')
  })

  it('keeps the superuser password to postgres, and has the app and migrate log in as app', () => {
    expect(postgres).toContain('POSTGRES_PASSWORD')
    expect(compose.replace(postgres!, '')).not.toContain('POSTGRES_PASSWORD')
    const urls = [...compose.matchAll(/DATABASE_URL: (\S+)/g)].map((match) => match[1])
    expect(urls).toHaveLength(2)
    for (const url of urls) expect(url).toMatch(/^postgres:\/\/app:/)
  })

  it('gives migrate none of the app\'s settings', () => {
    expect(migrate).not.toContain('env_file')
  })

  it('refuses to start without the passwords and version', () => {
    for (const variable of ['POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'APP_VERSION']) {
      const uses = [...compose.matchAll(new RegExp(`\\$\\{${variable}([^}]*)\\}`, 'g'))]
      expect(uses.length, variable).toBeGreaterThan(0)
      for (const use of uses) expect(use[1], variable).toMatch(/^:\?/)
    }
  })

  it('runs every command in the app service without its dependencies, so none migrates under a running version', () => {
    const runs = [...section.matchAll(/docker compose run --rm[^`\n]*/g)].map((match) => match[0]).filter((command) => / app /.test(command))
    expect(runs.length).toBeGreaterThan(0)
    for (const command of runs) expect(command).toContain('--no-deps')
  })

  it('asks for HTTPS before the first admin is made', () => {
    const https = section.indexOf('put HTTPS in front')
    expect(https).toBeGreaterThan(0)
    expect(https).toBeLessThan(section.indexOf('### First admin'))
  })
})
