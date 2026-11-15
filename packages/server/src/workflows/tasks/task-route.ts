import { Hono } from 'hono'
import { limits, type AnswerRefusal, type TaskAnswer } from '@protobase/workflows'
import { clientAddress, createRateLimit } from '../../forms/rate-limit'
import { badRequest, HttpProblem, problemResponse } from '../../problem'
import { readBody } from '../hooks/read-body'
import { answerCalls, answerOf, refusalProblems, type AnswerCall } from './task-answer'

/** Calls an address may have refused a minute before it waits, as the webhook addresses allow. */
const refusalsPerMinute = 30

// A result as large as a step keeps, with room for the token and the JSON around it.
const bodyLimit = limits.valueBytes + 4096

export type TaskRouteInput = {
  answer: (token: string, answer: TaskAnswer) => Promise<{ run: string } | AnswerRefusal>
  /** Reports an error the route did not expect, without the request: its body holds the token. */
  report: (error: unknown) => void
}

const path = '/workflows/tasks'

/**
 * Where an outside executor answers a waiting Task, with no session: the token it was handed is the proof it may.
 * `POST .../workflows/tasks/success` (`{ taskToken, output }`), `.../failure` (`{ taskToken, error, cause }`) and
 * `.../heartbeat` (`{ taskToken }`), exactly as Step Functions' SendTaskSuccess, SendTaskFailure and SendTaskHeartbeat
 * take them, `output` a string of JSON, so a caller written for Step Functions works unchanged. Answers 200 `{}`, or a problem whose title names the refusal as Step Functions does
 * (`TaskTimedOut`, ...). An address refused 30 times this minute waits, before any lookup.
 */
export const taskRoute = ({ answer, report }: TaskRouteInput) => {
  const refusals = createRateLimit()
  const app = new Hono()

  app.onError((error) => {
    if (error instanceof HttpProblem) return problemResponse(error, path)
    report(error)
    return problemResponse(new HttpProblem(500, 'internal-error', 'Internal Server Error', 'The answer could not be taken; send it again'), path)
  })

  app.post('/:call', async (c) => {
    const call = c.req.param('call')
    if (!Object.hasOwn(answerCalls, call)) return c.notFound()
    const address = clientAddress(c.req.raw.headers)
    const wait = refusals.spent(address, refusalsPerMinute)
    if (wait > 0) throw new HttpProblem(429, 'too-many-calls', 'Too Many Requests', 'Too many refused answers from this address; wait a minute', {}, { 'Retry-After': String(wait) })
    const refused = (problem: HttpProblem) => {
      refusals.take(address, refusalsPerMinute)
      return problem
    }
    const bytes = await readBody(c.req.raw, bodyLimit)
    if (!bytes) throw refused(new HttpProblem(413, 'body-too-large', 'Payload Too Large', `The body is over ${bodyLimit} bytes, more than a result a step keeps`))
    let body: unknown
    try {
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw refused(badRequest('invalid-json', 'The body is not JSON'))
    }
    const parsed = answerOf(call as AnswerCall, body)
    if ('problem' in parsed) throw refused(badRequest('invalid-answer', parsed.problem))
    const answered = await answer(parsed.token, parsed.answer)
    if ('error' in answered) {
      const { status, slug } = refusalProblems[answered.error]
      throw refused(new HttpProblem(status, slug, answered.error, answered.message))
    }
    return c.json({})
  })

  return app
}
