import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HttpProblem } from '../problem'
import { readJson } from './read-json'

const post = (body: string) => new Request('http://localhost/', { method: 'POST', body })

const problemOf = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof HttpProblem ? { status: error.status, slug: error.slug, detail: error.detail, ...error.extras } : error))

describe('readJson', () => {
  it('reads the body as JSON, or refuses it as malformed', async () => {
    expect(await readJson(post('{"a":[1]}'))).toEqual({ a: [1] })
    expect(await problemOf(readJson(post('{nope')))).toMatchObject({ status: 400, slug: 'malformed-json' })
    expect(await problemOf(readJson(post('')))).toMatchObject({ status: 400, slug: 'malformed-json' })
  })

  it('checks the body against a Standard Schema, listing every issue by field', async () => {
    const schema = z.object({ email: z.email(), items: z.array(z.object({ quantity: z.number().int().positive() })) })
    const order = await readJson(post('{"email":"ann@example.com","items":[{"quantity":2}],"extra":true}'), schema)
    expect(order).toEqual({ email: 'ann@example.com', items: [{ quantity: 2 }] })

    expect(await problemOf(readJson(post('{"email":"nope","items":[{"quantity":0}]}'), schema))).toMatchObject({
      status: 400,
      slug: 'invalid-body',
      detail: 'The request body is invalid: email: Invalid email address',
      errors: [{ field: 'email', message: 'Invalid email address' }, { field: 'items.0.quantity', message: expect.any(String) }],
    })
    expect(await problemOf(readJson(post('[]'), schema))).toMatchObject({ detail: expect.stringMatching(/^The request body is invalid: Invalid input/) })
  })
})
