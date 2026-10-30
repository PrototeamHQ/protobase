import type { Client } from './client'
import type { ResourceRef } from './types'

const nameOf = (resource: ResourceRef) => (typeof resource === 'string' ? resource : resource.toModel().name)

/**
 * One client over the app's own API and the sources it draws resources from: a call about a resource goes to the API
 * that serves it (`sourceOf` gives a source's client, or `undefined` for the app's own), and `meta`, `invoke`, the
 * public forms, `live` and the user's devices, notifications and status go to the app's own. A batch goes to the one API all its writes are for; one that writes to two cannot be atomic, so it is
 * refused before anything is sent.
 */
export const routedClient = (own: Client, sourceOf: (resource: string) => Client | undefined): Client => {
  const to = (resource: ResourceRef) => sourceOf(nameOf(resource)) ?? own
  return {
    list: (resource, params) => to(resource).list(resource, params),
    search: (resource, params) => to(resource).search(resource, params),
    get: (resource, key) => to(resource).get(resource, key),
    create: (resource, body) => to(resource).create(resource, body),
    update: (resource, key, patch, etag) => to(resource).update(resource, key, patch, etag),
    remove: (resource, key, options) => to(resource).remove(resource, key, options),
    undelete: (resource, key) => to(resource).undelete(resource, key),
    generate: (resource, key, action) => to(resource).generate(resource, key, action),
    reveal: (resource, key, field) => to(resource).reveal(resource, key, field),
    history: (resource, key, options) => to(resource).history(resource, key, options),
    comments: (resource, key, options) => to(resource).comments(resource, key, options),
    comment: (resource, key, input) => to(resource).comment(resource, key, input),
    mentionable: (resource, key, query) => to(resource).mentionable(resource, key, query),
    batchWrite: (ops) => {
      const apis = [...new Set(ops.map((op) => to(op.resource)))]
      if (apis.length > 1) return Promise.reject(new Error(`A batch writes to one API, but these writes are for ${[...new Set(ops.map((op) => nameOf(op.resource)))].join(', ')}, which different APIs serve`))
      return (apis[0] ?? own).batchWrite(ops)
    },
    facets: (resource, field, options) => to(resource).facets(resource, field, options),
    aggregate: (resource, params) => to(resource).aggregate(resource, params),
    series: (resource, params) => to(resource).series(resource, params),
    histogram: (resource, field, options) => to(resource).histogram(resource, field, options),
    map: (resource, params) => to(resource).map(resource, params),
    seek: (resource, params) => to(resource).seek(resource, params),
    meta: (etag, options) => own.meta(etag, options),
    invoke: (name, options) => own.invoke(name, options),
    upload: (resource, field, file, options) => to(resource).upload(resource, field, file, options),
    form: (name) => own.form(name),
    formChallenge: (name) => own.formChallenge(name),
    submitForm: (name, values, proof) => own.submitForm(name, values, proof),
    live: (handlers) => own.live(handlers),
    channel: (resource, key) => own.channel(resource, key),
    devices: own.devices,
    notifications: own.notifications,
    status: own.status,
    rings: own.rings,
    callGuests: own.callGuests,
    calls: (resource, key) => to(resource).calls(resource, key),
    watchCalls: (resource, key, handlers) => to(resource).watchCalls(resource, key, handlers),
  }
}
