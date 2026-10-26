import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The deploy guide's compose template and commands are what self-hosters copy: these keep its safe defaults from
// drifting.
const docs = path.resolve(__dirname, '../../website/src/content/docs')
const guide = readFileSync(path.join(docs, 'guides/deploy.md'), 'utf8')
const auth = readFileSync(path.join(docs, 'reference/auth.md'), 'utf8')
const cli = readFileSync(path.join(docs, 'reference/cli.md'), 'utf8')
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

  it('trusts the compose network\'s gateway, and only it, as the proxy', () => {
    const subnet = /^ +- subnet: (\S+)$/m.exec(compose)![1]!
    const gateway = /^ +gateway: (\S+)$/m.exec(compose)![1]!
    expect(subnet).toMatch(/^\d+\.\d+\.\d+\.0\/24$/)
    expect(gateway.split('.').slice(0, 3)).toEqual(subnet.split('.').slice(0, 3))
    const trusted = [...section.matchAll(/^PROTOBASE_TRUSTED_PROXIES=(.*)$/gm)].map((match) => match[1])
    expect(trusted).toEqual([gateway])
    expect(section).toContain('(see [Client addresses](/reference/auth/#client-addresses))')
  })

  it('tells the operator to move the gateway in app.env along with a taken subnet', () => {
    expect(section).toMatch(/Pool overlaps[^\n]*change the gateway in `app\.env`/)
  })

  it('has the HTTPS proxy forward to the published port, append the client\'s address and apply the https address', () => {
    const firstAdmin = section.indexOf('### First admin')
    const caddyfile = /```\n([^`]*reverse_proxy[^`]*)```/.exec(section)!
    expect(caddyfile[1]).toContain('reverse_proxy 127.0.0.1:8787')
    expect(caddyfile.index).toBeLessThan(firstAdmin)
    const after = section.slice(caddyfile.index, firstAdmin)
    expect(after).toMatch(/PROTOBASE_URL=https:\/\/[^`]*` in `app\.env` and run `docker compose up -d`/)
    expect(after).toMatch(/append the client's address to `X-Forwarded-For` \(see \[Client addresses\]\(\/reference\/auth\/#client-addresses\)\)/)
  })

  it('has the first admin sign in at the https address once the proxy is in front', () => {
    const firstAdmin = section.slice(section.indexOf('### First admin'), section.indexOf('### Upgrade'))
    expect(firstAdmin).toMatch(/open the address in `PROTOBASE_URL`[^\n]*`https:\/\/app\.example\.com` once the proxy is in front/)
  })
})

describe('the docs\' runtime examples', () => {
  it('publish the runtime on the loopback interface only', () => {
    for (const [name, page] of Object.entries({ guide, auth, cli })) {
      const publishes = [...page.matchAll(/docker run [^\n]*?-p ([^\s`]+)/g)].map((match) => match[1])
      expect(publishes, name).toEqual(['127.0.0.1:8787:8787'])
    }
    // Any other page: every published 8787 binds loopback, but for the deploy guide's warning against `8787:8787`.
    const pages = readdirSync(docs, { recursive: true, encoding: 'utf8' }).filter((file) => /\.mdx?$/.test(file))
    for (const file of pages) {
      const page = readFileSync(path.join(docs, file), 'utf8')
      const open = [...page.matchAll(/(.{0,16})\b8787:8787/g)].filter((match) => !/127\.0\.0\.1:$|port to `$/.test(match[1]!))
      expect(open.map((match) => match[0]), file).toEqual([])
    }
  })

  it('trust a single proxy address, never a range that covers the clients', () => {
    const row = /^\| `PROTOBASE_TRUSTED_PROXIES` \|.*$/m.exec(auth)![0]
    expect(row).toContain('such as `172.30.87.1`')
    expect(auth).not.toMatch(/172\.16\.0\.0\/12|192\.168\.0\.0\/16/)
    expect(auth).toContain('a range must not cover the clients themselves, or they all share the one limit again')
  })
})
