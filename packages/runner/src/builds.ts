import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { JobBuild } from '@protobase/workflows'
import type { AppClient } from './app'
import type { Settings } from './config'
import { appKey, buildArgs, imageTag, type Engine, type Identity } from './engine'

/** The most of a build's log the runner reports: its end, where a failure says why. */
export const buildLogChars = 10_000

/** How a build ended: built, with its image's digest, or not, and the end of its log either way. */
export type Built = { built: true; digest?: string; log: string } | { built: false; log: string }

// A path in the build's folder: relative, never leaving it.
const insideContext = (file: string) => file !== '' && !path.isAbsolute(file) && !file.split(/[/\\]/).includes('..')

/**
 * The runner's builds of custom step versions' images: each from its version's Dockerfile and files alone, written into
 * a fresh folder, on the engine's default network, within the build time limit, labelled with its step and app. A
 * build reports its start and its end to the app, with its digest or the end of its log. An image already here is not
 * built again, and two builds of one image at once are one.
 */
export const builder = ({ app, engine, settings, identity, say }: { app: AppClient; engine: Engine; settings: Pick<Settings, 'work_dir' | 'build_timeout_seconds'>; identity: Identity; say: (line: string) => void }) => {
  const building = new Map<string, Promise<Built>>()

  const build = async (tag: string, step: string, version: JobBuild): Promise<Built> => {
    await app.build({ step, status: 'building' }).catch((error: unknown) => say(`build ${step}: could not report its start: ${String(error)}`))
    await mkdir(settings.work_dir, { recursive: true, mode: 0o700 })
    const folder = await mkdtemp(path.join(settings.work_dir, 'build-'))
    const lines: string[] = []
    let ended: Built
    try {
      const context = path.join(folder, 'context')
      await mkdir(context)
      for (const [file, text] of Object.entries(version.files)) {
        if (!insideContext(file)) throw new Error(`${file} is not a path inside the build's folder`)
        await mkdir(path.dirname(path.join(context, file)), { recursive: true })
        await writeFile(path.join(context, file), text)
      }
      const dockerfile = path.join(folder, 'Dockerfile')
      await writeFile(dockerfile, version.dockerfile)
      const started = Date.now()
      const result = await engine.build(buildArgs({ tag, step, app: appKey(identity), dockerfile, context }), {
        signal: AbortSignal.timeout(settings.build_timeout_seconds * 1000),
        line: (line) => lines.push(line),
      })
      const log = lines.join('\n').slice(-buildLogChars)
      if (result.code !== 0) {
        const late = Date.now() - started >= settings.build_timeout_seconds * 1000
        ended = { built: false, log: late ? `${log}\nThe build took longer than ${settings.build_timeout_seconds} seconds and was stopped`.slice(-buildLogChars) : log }
      } else {
        const digest = await engine.digest(tag)
        ended = { built: true, ...(digest && { digest }), log }
      }
    } catch (error) {
      ended = { built: false, log: `${lines.join('\n')}\n${error instanceof Error ? error.message : String(error)}`.slice(-buildLogChars) }
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
    say(`build ${step}: ${ended.built ? 'ready' : 'failed'}`)
    await app.build({ step, status: ended.built ? 'ready' : 'failed', ...(ended.built && ended.digest && { digest: ended.digest }), log: ended.log }).catch((error: unknown) => say(`build ${step}: could not report its end: ${String(error)}`))
    return ended
  }

  /** Builds the image of `step` from `version` unless it is here already. */
  return (step: string, version: JobBuild): Promise<Built> => {
    const tag = imageTag(identity, step)
    const running = building.get(tag)
    if (running) return running
    const done = (async () => ((await engine.has(tag)) ? ({ built: true, log: '' } as const) : build(tag, step, version)))().finally(() => building.delete(tag))
    building.set(tag, done)
    return done
  }
}

export type Builder = ReturnType<typeof builder>
