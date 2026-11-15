import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunnerOrder } from '@protobase/workflows'
import { appClient, type Fetch } from './app'
import { engine, imageTag } from './engine'
import { kinds, platform, runLoop } from './loop'
import { convertJob, fakeExec, mounts, testSettings } from './testing/fakes'

const identity = { url: 'https://app.example.com', tenant: null }
const tag = imageTag(identity, 'custom:ffmpeg_convert:1')
const removals: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const remove of removals.splice(0)) await remove()
})

type Sent = { method: string; path: string; authorization: string | null; type: string | null; body: string }

/** The app's runner API for the tests: it answers claims with `orders` in turn, then holds the last until aborted. */
const fakeServer = (orders: RunnerOrder[], completed: () => void) => {
  const sent: Sent[] = []
  const fetch: Fetch = async (url, init) => {
    const { pathname } = new URL(url)
    const body = init.body === undefined || init.body === null ? '' : await new Response(init.body as BodyInit).text()
    const headers = new Headers(init.headers)
    sent.push({ method: init.method ?? 'GET', path: pathname, authorization: headers.get('authorization'), type: headers.get('content-type'), body })
    const json = (value: unknown) => Response.json(value)
    if (pathname.endsWith('/claim')) {
      const order = orders.shift()
      if (order) return json(order)
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    }
    if (pathname.endsWith('/heartbeat')) return json({ stop: false })
    if (pathname.endsWith('/complete')) {
      completed()
      return json({})
    }
    if (pathname.includes('/inputs/')) return new Response('input bytes')
    if (pathname.includes('/outputs/')) return json({ configuration: 'videos', path: 'runs/x/clip.mp4', name: 'clip.mp4', type: 'video/mp4', size: body.length })
    return json({})
  }
  return { fetch, sent }
}

describe("the runner's loop", () => {
  it('prepares the image it is told to, says it has it, then runs the job it claims, over the app\'s runner API', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    let built = false
    const { exec, ran } = fakeExec(async (one) => {
      const [first, second] = one.args
      if (first === 'image' && second === 'ls') return { stdout: built ? 'f00d\n' : '' }
      if (first === 'image' && second === 'inspect' && one.args.includes('{{.Id}}')) return built ? { stdout: 'sha256:f00d\n' } : { code: 1 }
      if (first === 'image' && second === 'inspect') return { stdout: 'custom:ffmpeg_convert:1\n' }
      if (first === 'build') built = true
      if (first !== 'run') return {}
      const { into, out } = mounts(one.args)
      expect(await readFile(path.join(into, 'video', 'sample.mp4'), 'utf8')).toBe('input bytes')
      await mkdir(out, { recursive: true })
      await writeFile(path.join(out, 'clip.mp4'), 'converted')
      await writeFile(path.join(out, 'output.json'), JSON.stringify({ video: 'clip.mp4' }))
      return {}
    })
    const stopping = new AbortController()
    const job = convertJob()
    const server = fakeServer([{ order: 'prepare', step: job.step, build: job.build }, { order: 'job', job }], () => setTimeout(() => stopping.abort(), 50))
    await runLoop({ app: appClient({ url: identity.url, token: 'pbr_own', fetch: server.fetch }), engine: engine(exec, 'docker'), settings, identity, say: () => {}, signal: stopping.signal })

    const claims = server.sent.filter((one) => one.path === '/api/runners/v1/claim').map((one) => JSON.parse(one.body) as Record<string, unknown>)
    expect(claims[0]).toEqual({ platform: platform(), kinds: ['container', 'build'], labels: [], capacity: { slots: 2 }, images: [], instances: [] })
    // Once built, every claim lists the image by its step version, from its label
    expect(claims[1]).toMatchObject({ images: [{ step: 'custom:ffmpeg_convert:1' }], capacity: { slots: 2 } })
    expect(claims[2]).toMatchObject({ images: [{ step: 'custom:ffmpeg_convert:1' }] })
    expect(ran.filter((one) => one.args[0] === 'build')).toHaveLength(1)
    expect(ran.find((one) => one.args[0] === 'run')!.args).toContain(tag)
    expect(server.sent.every((one) => one.authorization === 'Bearer pbr_own')).toBe(true)
    const calls = server.sent.map((one) => `${one.method} ${one.path}`).filter((call) => !call.endsWith('/log') && !call.endsWith('/heartbeat'))
    // It claims again as soon as the job starts, beside it, while a slot is free
    expect(calls.filter((call) => !call.includes('/jobs/'))).toEqual(['POST /api/runners/v1/claim', 'POST /api/runners/v1/builds', 'POST /api/runners/v1/builds', 'POST /api/runners/v1/claim', 'POST /api/runners/v1/claim'])
    expect(calls.filter((call) => call.includes('/jobs/'))).toEqual([`GET /api/runners/v1/jobs/${job.id}/inputs/video`, `PUT /api/runners/v1/jobs/${job.id}/outputs/clip.mp4`, `POST /api/runners/v1/jobs/${job.id}/complete`])
    const upload = server.sent.find((one) => one.method === 'PUT')!
    expect([upload.type, upload.body]).toEqual(['video/mp4', 'converted'])
    expect(JSON.parse(server.sent.find((one) => one.path.endsWith('/complete'))!.body)).toEqual({ output: { video: { configuration: 'videos', path: 'runs/x/clip.mp4', name: 'clip.mp4', type: 'video/mp4', size: 9 } } })
  })

  it('goes on claiming after a prepare whose build cannot even start, as on an unwritable work folder', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const blocked = path.join(path.dirname(settings.work_dir), 'blocked')
    await writeFile(blocked, '')
    const stopping = new AbortController()
    const job = convertJob()
    let claims = 0
    const server = fakeServer([{ order: 'prepare', step: job.step, build: job.build }], () => {})
    const said: string[] = []
    const { exec } = fakeExec((one) => (one.args[0] === 'image' && one.args[1] === 'inspect' ? { code: 1 } : {}))
    const fetch: Fetch = async (url, init) => {
      if (url.endsWith('/claim') && ++claims === 2) setTimeout(() => stopping.abort(), 10)
      return server.fetch(url, init)
    }
    await runLoop({ app: appClient({ url: identity.url, token: 'pbr_own', fetch }), engine: engine(exec, 'docker'), settings: { ...settings, work_dir: path.join(blocked, 'work') }, identity, say: (line) => said.push(line), signal: stopping.signal })
    expect(claims).toBe(2)
    expect(said).toContainEqual(expect.stringMatching(/^prepare custom:ffmpeg_convert:1 failed, claiming again after a pause: ENOTDIR/))
  })

  it('stops the jobs it runs when the app refuses its token, and waits for them to clean up before it ends', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const job = convertJob()
    let finish: (() => void) | undefined
    let claims = 0
    const order: string[] = []
    const { exec } = fakeExec(async (one) => {
      if (one.args[0] === 'kill') finish?.()
      if (one.args[0] !== 'run') return {}
      order.push('container running')
      // The second claim is refused while the job runs
      await new Promise<void>((resolve) => (finish = resolve))
      order.push('container killed')
      return { code: 137 }
    })
    const fetch: Fetch = async (url) => {
      if (url.endsWith('/claim')) {
        claims++
        if (claims === 1) return Response.json({ order: 'job', job })
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new Response('{"title":"Unauthorized"}', { status: 401 })
      }
      if (url.includes('/inputs/')) return new Response('input bytes')
      return Response.json({ stop: false })
    }
    const ended = runLoop({ app: appClient({ url: identity.url, token: 'pbr_gone', fetch }), engine: engine(exec, 'docker'), settings, identity, say: () => {}, signal: new AbortController().signal }).finally(() => order.push('loop ended'))
    await expect(ended).rejects.toThrow(/revoked or deleted/)
    // Its container was killed, and its folder removed, before the loop ended
    expect(order).toEqual(['container running', 'container killed', 'loop ended'])
    expect(await readdir(settings.work_dir)).toEqual([])
  })

  it('stops a prepare build as the runner stops, reporting no end, and ends once it cleaned up', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const job = convertJob()
    const stopping = new AbortController()
    const server = fakeServer([{ order: 'prepare', step: job.step, build: job.build }], () => {})
    const { exec } = fakeExec((one, options) => {
      if (one.args[0] === 'image' && one.args[1] === 'inspect') return { code: 1 }
      if (one.args[0] !== 'build') return {}
      setTimeout(() => stopping.abort(), 20)
      // A build that would run for its whole time limit, until its signal kills it
      return new Promise((resolve) => options.signal?.addEventListener('abort', () => resolve({ code: 137 }), { once: true }))
    })
    const started = Date.now()
    await runLoop({ app: appClient({ url: identity.url, token: 'pbr_own', fetch: server.fetch }), engine: engine(exec, 'docker'), settings: { ...settings, build_timeout_seconds: 600 }, identity, say: () => {}, signal: stopping.signal })
    expect(Date.now() - started).toBeLessThan(5000)
    expect(server.sent.filter((one) => one.path.endsWith('/builds')).map((one) => JSON.parse(one.body).status)).toEqual(['building'])
    expect(await readdir(settings.work_dir)).toEqual([])
  })

  it('says it builds only when its settings say so, and stops when the app refuses its token', async () => {
    expect([kinds({ build: true }), kinds({ build: false })]).toEqual([['container', 'build'], ['container']])
    expect([platform('x64'), platform('arm64')]).toEqual(['linux/amd64', 'linux/arm64'])
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const refused: Fetch = async () => new Response('{"title":"Unauthorized"}', { status: 401 })
    const { exec } = fakeExec()
    await expect(runLoop({ app: appClient({ url: identity.url, token: 'pbr_gone', fetch: refused }), engine: engine(exec, 'docker'), settings, identity, say: () => {}, signal: new AbortController().signal })).rejects.toThrow(/revoked or deleted/)
  })
})
