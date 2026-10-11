import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { badRequest, HttpProblem, problemResponse, unauthorized } from '../problem'
import type { JobsRuntime } from './runtime'

export const drainPath = '/api/jobs/drain'

const digest = (text: string) => createHash('sha256').update(text).digest()

// Compared as digests, so neither the time taken nor a length difference tells anything about the token.
const sameToken = (given: string | undefined, token: string) => given !== undefined && timingSafeEqual(digest(given), digest(token))

const maxSeconds = 300

/**
 * `POST /api/jobs/drain?seconds=25`: runs the app's due jobs until none is left or `seconds` have passed, and answers
 * `{ drained, remaining, nextDue }`. For the operator of a host that lets the app sleep and wakes it for its jobs: it
 * takes the operator's `token` as a bearer token, never a user's.
 */
export const jobsDrainApp = ({ runtime, token }: { runtime: JobsRuntime; token: string }) =>
  new Hono().post(drainPath, async (c) => {
    const problem = (error: HttpProblem) => problemResponse(error, c.req.path)
    if (!sameToken(c.req.header('authorization')?.replace(/^Bearer /, ''), token)) return problem(unauthorized('Send the operator token as a bearer token'))
    const seconds = Number(c.req.query('seconds') ?? 25)
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > maxSeconds) return problem(badRequest('invalid-seconds', `seconds must be more than 0 and at most ${maxSeconds}`))
    if (!runtime.works) return problem(new HttpProblem(409, 'jobs-elsewhere', 'Conflict', 'This process runs no jobs (PROTOBASE_JOBS=off); drain the one that does'))
    const { drained, remaining, nextDue } = await runtime.drain(seconds)
    return c.json({ drained, remaining, nextDue: nextDue?.toISOString() ?? null })
  })
