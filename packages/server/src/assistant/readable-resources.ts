import type { Meta } from '../meta'
import type { Session } from '../types'
import type { ReadableResources } from './tools'

/** The resources `session` may read or list, leaving out those it may only create in, with their views. */
export const readableResources = async (meta: Pick<Meta, 'forCaller'>, session: Session): Promise<ReadableResources> => {
  const { body } = await meta.forCaller(session)
  const models = body.resources.filter((model) => body.permissions[model.name]?.read)
  const names = new Set(models.map((model) => model.name))
  return { models, views: body.views.filter((view) => names.has(view.resource)) }
}
