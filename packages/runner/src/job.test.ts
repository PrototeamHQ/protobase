import { chmod, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { builder } from './builds'
import { engine, imageTag } from './engine'
import { containerInput, fileName, inputVariable, logLines, outputFile, runJob } from './job'
import { convertJob, fakeApp, fakeExec, mounts, testSettings, type Ran } from './testing/fakes'

const identity = { url: 'https://app.example.com', tenant: '1' }
const tag = imageTag(identity, 'custom:ffmpeg_convert:1')
const removals: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const remove of removals.splice(0)) await remove()
})

// A runner's parts around the fake engine and app.
const setUp = async (answer: Parameters<typeof fakeExec>[0], app = fakeApp()) => {
  const { settings, remove } = await testSettings()
  removals.push(remove)
  const { exec, ran } = fakeExec(answer)
  const docker = engine(exec, 'docker')
  const lines: string[] = []
  const say = (line: string) => lines.push(line)
  const input = { app: app.app, engine: docker, build: builder({ app: app.app, engine: docker, settings, identity, say }), settings, identity, say }
  return { input, ran, app, settings, lines }
}

const runs = (ran: Ran[]) => ran.filter((one) => one.args[0] === 'run')

// A container that converts as the FFmpeg step's does: it reads input.json and writes its file and output.json.
const converting = async (ran: Ran) => {
  if (ran.args[0] !== 'run') return {}
  const { into, out } = mounts(ran.args)
  const input = JSON.parse(await readFile(path.join(into, 'input.json'), 'utf8')) as { video: { path: string } }
  const video = await readFile(path.join(into, input.video.path.replace('/protobase/in/', '')), 'utf8')
  await mkdir(path.join(out, 'converted'))
  await writeFile(path.join(out, 'converted', 'clip-720.mp4'), `720p of ${video}`)
  await writeFile(path.join(out, 'output.json'), JSON.stringify({ video: 'converted/clip-720.mp4', duration_seconds: 2 }))
  return { stdout: 'frame=60\n' }
}

describe("a job's container", () => {
  it('runs hardened, exactly so, with only its folders mounted and its inputs as variables named on the command line', async () => {
    const { input, ran } = await setUp(converting)
    await runJob(input, convertJob())
    const [run] = runs(ran)
    const { work } = mounts(run!.args)
    expect(run).toEqual({
      command: 'docker',
      args: [
        'run', '--rm', '--name', 'protobase-job-0b6f2f8e-1111-4222-8333-944445555666',
        '--network', 'none',
        '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=256m',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--pids-limit', '256', '--memory', '2048m', '--memory-swap', '2048m', '--cpus', '2',
        '--user', '65532:65532',
        '-v', `${work}/in:/protobase/in:ro`, '-v', `${work}/out:/protobase/out`,
        '-e', 'PROTOBASE_INPUT=/protobase/in/input.json', '-e', 'PROTOBASE_IN=/protobase/in', '-e', 'PROTOBASE_OUT=/protobase/out',
        '-e', 'INPUT_HEIGHT', '-e', 'INPUT_CODEC',
        tag, 'convert',
      ],
      // The values reach the engine through its environment, never its command line
      env: { INPUT_HEIGHT: '720', INPUT_CODEC: 'h264' },
    })
  })

  it("gets input.json with each file as where it is in the container, without Protobase's own store argument", () => {
    const { json, files, env } = containerInput(convertJob())
    expect(json).toEqual({ video: { path: '/protobase/in/video/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size: 11 }, height: 720, codec: 'h264' })
    expect(files.map((file) => file.at)).toEqual(['video/sample.mp4'])
    expect(env).toEqual({ INPUT_HEIGHT: '720', INPUT_CODEC: 'h264' })
    expect([inputVariable('frame-rate'), fileName('../../etc/passwd'), fileName('..'), fileName('a\u0000b.mp4')]).toEqual(['INPUT_FRAME_RATE', 'passwd', 'file', 'ab.mp4'])
    expect(() => containerInput(convertJob({ files: [{ input: '../x', name: 'x', type: 'text/plain', size: 1, url: '/x' }] }))).toThrow(/cannot be a folder/)
  })

  it('completes with its output, each file it names uploaded and replaced by the stored file, and its lines logged, then leaves no folder', async () => {
    const { input, app, settings } = await setUp(converting)
    await runJob(input, convertJob())
    expect(app.calls.find((call) => call.call === 'download')).toEqual({ call: 'download', body: '/api/runners/v1/jobs/0b6f2f8e-1111-4222-8333-944445555666/inputs/video' })
    expect(app.uploads).toEqual([{ job: convertJob().id, path: 'converted/clip-720.mp4', type: 'video/mp4', text: '720p of input bytes' }])
    expect(app.calls.filter((call) => call.call === 'complete')).toEqual([
      { call: 'complete', job: convertJob().id, body: { output: { video: { configuration: 'videos', path: 'converted/converted/clip-720.mp4', name: 'clip-720.mp4', type: 'video/mp4', size: 19 }, duration_seconds: 2 } } },
    ])
    expect(app.calls.filter((call) => call.call === 'log').flatMap((call) => call.body as string[])).toEqual(['frame=60'])
    // Uploads come before the completion, which ends the job and its files' addresses
    expect(app.calls.map((call) => call.call).filter((call) => call !== 'log')).toEqual(['download', 'upload', 'complete'])
    // Its lines reach the app before its completion, after which the job takes none
    const order = app.calls.map((call) => call.call)
    expect(order.lastIndexOf('log')).toBeLessThan(order.indexOf('complete'))
    expect(await readdir(settings.work_dir)).toEqual([])
  })

  it('fails with the error error.json names, whatever its exit code', async () => {
    const { input, app } = await setUp(async (ran) => {
      if (ran.args[0] !== 'run') return {}
      await writeFile(path.join(mounts(ran.args).out, 'error.json'), JSON.stringify({ error: 'UnsupportedInput', cause: 'no video stream' }))
      return { code: 3 }
    })
    await runJob(input, convertJob())
    expect(app.calls.find((call) => call.call === 'complete')?.body).toEqual({ error: 'UnsupportedInput', cause: 'no video stream' })
  })

  it('fails any other exit with Custom.Failed and the last 2000 characters of stderr', async () => {
    const { input, app } = await setUp((ran, options) => {
      if (ran.args[0] !== 'run') return {}
      options.line?.('x'.repeat(3000), 'stderr')
      options.line?.('Conversion failed!', 'stderr')
      return { code: 1 }
    })
    await runJob(input, convertJob())
    const { error, cause } = app.calls.find((call) => call.call === 'complete')!.body as { error: string; cause: string }
    expect(error).toBe('Custom.Failed')
    expect(cause).toHaveLength(2000)
    expect(cause.endsWith('Conversion failed!\n')).toBe(true)
    const silent = await setUp((ran) => (ran.args[0] === 'run' ? { code: 137 } : {}))
    await runJob(silent.input, convertJob())
    expect(silent.app.calls.find((call) => call.call === 'complete')?.body).toEqual({ error: 'Custom.Failed', cause: 'The container exited with 137' })
  })

  it('fails as Custom.InvalidOutput without output.json, with one that is no JSON, or one naming a file outside its folder, uploading nothing', async () => {
    const outputs: ((out: string) => Promise<void>)[] = [
      async () => {},
      (out) => writeFile(path.join(out, 'output.json'), '{ nope'),
      async (out) => {
        await symlink('/etc/passwd', path.join(out, 'passwd'))
        await writeFile(path.join(out, 'output.json'), JSON.stringify({ video: 'passwd' }))
      },
      (out) => writeFile(path.join(out, 'output.json'), JSON.stringify({ video: '../in/input.json' })),
      async (out) => {
        await symlink('/etc', path.join(out, 'etc'))
        await writeFile(path.join(out, 'output.json'), JSON.stringify({ video: 'etc/passwd' }))
      },
    ]
    for (const write of outputs) {
      const { input, app } = await setUp(async (ran) => {
        if (ran.args[0] === 'run') await write(mounts(ran.args).out)
        return {}
      })
      await runJob(input, convertJob())
      expect(app.calls.find((call) => call.call === 'complete')?.body).toMatchObject({ error: 'Custom.InvalidOutput' })
      expect(app.uploads).toEqual([])
    }
  })

  it('reads only a plain file inside the output folder as an output file', async () => {
    const { settings, remove } = await testSettings()
    removals.push(remove)
    const out = path.join(settings.work_dir, 'out')
    await mkdir(path.join(out, 'a'), { recursive: true })
    await writeFile(path.join(out, 'a', 'b.mp4'), 'x')
    expect(await outputFile(out, 'a/b.mp4')).toBe(path.join(out, 'a', 'b.mp4'))
    for (const given of ['a', '/etc/passwd', '../out/a/b.mp4', 'missing.mp4', 3, '']) expect(await outputFile(out, given)).toBeUndefined()
  })

  it('is killed at its deadline, completing nothing', async () => {
    let finish: (() => void) | undefined
    const { input, ran, app } = await setUp((one) => {
      if (one.args[0] === 'kill') finish?.()
      if (one.args[0] !== 'run') return {}
      return new Promise((resolve) => (finish = () => resolve({ code: 137 })))
    })
    await runJob(input, convertJob({ deadline: new Date(Date.now() + 200).toISOString() }))
    expect(ran.filter((one) => one.args[0] === 'kill').map((one) => one.args)).toEqual([['kill', 'protobase-job-0b6f2f8e-1111-4222-8333-944445555666']])
    expect(app.calls.filter((call) => call.call === 'complete')).toEqual([])
  })

  it('is killed once a heartbeat answers stop, completing nothing', async () => {
    let finish: (() => void) | undefined
    const { input, ran, app } = await setUp(
      (one) => {
        if (one.args[0] === 'kill') finish?.()
        if (one.args[0] !== 'run') return {}
        return new Promise((resolve) => (finish = () => resolve({ code: 137 })))
      },
      fakeApp({ stop: () => true }),
    )
    await runJob(input, convertJob({ heartbeat_seconds: 0.05 }))
    expect(app.calls.filter((call) => call.call === 'heartbeat').length).toBeGreaterThan(0)
    expect(ran.some((one) => one.args[0] === 'kill')).toBe(true)
    expect(app.calls.filter((call) => call.call === 'complete')).toEqual([])
  })
})

describe("a job's image", () => {
  it('is built first when the runner has not got it, labelled with its step and app, from its version alone, and reported', async () => {
    let built = false
    const { input, ran, app } = await setUp(async (one) => {
      if (one.args[0] === 'image' && one.args[1] === 'inspect') return built ? { stdout: 'sha256:abc\n' } : { code: 1 }
      if (one.args[0] === 'build') {
        const dockerfile = one.args[one.args.indexOf('--file') + 1]!
        const context = one.args.at(-1)!
        expect(await readFile(dockerfile, 'utf8')).toBe(convertJob().build.dockerfile)
        expect(await readdir(context)).toEqual(['convert.sh'])
        built = true
        return { stdout: '#1 DONE\n' }
      }
      return converting(one)
    })
    await runJob(input, convertJob())
    const build = ran.find((one) => one.args[0] === 'build')!
    expect(build.args.slice(0, 6)).toEqual(['build', '--tag', tag, '--label', 'org.protobase.step=custom:ffmpeg_convert:1', '--label'])
    expect(build.args[6]).toMatch(/^org\.protobase\.app=[0-9a-f]{16}$/)
    expect(app.calls.filter((call) => call.call === 'build').map((call) => call.body)).toEqual([
      { step: 'custom:ffmpeg_convert:1', status: 'building' },
      { step: 'custom:ffmpeg_convert:1', status: 'ready', digest: 'sha256:abc', log: '#1 DONE' },
    ])
    expect(runs(ran)).toHaveLength(1)
  })

  it('fails the job with Custom.Failed and the log when it does not build, running nothing', async () => {
    const { input, ran, app } = await setUp((one, options) => {
      if (one.args[0] === 'build') options.line?.('E: Unable to locate package nope', 'stdout')
      return one.args[0] === 'run' ? {} : { code: 1 }
    })
    await runJob(input, convertJob())
    expect(app.calls.find((call) => call.call === 'complete')?.body).toEqual({ error: 'Custom.Failed', cause: "The step's image did not build: E: Unable to locate package nope" })
    expect(app.calls.filter((call) => call.call === 'build').at(-1)?.body).toEqual({ step: 'custom:ffmpeg_convert:1', status: 'failed', log: 'E: Unable to locate package nope' })
    expect(runs(ran)).toEqual([])
  })
})

describe("a job's end", () => {
  it('fails the job and clears its timers when its folder or step cannot be set up', async () => {
    const { input, app, settings } = await setUp(converting)
    await runJob(input, convertJob({ step: 'app:http', heartbeat_seconds: 0.02 }))
    expect(app.calls.filter((call) => call.call === 'complete').map((call) => call.body)).toEqual([{ error: 'Custom.Failed', cause: 'The runner could not run the job: app:http is no custom step version' }])
    // A folder that cannot be made fails it the same way
    await writeFile(path.join(path.dirname(settings.work_dir), 'blocked'), '')
    await runJob({ ...input, settings: { ...settings, work_dir: path.join(path.dirname(settings.work_dir), 'blocked', 'work') } }, convertJob({ heartbeat_seconds: 0.02 }))
    expect(app.calls.filter((call) => call.call === 'complete').at(-1)?.body).toMatchObject({ error: 'Custom.Failed', cause: expect.stringMatching(/^The runner could not run the job: ENOTDIR/) })
    const beats = app.calls.filter((call) => call.call === 'heartbeat').length
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(app.calls.filter((call) => call.call === 'heartbeat').length).toBe(beats)
  })

  it('sends a completion the app did not take once more, and never a failure in place of a step that ran', async () => {
    const again = await setUp(converting, fakeApp({ completeFails: 1 }))
    await runJob(again.input, convertJob())
    const sent = again.app.calls.filter((call) => call.call === 'complete').map((call) => call.body)
    expect(sent).toHaveLength(2)
    expect(sent.every((body) => 'output' in (body as object))).toBe(true)
    // Not taken either time, it is left to the job's lease
    const never = await setUp(converting, fakeApp({ completeFails: 2 }))
    await runJob(never.input, convertJob())
    expect(never.app.calls.filter((call) => call.call === 'complete').map((call) => 'output' in (call.body as object))).toEqual([true, true])
    expect(never.lines.at(-1)).toMatch(/took its completion neither time .* its lease ends it, and it runs again$/)
  })

  it("removes what the container's user left beyond the runner's reach as that user, hardened, named, and stopped at the deadline", async () => {
    let finish: (() => void) | undefined
    const { input, ran, lines } = await setUp(async (one) => {
      if (one.args[0] === 'kill' && one.args[1]!.startsWith('protobase-clean-')) finish?.()
      if (one.args[0] !== 'run') return {}
      const out = one.args[one.args.indexOf('-v') + 1]!.split(':')[0]!
      if (one.args.includes('--entrypoint')) {
        // The cleaner hangs once, until it is killed; it removes the folder as the job's user would
        if (!finish) return new Promise((resolve) => (finish = () => resolve({ code: 137 })))
        await chmod(path.join(out, 'locked'), 0o700)
        await rm(path.join(out, 'locked'), { recursive: true })
        return {}
      }
      const { out: written } = mounts(one.args)
      // A folder the runner's user may not empty, as one the container's user made would be
      await mkdir(path.join(written, 'locked'))
      await writeFile(path.join(written, 'locked', 'part.bin'), 'x')
      await chmod(path.join(written, 'locked'), 0o500)
      return { code: 1 }
    })
    await runJob(input, convertJob({ deadline: new Date(Date.now() + 400).toISOString() }))
    const clean = ran.find((one) => one.args.includes('--entrypoint'))!
    const out = clean.args[clean.args.indexOf('-v') + 1]!.split(':')[0]!
    expect(clean.args).toEqual([
      'run', '--rm', '--name', 'protobase-clean-0b6f2f8e-1111-4222-8333-944445555666',
      '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--pids-limit', '256', '--memory', '2048m', '--memory-swap', '2048m', '--cpus', '2',
      '--user', '65532:65532',
      '-v', `${out}:/protobase/out`,
      '--entrypoint', 'rm', tag, '-rf', '--', '/protobase/out/locked',
    ])
    // At the job's deadline the hung cleaner is killed and removed by its name, and that is said
    expect(ran.filter((one) => one.args[0] !== 'run' && one.args.at(-1)!.startsWith('protobase-clean-')).map((one) => one.args)).toEqual([
      ['kill', 'protobase-clean-0b6f2f8e-1111-4222-8333-944445555666'],
      ['rm', '-f', 'protobase-clean-0b6f2f8e-1111-4222-8333-944445555666'],
    ])
    expect(lines).toContain('job 0b6f2f8e-1111-4222-8333-944445555666: removing its folder was stopped, as it took too long or the runner stops')

    // One that removes them leaves no folder; one that exits otherwise is said
    const second = await setUp(async (one) => {
      if (one.args[0] !== 'run') return {}
      const folder = one.args[one.args.indexOf('-v') + 1]!.split(':')[0]!
      if (one.args.includes('--entrypoint')) {
        await chmod(path.join(folder, 'locked'), 0o700)
        await rm(path.join(folder, 'locked'), { recursive: true })
        return {}
      }
      await mkdir(path.join(mounts(one.args).out, 'locked'))
      await writeFile(path.join(mounts(one.args).out, 'locked', 'part.bin'), 'x')
      await chmod(path.join(mounts(one.args).out, 'locked'), 0o500)
      return { code: 1 }
    })
    await runJob(second.input, convertJob())
    expect(await readdir(second.settings.work_dir)).toEqual([])
    const third = await setUp(async (one) => {
      if (one.args[0] !== 'run') return {}
      if (one.args.includes('--entrypoint')) return { code: 127, stderr: 'exec: "rm": executable file not found in $PATH' }
      await mkdir(path.join(mounts(one.args).out, 'locked'))
      await writeFile(path.join(mounts(one.args).out, 'locked', 'part.bin'), 'x')
      await chmod(path.join(mounts(one.args).out, 'locked'), 0o500)
      return { code: 1 }
    })
    await runJob(third.input, convertJob())
    expect(third.lines).toContain('job 0b6f2f8e-1111-4222-8333-944445555666: removing its folder\'s files exited with 127: exec: "rm": executable file not found in $PATH')
  })
})

describe("a job's log", () => {
  it('keeps at most 10 batches waiting for the app, drops the oldest lines past them and says how many, each batch at most 100 lines', async () => {
    const sent: string[][] = []
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    const { app } = fakeApp()
    const logs = logLines({ ...app, log: async (_, lines) => (sent.push(lines), await held, {}) }, 'job', () => {})
    for (let line = 0; line < 5000; line++) logs.add(`line ${line}`)
    // One batch is with the app and nine more wait behind it; the lines past them are dropped but for the newest
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(sent).toHaveLength(1)
    release!()
    await logs.close()
    expect(sent.every((batch) => batch.length <= 100)).toBe(true)
    const all = sent.flat()
    const notices = all.filter((line) => line.includes('dropped'))
    const dropped = notices.reduce((sum, line) => sum + Number(line.split(' ')[0]), 0)
    expect(all.length - notices.length + dropped).toBe(5000)
    expect(sent).toHaveLength(11)
    expect(sent[10]![0]).toMatch(/^\d+ lines of output dropped, as the app took them too slowly$/)
    // The newest lines are the ones kept
    expect(all.at(-1)).toBe('line 4999')
  })
})
