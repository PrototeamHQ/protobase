import { Hono, type Context } from 'hono'
import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { limits } from '@protobase/workflows'
import { clientAddress, createRateLimit } from '../../forms/rate-limit'
import { badRequest, HttpProblem, problemResponse } from '../../problem'
import { readBody } from '../hooks/read-body'
import { register } from './registration'
import { completionOf, logLinesOf, registrationOf, runnerStateOf } from './runner-bodies'
import { buildReportOf, reportBuild } from './runner-builds'
import type { runnerBroker } from './runner-broker'
import type { runnerFiles } from './runner-files'
import type { Runner, runnerJobs } from './runner-jobs'
import { runnerTokenHash, runnerTokenPattern } from './runner-tokens'

/** Calls an address may have refused a minute before it waits, as the waiting Tasks' answers allow. */
const refusalsPerMinute = 30

// An output as large as a step keeps, or a claim's lists of images and instances, with room for the JSON around it.
const bodyLimit = limits.valueBytes + 4096

export type RunnerRouteInput = {
  db: () => Db
  schema: string
  broker: ReturnType<typeof runnerBroker>
  jobs: ReturnType<typeof runnerJobs>
  files: ReturnType<typeof runnerFiles>
  /** Reports an error the route did not expect, without the request: its headers hold the runner's token. */
  report: (error: unknown) => void
}

const path = '/runners/v1'

/**
 * The calls a runner makes, with no session: `POST .../runners/v1/register` with `{ token, platform, kinds }` exchanges
 * its one-time registration token for its own; every other call carries that as `Authorization: Bearer pbr_...`, which
 * a revoked or deleted runner's no longer opens. `.../claim` with what the runner says of itself is held open until a
 * job is placed with it (`{ order: "job", job }`) or its time runs out (`{ order: "none" }`); `.../jobs/<id>/heartbeat`
 * extends its hold of a job (`{ stop }`), `.../log` with `{ lines }` adds to its logs, and `.../complete` with
 * `{ output }` or `{ error, cause }` ends it. While it holds a job, `GET .../jobs/<id>/inputs/<name>` streams it an input
 * file, and `PUT .../jobs/<id>/outputs/<path>` stores a file it gave, answering the stored file. `.../builds` with
 * `{ step, status, digest?, log? }` reports a build of a step's image as it starts and ends. An address refused 30
 * times this minute waits, before any lookup.
 */
export const runnerRoute = ({ db, schema, broker, jobs, files, report }: RunnerRouteInput) => {
  const refusals = createRateLimit()
  const app = new Hono()

  app.onError((error) => {
    if (error instanceof HttpProblem) return problemResponse(error, path)
    report(error)
    return problemResponse(new HttpProblem(500, 'internal-error', 'Internal Server Error', 'The call could not be taken; make it again'), path)
  })

  // Counts a refusal of the caller's address, and a call from one refused too often waits before anything is read.
  const guard = (c: Context) => {
    const address = clientAddress(c.req.raw.headers)
    const wait = refusals.spent(address, refusalsPerMinute)
    if (wait > 0) throw new HttpProblem(429, 'too-many-calls', 'Too Many Requests', 'Too many refused calls from this address; wait a minute', {}, { 'Retry-After': String(wait) })
    return (problem: HttpProblem) => {
      refusals.take(address, refusalsPerMinute)
      return problem
    }
  }

  const bodyOf = async (c: Context, refused: (problem: HttpProblem) => HttpProblem) => {
    const bytes = await readBody(c.req.raw, bodyLimit)
    if (!bytes) throw refused(new HttpProblem(413, 'body-too-large', 'Payload Too Large', `The body is over ${bodyLimit} bytes`))
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown
    } catch {
      throw refused(badRequest('invalid-json', 'The body is not JSON'))
    }
  }

  const parsed = <T>(found: T | { problem: string }, refused: (problem: HttpProblem) => HttpProblem): T => {
    if (typeof found === 'object' && found !== null && 'problem' in found) throw refused(badRequest('invalid-body', found.problem))
    return found as T
  }

  // The runner a call's token opens: registered, and neither revoked nor deleted.
  const runnerOf = async (c: Context, refused: (problem: HttpProblem) => HttpProblem): Promise<Runner> => {
    const token = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1] ?? ''
    const invalid = () => refused(new HttpProblem(401, 'invalid-runner-token', 'Unauthorized', 'Send the runner\'s own token as Authorization: Bearer pbr_...; a revoked or deleted runner\'s is refused', {}, { 'www-authenticate': 'Bearer' }))
    if (!runnerTokenPattern.test(token)) throw invalid()
    const { rows } = await sql<Runner>`select id, tenant_id, labels from ${sql.id(schema, 'runners')} where token_hash = ${await runnerTokenHash(token)} and not revoked`.execute(db())
    if (!rows[0]) throw invalid()
    return rows[0]
  }

  app.post('/register', async (c) => {
    const refused = guard(c)
    const given = parsed(registrationOf(await bodyOf(c, refused)), refused)
    try {
      return c.json(await register(db(), schema, given), 200, { 'Cache-Control': 'no-store' })
    } catch (error) {
      throw error instanceof HttpProblem ? refused(error) : error
    }
  })

  app.post('/claim', async (c) => {
    const refused = guard(c)
    const runner = await runnerOf(c, refused)
    const state = parsed(runnerStateOf(await bodyOf(c, refused)), refused)
    return c.json(await broker.claim(runner, state, c.req.raw.signal), 200, { 'Cache-Control': 'no-store' })
  })

  app.post('/jobs/:id/heartbeat', async (c) => {
    const runner = await runnerOf(c, guard(c))
    return c.json(await jobs.heartbeat(runner, c.req.param('id')))
  })

  app.post('/jobs/:id/log', async (c) => {
    const refused = guard(c)
    const runner = await runnerOf(c, refused)
    return c.json(await jobs.log(runner, c.req.param('id'), parsed(logLinesOf(await bodyOf(c, refused)), refused)))
  })

  app.post('/jobs/:id/complete', async (c) => {
    const refused = guard(c)
    const runner = await runnerOf(c, refused)
    return c.json(await jobs.complete(runner, c.req.param('id'), parsed(completionOf(await bodyOf(c, refused)), refused)))
  })

  app.get('/jobs/:id/inputs/:name', async (c) => {
    const runner = await runnerOf(c, guard(c))
    return files.input(runner, c.req.param('id'), c.req.param('name'))
  })

  app.put('/jobs/:id/outputs/*', async (c) => {
    const runner = await runnerOf(c, guard(c))
    const prefix = `/jobs/${c.req.param('id')}/outputs/`
    const at = c.req.path.indexOf(prefix)
    const path = at < 0 ? '' : decodeURIComponent(c.req.path.slice(at + prefix.length))
    const body = c.req.raw.body ?? new Blob([]).stream()
    return c.json(await files.output(runner, c.req.param('id'), path, body, c.req.header('content-type') ?? ''))
  })

  app.post('/builds', async (c) => {
    const refused = guard(c)
    const runner = await runnerOf(c, refused)
    return c.json(await reportBuild(db(), schema, runner, parsed(buildReportOf(await bodyOf(c, refused)), refused)))
  })

  return app
}
