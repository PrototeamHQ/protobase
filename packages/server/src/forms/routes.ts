import { Hono } from 'hono'
import { restrictModel, type ViewModel } from '@protobase/schema'
import { anonymousSession } from '../anonymous'
import type { Deps } from '../deps'
import { badRequest, HttpProblem, notFound } from '../problem'
import type { AdminEnv } from '../types'
import { pruneView } from '../view-access'
import { runWrite } from '../write-pipeline'
import type { DeclaredForm } from './check-forms'
import { clientAddress } from './rate-limit'
import type { FormsRuntime } from './runtime'

const refusedProof = {
  invalid: 'The check that you are not a bot failed; send the form again',
  expired: 'The check that you are not a bot expired; send the form again',
  replayed: 'This check was already used; send the form again',
}

// What the page needs to draw the form, and nothing more: the fields as `/meta` would give them, with their hints.
const formPage = (deps: Deps, { form, view }: DeclaredForm) => {
  const entry = deps.registry.find(view.resource)!
  const model = restrictModel(entry.model, { readableFields: form.fields, writableFields: { create: form.fields, update: [] } })
  const pruned = pruneView(view, model, { [model.name]: model })
  const shown: ViewModel = { resource: view.resource, ...(view.names && { names: view.names }), fields: pruned.fields, filters: [], layout: [], actions: [] }
  return { name: form.name, ...(form.title !== undefined && { title: form.title }), fields: form.fields, thanks: form.thanks, resource: model, view: shown }
}

/**
 * Beside the API, without sign-in: `GET <systemPath>/forms/<name>` describes a public form, `GET .../<name>:challenge`
 * hands out a bot check, and `POST .../<name>` with `{ values, proof }` creates the record as the anonymous role, limited
 * to the form's fields, after the rate limit and the check. It answers `204`: the visitor never reads the record back.
 */
export const formRoutes = (deps: Deps, runtime: FormsRuntime) => {
  const app = new Hono<AdminEnv>()
  const find = (target: string) => {
    const colon = target.indexOf(':')
    const declared = runtime.forms.get(colon < 0 ? target : target.slice(0, colon))
    if (!declared) throw notFound(`There is no form "${colon < 0 ? target : target.slice(0, colon)}"`)
    return { declared, action: colon < 0 ? '' : target.slice(colon + 1) }
  }

  app.get('/:target', async (c) => {
    const { declared, action } = find(c.req.param('target'))
    if (action === 'challenge') return c.json(await runtime.challenges.issue(declared.form.name), 200, { 'Cache-Control': 'no-store' })
    if (action !== '') throw notFound(`There is no method ":${action}"`)
    return c.json(formPage(deps, declared))
  })

  app.post('/:target', async (c) => {
    const { declared, action } = find(c.req.param('target'))
    if (action !== '') throw notFound(`There is no method ":${action}"`)
    const { form, view } = declared
    const wait = runtime.limit.take(`${form.name}|${clientAddress(c.req.raw.headers)}`, form.perMinute)
    if (wait > 0) throw new HttpProblem(429, 'too-many-submissions', 'Too Many Requests', 'This form was sent too often; wait a minute and send it again', {}, { 'Retry-After': String(wait) })
    const body = await c.req.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('invalid-submission', 'Send the form as { values, proof }')
    const { values, proof } = body as { values?: unknown; proof?: unknown }
    const verdict = await runtime.challenges.verify(form.name, proof)
    if (verdict !== 'ok') throw badRequest('bot-check-failed', refusedProof[verdict])
    await runWrite(deps, deps.registry.find(view.resource)!, anonymousSession(), { operation: 'create', body: values }, form)
    return c.body(null, 204)
  })

  return app
}
