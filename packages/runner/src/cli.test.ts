import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from './app'
import { cli } from './cli'
import { configPath, readConfig, settingsOf } from './config'
import { appKey, buildArgs, engine, findEngine, imageTag } from './engine'
import { fakeExec, testSettings } from './testing/fakes'

const removals: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const remove of removals.splice(0)) await remove()
})

const found = { cpus: 8, engine: 'docker' as const, builds: true, workDir: '/var/cache/runner' }

describe("the runner's settings", () => {
  it('default to half the CPUs in slots, and per job 2 CPUs, 2048 MB, 256 processes and 256 MB of /tmp', () => {
    expect(settingsOf({}, found)).toEqual({ slots: 4, cpus: 2, memory_mb: 2048, pids: 256, tmp_mb: 256, work_dir: '/var/cache/runner', engine: 'docker', build: true, build_timeout_seconds: 1800 })
    expect(settingsOf({}, { ...found, cpus: 1 }).slots).toBe(1)
    expect(settingsOf({ slots: '3', cpus: '0.5', memory_mb: '512', engine: 'podman', build: 'false' }, found)).toMatchObject({ slots: 3, cpus: 0.5, memory_mb: 512, engine: 'podman', build: false })
  })

  it('refuse a value that is not one, naming its flag; build takes true or false only', () => {
    expect(() => settingsOf({ slots: '0' }, found)).toThrow('--slots is a whole number above 0')
    expect(() => settingsOf({ memory_mb: '2g' }, found)).toThrow('--memory-mb is a whole number above 0')
    expect(() => settingsOf({ cpus: '-1' }, found)).toThrow('--cpus is a number above 0')
    expect(() => settingsOf({ engine: 'lxc' }, found)).toThrow('--engine is docker or podman')
    for (const build of ['yes', '1', 'True']) expect(() => settingsOf({ build }, found)).toThrow('--build is true or false')
  })
})

describe("the runner's images", () => {
  it('are named by app, tenant and step, so two apps or tenants never share one, and labelled with their step and app', () => {
    const app = { url: 'https://app.example.com', tenant: '1' }
    expect(imageTag(app, 'custom:ocr:4')).toMatch(/^protobase-custom-[0-9a-f]{16}:4$/)
    expect(imageTag(app, 'custom:ocr:4').split(':')[0]).toBe(imageTag(app, 'custom:ocr:5').split(':')[0])
    expect(imageTag(app, 'custom:ocr:4')).not.toBe(imageTag({ ...app, tenant: '2' }, 'custom:ocr:4'))
    expect(imageTag(app, 'custom:ocr:4')).not.toBe(imageTag({ ...app, url: 'https://other.example.com' }, 'custom:ocr:4'))
    expect(() => imageTag(app, 'app:http')).toThrow()
    expect(buildArgs({ tag: 't:1', step: 'custom:ocr:1', app: 'abc', dockerfile: '/b/Dockerfile', context: '/b/context' })).toEqual(['build', '--tag', 't:1', '--label', 'org.protobase.step=custom:ocr:1', '--label', 'org.protobase.app=abc', '--file', '/b/Dockerfile', '/b/context'])
  })

  it("are listed by their step label, only the app's own", async () => {
    const { exec, ran } = fakeExec((one) => (one.args[1] === 'ls' ? { stdout: 'a1\nb2\na1\n' } : { stdout: 'custom:ocr:1\ncustom:resize:2\n\n' }))
    expect(await engine(exec, 'podman').images('abc')).toEqual(['custom:ocr:1', 'custom:resize:2'])
    expect(ran.map((one) => [one.command, ...one.args])).toEqual([
      ['podman', 'image', 'ls', '--filter', 'label=org.protobase.app=abc', '--format', '{{.ID}}'],
      ['podman', 'image', 'inspect', '--format', '{{index .Config.Labels "org.protobase.step"}}', 'a1', 'b2'],
    ])
    expect(appKey({ url: 'https://app.example.com', tenant: null })).toMatch(/^[0-9a-f]{16}$/)
  })

  it('are run by Docker, else Podman, whichever works for the user', async () => {
    expect(await findEngine(fakeExec().exec)).toEqual({ engine: 'docker', builds: true })
    expect(await findEngine(fakeExec((one) => (one.command === 'docker' ? { code: 127 } : {})).exec)).toEqual({ engine: 'podman', builds: true })
    expect(await findEngine(fakeExec(() => ({ code: 1 })).exec)).toBeUndefined()
  })
})

describe("the runner's command line", () => {
  it('registers with the one-time token, keeping its own token and settings readable by its user only', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const env = { XDG_CONFIG_HOME: path.join(settings.work_dir, 'config'), XDG_CACHE_HOME: path.join(settings.work_dir, 'cache') }
    const sent: unknown[] = []
    const fetch: Fetch = async (url, init) => {
      sent.push([url, JSON.parse(String(init.body))])
      return Response.json({ runner: { id: 'r1', name: 'Builder', labels: [], tenant: '1' }, token: 'pbr_own' })
    }
    const said = await cli(['register', '--url', 'https://app.example.com/', '--token', 'pbr_once_x', '--slots', '3', '--build', 'false'], { exec: fakeExec().exec, env, say: () => {}, fetch })
    expect(said).toMatch(/^Registered as Builder \(r1\), running 3 jobs at once with docker; its config is /)
    expect(sent).toEqual([['https://app.example.com/api/runners/v1/register', { token: 'pbr_once_x', platform: expect.stringMatching(/^linux\//), kinds: ['container'] }]])
    const file = configPath(env)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readConfig(file)).toEqual({
      url: 'https://app.example.com',
      api_path: '/api',
      token: 'pbr_own',
      runner: { id: 'r1', name: 'Builder', tenant: '1' },
      settings: expect.objectContaining({ slots: 3, build: false, engine: 'docker', work_dir: path.join(env.XDG_CACHE_HOME, 'protobase-runner') }),
    })
  })

  it("reaches the app's runner API under the path its basePath gives its system endpoints", async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const env = { XDG_CONFIG_HOME: path.join(settings.work_dir, 'config') }
    const urls: string[] = []
    const fetch: Fetch = async (url) => {
      urls.push(url)
      return url.endsWith('/claim') ? new Response('{}', { status: 401 }) : Response.json({ runner: { id: 'r1', name: 'Builder', labels: [], tenant: null }, token: 'pbr_own' })
    }
    await cli(['register', '--url', 'https://app.example.com', '--api-path', '/backend/', '--token', 'pbr_once_x'], { exec: fakeExec().exec, env, say: () => {}, fetch })
    expect((await readConfig(configPath(env))).api_path).toBe('/backend')
    await expect(cli(['run'], { exec: fakeExec().exec, env, say: () => {}, fetch })).rejects.toThrow(/revoked or deleted/)
    expect(urls).toEqual(['https://app.example.com/backend/runners/v1/register', 'https://app.example.com/backend/runners/v1/claim'])
    await expect(cli(['register', '--url', 'https://app.example.com', '--api-path', 'backend', '--token', 'pbr_once_x'], { exec: fakeExec().exec, env, say: () => {}, fetch })).rejects.toThrow('--api-path is a path such as /api')
  })

  it('takes an app address on https, or on http only on this machine, as its token travels on it', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const env = { XDG_CONFIG_HOME: path.join(settings.work_dir, 'config') }
    const fetch: Fetch = async () => Response.json({ runner: { id: 'r1', name: 'Builder', labels: [], tenant: null }, token: 'pbr_own' })
    const register = (url: string) => cli(['register', '--url', url, '--token', 'pbr_once_x'], { exec: fakeExec().exec, env, say: () => {}, fetch })
    for (const url of ['https://app.example.com', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.8.9.10', 'http://[::1]:3000']) await expect(register(url)).resolves.toMatch(/^Registered/)
    for (const url of ['http://app.example.com', 'http://10.0.0.5:3000', 'http://128.0.0.1', 'http://localhost.example.com']) await expect(register(url)).rejects.toThrow(/--url is https:\/\/: the runner's token travels on it, so http is only for this machine itself \(localhost, 127\.0\.0\.0\/8 or ::1\)/)
    await expect(register('ftp://app.example.com')).rejects.toThrow('--url is the app\'s address')
    // A config written by hand with such an address is refused before any call
    const file = configPath(env)
    await writeFile(file, JSON.stringify({ ...(await readConfig(file)), url: 'http://app.example.com' }))
    await expect(cli(['run'], { exec: fakeExec().exec, env, say: () => {}, fetch })).rejects.toThrow(/http is only for this machine itself .*; register again$/)
  })

  it('probes the engine its settings name for builds, not the first that works', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const env = { XDG_CONFIG_HOME: path.join(settings.work_dir, 'config') }
    const fetch: Fetch = async (_, init) => Response.json({ runner: { id: 'r1', name: 'Builder', labels: [], tenant: null }, token: 'pbr_own', kinds: JSON.parse(String(init.body)).kinds })
    // Docker builds here, Podman does not
    const { exec, ran } = fakeExec((one) => (one.command === 'podman' && one.args[0] === 'build' ? { code: 125 } : {}))
    await cli(['register', '--url', 'https://app.example.com', '--token', 'pbr_once_x', '--engine', 'podman'], { exec, env, say: () => {}, fetch })
    expect((await readConfig(configPath(env))).settings).toMatchObject({ engine: 'podman', build: false })
    expect(ran.map((one) => one.command)).toEqual(['podman', 'podman'])
    await expect(cli(['register', '--url', 'https://app.example.com', '--token', 'pbr_once_x', '--engine', 'podman'], { exec: fakeExec((one) => (one.command === 'podman' ? { code: 127 } : {})).exec, env, say: () => {}, fetch })).rejects.toThrow('podman does not work for this user')
    expect(await findEngine(fakeExec().exec, 'podman')).toEqual({ engine: 'podman', builds: true })
  })

  it('refuses an unknown option, a missing token and running unregistered', async () => {
    const input = { exec: fakeExec().exec, env: { XDG_CONFIG_HOME: '/nonexistent/protobase-runner-test' }, say: () => {} }
    await expect(cli(['register', '--url', 'https://app.example.com', '--token', 'pbr_once_x', '--gpu', 'true'], input)).rejects.toThrow('--gpu is not an option of register')
    await expect(cli(['register', '--url', 'https://app.example.com'], input)).rejects.toThrow('one-time registration token')
    await expect(cli(['run'], input)).rejects.toThrow('No runner is registered here')
    expect(await cli(['version'], input)).toMatch(/^\d+\.\d+\.\d+/)
  })
})
